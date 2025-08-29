
# stdlib
import json
import requests
from datetime import date, timedelta

# Django
from django.contrib.auth.models import AnonymousUser
from django.middleware.csrf import get_token
from django.urls import reverse
from django.utils.timezone import localtime
from django.contrib.humanize.templatetags.humanize import naturaltime
from django.db import transaction
from django.contrib.auth import get_user_model

# DRF
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

# Projet
from .models import Box, Deposit, Song, LocationPoint, DiscoveredSong
from .serializers import BoxSerializer, SongSerializer
from .util import calculate_distance
from utils import (
    NB_POINTS_ADD_SONG,
    NB_POINTS_FIRST_DEPOSIT_USER_ON_BOX,
    NB_POINTS_FIRST_SONG_DEPOSIT_BOX,
    NB_POINTS_FIRST_SONG_DEPOSIT_GLOBAL,
    NB_POINTS_CONSECUTIVE_DAYS_BOX,
    COST_REVEAL_BOX,
)
from api_aggregation.views import ApiAggregation

User = get_user_model()


# -----------------------
# Helpers "business"
# -----------------------

def is_first_user_deposit(user, box) -> bool:
    if not user:
        return False
    return not Deposit.objects.filter(user=user, box_id=box).exists()


def is_first_song_deposit_global_by_title_artist(title: str, artist: str) -> bool:
    return not Deposit.objects.filter(song_id__title=title, song_id__artist=artist).exists()


def is_first_song_deposit_in_box_by_title_artist(title: str, artist: str, box) -> bool:
    return not Deposit.objects.filter(
        box_id=box, song_id__title=title, song_id__artist=artist
    ).exists()


def get_consecutive_deposit_days(user, box) -> int:
    deposits = Deposit.objects.filter(user=user, box_id=box).order_by('-deposited_at')
    current_date = date.today()
    previous_date = current_date - timedelta(days=1)
    consecutive_days = 0
    for deposit in deposits:
        if deposit.deposited_at.date() == previous_date:
            consecutive_days += 1
            previous_date -= timedelta(days=1)
    return consecutive_days


# -----------------------
# Vues
# -----------------------

class BoxMeta(APIView):
    """
    GET /box-management/meta?name=<slug>
    Réponse: { "box": <BoxSerializer>, "deposit_count": <int> }
    - 400 si paramètre 'name' manquant
    - 404 si la boîte n'existe pas
    """
    lookup_url_kwarg = 'name'
    serializer_class = BoxSerializer

    def get(self, request, format=None):
        name = request.GET.get(self.lookup_url_kwarg)
        if not name:
            return Response(
                {"detail": "Paramètre 'name' manquant."},
                status=status.HTTP_400_BAD_REQUEST
            )

        box = Box.objects.filter(url=name).first()
        if not box:
            return Response(
                {"detail": "Boîte introuvable."},
                status=status.HTTP_404_NOT_FOUND
            )

        data = BoxSerializer(box).data
        deposit_count = Deposit.objects.filter(box_id=box.id).count()

        return Response(
            {"box": data, "deposit_count": deposit_count},
            status=status.HTTP_200_OK
        )


class GetBox(APIView):
    lookup_url_kwarg = 'name'
    serializer_class = BoxSerializer

    # --------- Helpers ---------

    @staticmethod
    def _map_user(u):
        if not u or isinstance(u, AnonymousUser):
            return None
    
        display_name = getattr(u, "username", None)
    
        profile_pic_url = None
        if getattr(u, "profile_picture", None):
            try:
                profile_pic_url = u.profile_picture.url
            except Exception:
                profile_pic_url = None
    
        return {
            "id": u.id,
            "username": display_name,
            "profile_pic_url": profile_pic_url,
        }

    @staticmethod
    def _map_song_full(s, include_id=False):
        if not s:
            return {"title": None, "artist": None, "spotify_url": None, "deezer_url": None, "img_url": None}
        payload = {
            "title": getattr(s, "title", None),
            "artist": getattr(s, "artist", None),
            "spotify_url": getattr(s, "spotify_url", None),
            "deezer_url": getattr(s, "deezer_url", None),
            "img_url": getattr(s, "image_url", None),
        }
        if include_id:
            payload["id"] = getattr(s, "id", None)
        return payload

    @staticmethod
    def _map_song_teaser(s):
        # Teaser: id + image + cost=300
        return {
            "img_url": getattr(s, "image_url", None),
            "id": getattr(s, "id", None),
            "cost": 300,
        }

    @staticmethod
    def _naturaltime(dt):
        if not dt:
            return None
        text = naturaltime(localtime(dt))
        # Coupe au premier séparateur "," (s’il existe)
        return text.split(",")[0].strip()
    
    def _build_deposits_payload(self, box, user, limit=10):
        qs = (
            Deposit.objects
            .filter(box_id=box)
            .select_related('song_id', 'user')
            .order_by('-deposited_at', '-id')[:limit]
        )
        deposits = list(qs)
        if not deposits:
            return []

        discovered_by_dep = {}
        authed = bool(user and not isinstance(user, AnonymousUser) and getattr(user, "is_authenticated", False))
        if authed and len(deposits) > 1:
            dep_ids = [d.id for d in deposits[1:]]
            for ds in DiscoveredSong.objects.filter(user_id=user, deposit_id__in=dep_ids):
                discovered_by_dep[ds.deposit_id_id] = ds

        out = []
        for idx, d in enumerate(deposits):
            s = d.song_id
            u = d.user
            user_payload = self._map_user(u)

            if idx == 0:
                song_payload = self._map_song_full(s, include_id=False)
                obj = {
                    "deposit_id": d.id,
                    "deposit_date": self._naturaltime(getattr(d, "deposited_at", None)),
                    "song": song_payload,
                    "user": user_payload,
                }
            else:
                if authed:
                    ds = discovered_by_dep.get(d.id)
                    already_discovered = bool(ds)
                    if already_discovered:
                        song_payload = self._map_song_full(s, include_id=True)
                        discovered_at = self._naturaltime(getattr(ds, "discovered_at", None))
                    else:
                        song_payload = self._map_song_teaser(s)
                        discovered_at = None
                    obj = {
                        "deposit_id": d.id,
                        "deposit_date": self._naturaltime(getattr(d, "deposited_at", None)),
                        "already_discovered": already_discovered,
                        "discovered_at": discovered_at,
                        "song": song_payload,
                        "user": user_payload,
                    }
                else:
                    song_payload = self._map_song_teaser(s)
                    obj = {
                        "deposit_id": d.id,
                        "deposit_date": self._naturaltime(getattr(d, "deposited_at", None)),
                        "already_discovered": False,
                        "discovered_at": None,
                        "song": song_payload,
                        "user": user_payload,
                    }

            out.append(obj)

        return out

    # --------- GET ---------
    def get(self, request, format=None):
        name = request.GET.get(self.lookup_url_kwarg)
        if name is None:
            return Response({'Bad Request': 'Name of the box not found in request'}, status=status.HTTP_400_BAD_REQUEST)

        box_qs = Box.objects.filter(url=name)
        if not box_qs.exists():
            return Response({'Bad Request': 'Invalid Box Name'}, status=status.HTTP_404_NOT_FOUND)

        box = box_qs[0]
        data = BoxSerializer(box).data

        deposit_count = Deposit.objects.filter(box_id=box.id).count()
        deposits_payload = self._build_deposits_payload(box, request.user, limit=10)

        resp = {
            'deposit_count': deposit_count,
            'box': data,
            'deposits': deposits_payload,
            'reveal_cost': int(COST_REVEAL_BOX),
        }
        return Response(resp, status=status.HTTP_200_OK)

    # --------- POST (création d’un dépôt) ---------
    def post(self, request, format=None):
        """
        Étapes simplifiées :
          1) Upsert Song
          2) Créer Deposit (dans la même transaction DB)
          3) Créditer les points via /users/add-points (best-effort)
          4) Répondre : {"successes": [...], "added_deposit": {...}, "points_balance": <int|None>}
        """
        # --- 0) Lecture & validations minimales
        option = request.data.get('option') or {}
        box_name = request.data.get('boxName')
        if not box_name:
            return Response({"detail": "boxName manquant"}, status=status.HTTP_400_BAD_REQUEST)

        box = Box.objects.filter(url=box_name).first()
        if not box:
            return Response({"detail": "Boîte introuvable"}, status=status.HTTP_404_NOT_FOUND)

        song_name = (option.get('name') or "").strip()
        song_author = (option.get('artist') or "").strip()
        song_platform_id = option.get('platform_id')  # 1=Spotify, 2=Deezer
        incoming_url = option.get('url')
        if not song_name or not song_author:
            return Response({"detail": "Titre et artiste requis"}, status=status.HTTP_400_BAD_REQUEST)

        # User courant (peut être anonyme)
        user = request.user if not isinstance(request.user, AnonymousUser) else None

        # --- 1) Calcul des succès / points
        successes: dict = {}
        points_to_add = NB_POINTS_ADD_SONG
        successes['default_deposit'] = {
            'name': "Pépite",
            'desc': "Tu as partagé une chanson",
            'points': NB_POINTS_ADD_SONG
          
        }

        if user and is_first_user_deposit(user, box):
            points_to_add += NB_POINTS_FIRST_DEPOSIT_USER_ON_BOX
            successes['first_user_deposit_box'] = {
                'name': "Conquérant",
                'desc': "Tu n'as jamais déposé ici",
                'points': NB_POINTS_FIRST_DEPOSIT_USER_ON_BOX
            }

        if is_first_song_deposit_in_box_by_title_artist(song_name, song_author, box):
            points_to_add += NB_POINTS_FIRST_SONG_DEPOSIT_BOX
            successes['first_song_deposit'] = {
                'name': "Far West",
                'desc': "Ce son n'a jamais été déposé ici",
                'points': NB_POINTS_FIRST_SONG_DEPOSIT_BOX
            }
            if is_first_song_deposit_global_by_title_artist(song_name, song_author):
                points_to_add += NB_POINTS_FIRST_SONG_DEPOSIT_GLOBAL
                successes['first_song_deposit_global'] = {
                    'name': "Far West",
                    'desc': "Ce son n'a jamais été déposé sur notre réseau",
                    'points': NB_POINTS_FIRST_SONG_DEPOSIT_GLOBAL
                }

        nb_consecutive_days: int = get_consecutive_deposit_days(user, box) if user else 0
        if nb_consecutive_days:
            consecutive_days_points = nb_consecutive_days * NB_POINTS_CONSECUTIVE_DAYS_BOX
            points_to_add += consecutive_days_points
            nb_consecutive_days += 1
            successes['consecutive_days'] = {
                'name': "L'amour fou",
                'desc': f"{nb_consecutive_days} jours consécutifs avec cette boite",
                'points': consecutive_days_points
            }

        successes['points_total'] = {
            'name': "Total",
            'desc': "Points gagnés pour ce dépôt",
            'points': points_to_add
        }

        # --- 2) Upsert Song + 3) Créer Deposit (atomique ensemble)
        with transaction.atomic():
            try:
                song = Song.objects.get(title__iexact=song_name, artist__iexact=song_author)
                song.n_deposits = (song.n_deposits or 0) + 1
            except Song.DoesNotExist:
                song = Song(
                    song_id=option.get('id'),
                    title=song_name,
                    artist=song_author,
                    image_url=option.get('image_url') or "",
                    duration=option.get('duration') or 0,
                )

            # URL de la plateforme utilisée
            if song_platform_id == 1 and incoming_url:
                song.spotify_url = incoming_url
            elif song_platform_id == 2 and incoming_url:
                song.deezer_url = incoming_url

            # Compléter l’autre URL via agrégateur (best-effort)
            try:
                request_platform = None
                if song_platform_id == 1 and not song.deezer_url:
                    request_platform = "deezer"
                elif song_platform_id == 2 and not song.spotify_url:
                    request_platform = "spotify"

                if request_platform:
                    aggreg_url = request.build_absolute_uri(reverse('api_agg:aggreg'))
                    payload = {
                        "song": {"title": song.title, "artist": song.artist, "duration": song.duration},
                        "platform": request_platform,
                    }
                    headers = {"Content-Type": "application/json", "X-CSRFToken": get_token(request)}
                    r = requests.post(
                        aggreg_url,
                        data=json.dumps(payload),
                        headers=headers,
                        cookies=request.COOKIES,
                        timeout=6,
                    )
                    if r.ok:
                        other_url = r.json()
                        if isinstance(other_url, str):
                            if request_platform == "deezer":
                                song.deezer_url = other_url
                            elif request_platform == "spotify":
                                song.spotify_url = other_url
            except Exception:
                pass  # best-effort

            song.save()
            new_deposit = Deposit.objects.create(song_id=song, box_id=box, user=user)

        # --- 4) Créditer les points via endpoint (best-effort) et récupérer le solde
        points_balance = None
        try:
            if user and getattr(user, "is_authenticated", False):
                add_points_url = request.build_absolute_uri(reverse('add-points'))
                csrftoken_cookie = request.COOKIES.get('csrftoken')
                csrftoken_header = csrftoken_cookie or get_token(request)

                headers_bg = {
                    "Content-Type": "application/json",
                    "X-CSRFToken": csrftoken_header,
                    "Referer": request.build_absolute_uri('/'),
                }
                r = requests.post(
                    add_points_url,
                    cookies=request.COOKIES,
                    headers=headers_bg,
                    data=json.dumps({"points": points_to_add}),
                    timeout=4,
                )
                if r.ok:
                    try:
                        user.refresh_from_db(fields=["points"])
                    except Exception:
                        user.refresh_from_db()
                    points_balance = getattr(user, "points", None)
        except Exception:
            pass  # silencieux

        # --- 5) Réponse
        added_deposit = {
            "deposit_id": new_deposit.id,
            "deposit_date": self._naturaltime(getattr(new_deposit, "deposited_at", None)),
            "song": self._map_song_full(song, include_id=False),
            "user": self._map_user(user),
        }

        response = {
            "successes": list(successes.values()),
            "added_deposit": added_deposit,
            "points_balance": points_balance, 
        }
        return Response(response, status=status.HTTP_200_OK)


class Location(APIView):
    def post(self, request):
        latitude = float(request.data.get('latitude'))
        longitude = float(request.data.get('longitude'))
        box = request.data.get('box')
        box = Box.objects.filter(id=box.get('id')).get()

        points = LocationPoint.objects.filter(box_id=box)
        if not points.exists():
            return Response({'error': 'No location points for this box'}, status=status.HTTP_404_NOT_FOUND)

        is_valid_location = False
        for point in points:
            max_dist = point.dist_location
            target_latitude = point.latitude
            target_longitude = point.longitude
            distance = calculate_distance(latitude, longitude, target_latitude, target_longitude)
            if distance <= max_dist:
                is_valid_location = True
                break

        if is_valid_location:
            return Response({'valid': True}, status=status.HTTP_200_OK)
        else:
            return Response({'valid': False, 'lat': latitude, 'long': longitude}, status=status.HTTP_403_FORBIDDEN)


class CurrentBoxManagement(APIView):
    def get(self, request, format=None):
        try:
            current_box_name = request.session['current_box_name']
            return Response({'current_box_name': current_box_name}, status=status.HTTP_200_OK)
        except KeyError:
            return Response({'error': "La clé current_box_name n'existe pas"}, status=status.HTTP_400_BAD_REQUEST)

    def post(self, request, format=None):
        if 'current_box_name' not in request.data:
            return Response({'errors': "Aucun nom de boîte n'a été fournie."}, status=status.HTTP_401_UNAUTHORIZED)
        current_box_name = request.data.get('current_box_name')
        try:
            request.session['current_box_name'] = current_box_name
            request.session.modified = True
            return Response({'status': 'Le nom de la boîte actuelle a été modifié avec succès.'}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'errors': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ManageDiscoveredSongs(APIView):
    """
    POST: enregistrer une découverte pour un dépôt donné (deposit_id) et un type (main/revealed).
    GET : renvoie des **sessions** de découvertes, groupées par connexion à une boîte.

    - Une session commence à un DiscoveredSong(type="main") (toutes boîtes confondues, tri desc),
      et contient les "revealed" de la **même boîte** découverts après ce main,
      jusqu'au prochain "main" (n'importe quelle boîte) **ou** 3600s après le main (le premier des deux).

    - Edge case: s'il existe des "revealed" sans "main" précédent proche, on crée une **session sans main**,
      qui regroupe les revealed **de la même boîte** qui suivent (jusqu'au prochain main global ou 3600s depuis
      le **premier revealed** de cette session).

    Pagination par sessions: ?limit=10&offset=0
    Réponse:
    {
      "sessions": [
        {
          "session_id": "<id technique (id du main ou 'orph-<idx>')>",
          "box": { "id": <int>, "name": "...", "url": "..." },
          "started_at": "ISO-8601",
          "deposits": [ { ... comme défini ci-dessous ... } ]
        }
      ],
      "limit": <int>,
      "offset": <int>,
      "has_more": <bool>,
      "next_offset": <int>
    }
    """

    def post(self, request):
        user = request.user
        if not user.is_authenticated:
            return Response(
                {'error': 'Vous devez être connecté pour effectuer cette action.'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        deposit_id = request.data.get('deposit_id')
        if not deposit_id:
            return Response({'error': 'Identifiant de dépôt manquant.'}, status=status.HTTP_400_BAD_REQUEST)

        discovered_type = request.data.get('discovered_type') or "revealed"
        if discovered_type not in ("main", "revealed"):
            discovered_type = "revealed"

        try:
            deposit = Deposit.objects.select_related('song_id').get(pk=deposit_id)
        except Deposit.DoesNotExist:
            return Response({'error': "Dépôt introuvable."}, status=status.HTTP_404_NOT_FOUND)

        if DiscoveredSong.objects.filter(user_id=user, deposit_id=deposit).exists():
            return Response({'error': 'Ce dépôt est déjà découvert.'}, status=status.HTTP_400_BAD_REQUEST)

        DiscoveredSong.objects.create(
            user_id=user,
            deposit_id=deposit,
            discovered_type=discovered_type
        )
        return Response({'success': True}, status=status.HTTP_200_OK)

    def get(self, request):
        user = request.user
        if not user.is_authenticated:
            return Response(
                {'error': 'Vous devez être connecté pour effectuer cette action.'},
                status=status.HTTP_401_UNAUTHORIZED
            )
    
        # --- Params pagination (par sessions)
        try:
            limit = int(request.GET.get("limit", 10))
        except Exception:
            limit = 10
        try:
            offset = int(request.GET.get("offset", 0))
        except Exception:
            offset = 0
        limit = 10 if limit <= 0 else limit
        offset = 0 if offset < 0 else offset
    
        # --- Helpers mapping (alignés sur GetBox)
        def map_user(u):
            if not u or isinstance(u, AnonymousUser):
                return None
            full_name = u.get_full_name() if hasattr(u, "get_full_name") else ""
            display_name = full_name or getattr(u, "name", None) or getattr(u, "username", None)
            profile_pic_url = None
            if getattr(u, "profile_picture", None):
                try:
                    profile_pic_url = u.profile_picture.url
                except Exception:
                    profile_pic_url = None
            return {"id": getattr(u, "id", None), "name": display_name, "profile_pic_url": profile_pic_url}
    
        def map_song_full(s, include_id=True):
            if not s:
                return {"title": None, "artist": None, "spotify_url": None, "deezer_url": None, "img_url": None}
            payload = {
                "title": getattr(s, "title", None),
                "artist": getattr(s, "artist", None),
                "spotify_url": getattr(s, "spotify_url", None),
                "deezer_url": getattr(s, "deezer_url", None),
                "img_url": getattr(s, "image_url", None),
            }
            if include_id:
                payload["id"] = getattr(s, "id", None)
            return payload
    
        def deposit_payload(ds_obj):
            dep = ds_obj.deposit_id
            s = dep.song_id
            u = dep.user
            return {
                "type": ds_obj.discovered_type,
                "discovered_at": ds_obj.discovered_at.isoformat(),
                "deposit_id": dep.id,
                # NB: date d’ajout dans la box — on ne s’en sert pas pour l’ordre,
                # mais on la garde pour compat :
                "deposit_date": naturaltime(localtime(getattr(dep, "deposited_at", None))) if getattr(dep, "deposited_at", None) else None,
                "song": map_song_full(s, include_id=True),
                "user": map_user(u),
            }
    
        # --- 1) Flux complet trié par discovered_at ASC (chronologie réelle)
        events = list(
            DiscoveredSong.objects
            .filter(user_id=user)
            .select_related('deposit_id', 'deposit_id__song_id', 'deposit_id__user', 'deposit_id__box_id')
            .order_by('discovered_at', 'id')  # ASC, puis tie-break sur id
        )
    
        # Indices des mains (ASC)
        main_indices = [i for i, e in enumerate(events) if e.discovered_type == "main"]
    
        sessions_all = []
        consumed = [False] * len(events)
    
        # --- 2) Sessions pilotées par 'main'
        for idx, mi in enumerate(main_indices):
            main_ds = events[mi]
            box = main_ds.deposit_id.box_id
            start = main_ds.discovered_at
            deadline = start + timedelta(seconds=3600)
            # borne supérieure = index du prochain main (ou fin de liste)
            end = main_indices[idx + 1] if (idx + 1) < len(main_indices) else len(events)
    
            # Dépôt 'main' (toujours en tête, puis revealed par ordre chronologique)
            deposits = [deposit_payload(main_ds)]
            consumed[mi] = True
    
            # revealed après le main, même box, <= +1h, avant le prochain main
            for j in range(mi + 1, end):
                ds = events[j]
                if ds.discovered_type != "revealed":
                    continue
                if ds.deposit_id.box_id_id != box.id:
                    continue
                if ds.discovered_at <= deadline:
                    deposits.append(deposit_payload(ds))
                    consumed[j] = True
    
            sessions_all.append({
                "session_id": str(main_ds.id),
                "box": {"id": box.id, "name": box.name, "url": box.url},
                "started_at": start.isoformat(),
                "deposits": deposits,  # ordre chrono: main puis revealed de la session
            })
    
        # --- 3) Sessions orphelines (revealed restants), groupées par fenêtre [start, start+1h] et même box,
        #         et stoppées par le prochain main global.
        # Pour accélérer : prochaine position d’un main pour un index donné
        next_main_pos_from = [None] * len(events)
        next_idx = None
        for i in range(len(events) - 1, -1, -1):  # parcours inverse pour pré-calcul
            next_main_pos_from[i] = next_idx
            if events[i].discovered_type == "main":
                next_idx = i
    
        orph_counter = 0
        i = 0
        while i < len(events):
            if consumed[i] or events[i].discovered_type != "revealed":
                i += 1
                continue
    
            # Démarre une session orpheline à partir de ce revealed
            start_ds = events[i]
            box = start_ds.deposit_id.box_id
            start = start_ds.discovered_at
            deadline = start + timedelta(seconds=3600)
            stop_at = next_main_pos_from[i] if next_main_pos_from[i] is not None else len(events)
    
            deposits = [deposit_payload(start_ds)]
            consumed[i] = True
    
            j = i + 1
            while j is not None and j < stop_at:
                if consumed[j]:
                    j += 1
                    continue
                ds2 = events[j]
                # on ne prend que revealed de la même box et <= +1h depuis le premier
                if ds2.discovered_type == "revealed" and ds2.deposit_id.box_id_id == box.id and ds2.discovered_at <= deadline:
                    deposits.append(deposit_payload(ds2))
                    consumed[j] = True
                    j += 1
                    continue
                # si c’est un main, on s’arrête (prochain main global)
                if ds2.discovered_type == "main":
                    break
                # sinon (revealed autre box / hors fenêtre), on le saute pour cette session
                j += 1
    
            sessions_all.append({
                "session_id": f"orph-{orph_counter}",
                "box": {"id": box.id, "name": box.name, "url": box.url},
                "started_at": start.isoformat(),
                "deposits": deposits,  # ordre chrono
            })
            orph_counter += 1
            i = j if j is not None else (i + 1)
    
        # --- 4) Tri global des sessions par started_at DESC + pagination par sessions
        sessions_all.sort(key=lambda s: s["started_at"], reverse=True)
    
        total_sessions = len(sessions_all)
        slice_start = offset
        slice_end = offset + limit
        sessions_page = sessions_all[slice_start:slice_end]
        has_more = slice_end < total_sessions
        next_offset = slice_end if has_more else slice_end  # avance « plat »
    
        payload = {
            "sessions": sessions_page,
            "limit": limit,
            "offset": offset,
            "has_more": has_more,
            "next_offset": next_offset,
        }
        return Response(payload, status=status.HTTP_200_OK)

class RevealSong(APIView):
    """
    POST /box-management/revealSong
    Body: { "deposit_id": <int> }
    200: { "song": {...}, "points_balance": <int> }
    401 si non authentifié
    400 {error:"insufficient_funds", message:"Tu n’as pas assez de crédit pour révéler cette pépite"}
    404 si dépôt/chanson introuvable
    502 si échec du débit ou de l’enregistrement de découverte
    """
    def post(self, request, format=None):
        # 1) Auth requise
        user = request.user
        if not user.is_authenticated:
            return Response({"detail": "Authentification requise."}, status=status.HTTP_401_UNAUTHORIZED)

        # 2) Paramètres
        deposit_id = request.data.get("deposit_id")
        if not deposit_id:
            return Response({"detail": "deposit_id manquant"}, status=status.HTTP_400_BAD_REQUEST)

        # 3) Récupérer le dépôt + chanson
        try:
            deposit = Deposit.objects.select_related("song_id").get(pk=deposit_id)
        except Deposit.DoesNotExist:
            return Response({"detail": "Dépôt introuvable"}, status=status.HTTP_404_NOT_FOUND)

        song = deposit.song_id
        if not song:
            return Response({"detail": "Chanson introuvable pour ce dépôt"}, status=status.HTTP_404_NOT_FOUND)

        # 4) Coût (source de vérité côté serveur)
        cost = int(COST_REVEAL_BOX)

        # 5) Vérifier solde utilisateur
        try:
            user.refresh_from_db(fields=["points"])
        except Exception:
            user.refresh_from_db()
        if getattr(user, "points", 0) < cost:
            return Response(
                {"error": "insufficient_funds", "message": "Tu n’as pas assez de crédit pour révéler cette pépite"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Prépare en-têtes/cookies CSRF corrects pour appels internes
        csrf_token = get_token(request)
        origin = request.build_absolute_uri("/")  # ex: https://mon-domaine/
        headers_bg = {
            "Content-Type": "application/json",
            "X-CSRFToken": csrf_token,
            "Referer": origin,                 # nécessaire en HTTPS
            "Origin": origin.rstrip("/"),      # idem
        }
        cookies = request.COOKIES  # contient sessionid + csrftoken

        # 6) Débiter les points via /users/add-points
        try:
            add_points_url = request.build_absolute_uri(reverse('add-points'))  # /users/add-points
            r = requests.post(
                add_points_url,
                cookies=cookies,
                headers=headers_bg,
                data=json.dumps({"points": -cost}),
                timeout=4,
            )
            if not r.ok:
                return Response(
                    {"detail": "Oops une erreur s’est produite, réessayez dans quelques instants."},
                    status=status.HTTP_502_BAD_GATEWAY,
                )
        except Exception:
            return Response(
                {"detail": "Oops une erreur s’est produite, réessayez dans quelques instants."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        # 7) Enregistrer la découverte via /box-management/discovered-songs
        try:
            discover_url = request.build_absolute_uri("/box-management/discovered-songs")
            r2 = requests.post(
                discover_url,
                cookies=cookies,
                headers=headers_bg,
                data=json.dumps({"deposit_id": deposit_id, "discovered_type": "revealed"}),
                timeout=4,
            )
            # Tolérer "déjà découvert" (400), mais bloquer autres erreurs (403 CSRF, etc.)
            if not r2.ok and r2.status_code != 400:
                return Response(
                    {"detail": "Erreur lors de l’enregistrement de la découverte."},
                    status=status.HTTP_502_BAD_GATEWAY,
                )
        except Exception:
            return Response(
                {"detail": "Erreur lors de l’enregistrement de la découverte."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        # 8) Points à jour
        try:
            user.refresh_from_db(fields=["points"])
        except Exception:
            user.refresh_from_db()
        points_balance = getattr(user, "points", None)

        # 9) Réponse
        data = {
            "song": {
                "title": song.title,
                "artist": song.artist,
                "spotify_url": song.spotify_url,
                "deezer_url": song.deezer_url,
            },
            "points_balance": points_balance,
        }
        return Response(data, status=status.HTTP_200_OK)


class UserDepositsView(APIView):
    # Laisse vide pour accès public, ou mets [IsAuthenticated] si tu veux restreindre
    permission_classes = []

    def get(self, request):
        user_id_raw = (request.GET.get("user_id") or "").strip()

        # 1) Validation présence + format
        if not user_id_raw:
            return Response(
                {"errors": ["Pas d'utilisateur spécifié"]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            user_id = int(user_id_raw)
        except (TypeError, ValueError):
            return Response(
                {"errors": ["Pas d'utilisateur spécifié"]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 2) Lookup utilisateur ciblé
        target_user = CustomUser.objects.filter(id=user_id).first()
        if not target_user:
            return Response(
                {"errors": ["Utilisateur inexistant"]},
                status=status.HTTP_404_NOT_FOUND,
            )

        # 3) Détecte la FK vers Song et prépare la requête
        rel_candidates = [
            f.name
            for f in Deposit._meta.get_fields()
            if getattr(f, "is_relation", False)
            and getattr(f, "many_to_one", False)
            and not getattr(f, "auto_created", False)
        ]
        has_song_fk = "song" in rel_candidates

        qs = Deposit.objects.filter(user=target_user)

        # 4) Ordre robuste selon les champs existants (évite FieldError → 500)
        model_field_names = {
            f.name for f in Deposit._meta.get_fields()
            if not getattr(f, "many_to_many", False)
        }
        if "deposited_at" in model_field_names:
            qs = qs.order_by("-deposited_at")
        elif "deposit_date" in model_field_names:
            qs = qs.order_by("-deposit_date")
        elif "created_at" in model_field_names:
            qs = qs.order_by("-created_at")
        else:
            qs = qs.order_by("-id")

        if has_song_fk:
            qs = qs.select_related("song")

        # 5) Helpers sûrs
        def pick(obj, *names):
            for n in names:
                if obj is not None and hasattr(obj, n):
                    val = getattr(obj, n)
                    if val not in (None, ""):
                        return val
            return None

        # Photo de profil : .url seulement si un fichier est présent
        pf = getattr(target_user, "profile_picture", None)
        profile_url = None
        if pf and getattr(pf, "name", ""):
            try:
                profile_url = pf.url
            except Exception:
                profile_url = None

        # 6) Sérialisation → shape attendu par le front (Deposit.js)
        items = []
        for d in qs[:500]:
            s = getattr(d, "song", None) if has_song_fk else None

            title = pick(s, "title", "name") or pick(d, "song_title")
            artist = pick(s, "artist", "artist_name") or pick(d, "song_artist")
            img = (
                pick(s, "img_url", "image_url", "cover_url")
                or pick(d, "song_img_url", "song_image_url")
            )

            # date: supporte datetime, date ou string
            dep_dt = (
                getattr(d, "deposited_at", None)
                or getattr(d, "deposit_date", None)
                or getattr(d, "created_at", None)
            )
            if hasattr(dep_dt, "isoformat"):
                dep_str = dep_dt.isoformat()
            else:
                dep_str = str(dep_dt) if dep_dt else None

            items.append({
                "deposit_id": getattr(d, "id", None),
                "deposit_date": dep_str,
                "user": {
                    "username": target_user.username,
                    "profile_pic_url": profile_url,
                },
                "song": {
                    "title": title,
                    "artist": artist,
                    "img_url": img,
                },
            })

        return Response(items, status=status.HTTP_200_OK)



















