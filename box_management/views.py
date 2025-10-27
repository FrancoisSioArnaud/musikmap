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
from django.db.models import Count
from django.contrib.auth import get_user_model

# DRF
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated





from users.models import CustomUser
from .models import Deposit  # + Song si tu en as besoin ailleurs


# Projet
from .models import (
    Box, Deposit, Song, LocationPoint, DiscoveredSong,
    Emoji, EmojiRight, Reaction
)
from .serializers import BoxSerializer, SongSerializer, EmojiSerializer
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


# --- Helper pour réactions ---
def _reactions_summary_for_deposits(dep_ids):
    """Retourne {deposit_id: [{'emoji': '🔥', 'count': 3}, ...]}"""
    summary = {d: [] for d in dep_ids}
    if not dep_ids:
        return summary

    qs = (
        Reaction.objects
        .filter(deposit_id__in=dep_ids)
        .values('deposit_id', 'emoji__char')
        .annotate(count=Count('id'))
    )
    for row in qs:
        did = row['deposit_id']           # int (colonne _id)
        emoji_char = row['emoji__char']
        cnt = row['count']
        summary.setdefault(did, []).append({"emoji": emoji_char, "count": cnt})

    # Tri par count desc
    for did in summary:
        summary[did].sort(key=lambda x: x["count"], reverse=True)
    return summary


# -----------------------
# Vues
# -----------------------

class BoxMeta(APIView):
    lookup_url_kwarg = 'name'
    serializer_class = BoxSerializer

    def get(self, request, format=None):
        name = request.GET.get(self.lookup_url_kwarg)
        if not name:
            return Response({"detail": "Paramètre 'name' manquant."}, status=status.HTTP_400_BAD_REQUEST)

        box = Box.objects.filter(url=name).first()
        if not box:
            return Response({"detail": "Boîte introuvable."}, status=status.HTTP_404_NOT_FOUND)

        data = BoxSerializer(box).data
        deposit_count = Deposit.objects.filter(box_id=box.id).count()

        return Response({"box": data, "deposit_count": deposit_count}, status=status.HTTP_200_OK)


class GetBox(APIView):
    lookup_url_kwarg = 'name'
    serializer_class = BoxSerializer

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
        return {"id": u.id, "username": display_name, "profile_pic_url": profile_pic_url}

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
        return {"img_url": getattr(s, "image_url", None), "id": getattr(s, "id", None), "cost": 300}

    @staticmethod
    def _naturaltime(dt):
        if not dt:
            return None
        text = naturaltime(localtime(dt))
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

        dep_ids = [d.id for d in deposits]
        reactions_by_dep = _reactions_summary_for_deposits(dep_ids)

        # réactions utilisateur courant
        my_reac_by_dep = {}
        authed = bool(user and not isinstance(user, AnonymousUser) and getattr(user, "is_authenticated", False))
        if authed:
            for r in Reaction.objects.filter(user=user, deposit_id__in=dep_ids).select_related('emoji'):
                # r.deposit_id est déjà un int (colonne FK)
                my_reac_by_dep[r.deposit_id] = {
                    "emoji": r.emoji.char,
                    "reacted_at": r.created_at.isoformat(),
                }

        discovered_by_dep = {}
        if authed and len(deposits) > 1:
            dep_ids_sub = [d.id for d in deposits[1:]]
            for ds in DiscoveredSong.objects.filter(user_id=user, deposit_id__in=dep_ids_sub):
                # ds.deposit_id est l'objet Deposit (car le champ s'appelle "deposit_id")
                discovered_by_dep[ds.deposit_id.id] = ds

        out = []
        for idx, d in enumerate(deposits):
            s = d.song_id
            u = d.user
            user_payload = self._map_user(u)

            base_obj = {
                "deposit_id": d.id,
                "deposit_date": self._naturaltime(getattr(d, "deposited_at", None)),
                "user": user_payload,
                "reactions_summary": reactions_by_dep.get(d.id, []),
            }
            if authed:
                base_obj["my_reaction"] = my_reac_by_dep.get(d.id)

            if idx == 0:
                song_payload = self._map_song_full(s, include_id=False)
                base_obj["song"] = song_payload
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
                    base_obj.update({
                        "already_discovered": already_discovered,
                        "discovered_at": discovered_at,
                        "song": song_payload,
                    })
                else:
                    song_payload = self._map_song_teaser(s)
                    base_obj.update({
                        "already_discovered": False,
                        "discovered_at": None,
                        "song": song_payload,
                    })
            out.append(base_obj)

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

        nb_consecutive_days: int = get_consecutive_deposit_days(user, box) if user else 0
        if nb_consecutive_days:
            consecutive_days_points = nb_consecutive_days * NB_POINTS_CONSECUTIVE_DAYS_BOX
            points_to_add += consecutive_days_points
            nb_consecutive_days += 1
            successes['consecutive_days'] = {
                'name': "Amour fou",
                'desc': f"{nb_consecutive_days} jours consécutifs avec cette boite",
                'points': consecutive_days_points,
                'emoji': "🔥"
        }

        if user and is_first_user_deposit(user, box):
            points_to_add += NB_POINTS_FIRST_DEPOSIT_USER_ON_BOX
            successes['first_user_deposit_box'] = {
                'name': "Explorateur·ice",
                'desc': "Tu n'as jamais déposé ici",
                'points': NB_POINTS_FIRST_DEPOSIT_USER_ON_BOX,
                'emoji': "🔍"
            }

        if is_first_song_deposit_in_box_by_title_artist(song_name, song_author, box):
            points_to_add += NB_POINTS_FIRST_SONG_DEPOSIT_BOX
            successes['first_song_deposit'] = {
                'name': "Far West",
                'desc': "Cette chanson n'a jamais été déposé dans cette boîte",
                'points': NB_POINTS_FIRST_SONG_DEPOSIT_BOX,
                'emoji': "🤠"
            }
        if is_first_song_deposit_global_by_title_artist(song_name, song_author):
            points_to_add += NB_POINTS_FIRST_SONG_DEPOSIT_GLOBAL
            successes['first_song_deposit_global'] = {
                'name': "Preums",
                'desc': "Cette chanson n'a jamais été déposée dans aucune boîte",
                'points': NB_POINTS_FIRST_SONG_DEPOSIT_GLOBAL,
                'emoji': "🥇"
            }

        successes['default_deposit'] = {
            'name': "Pépite",
            'desc': "Tu as partagé une chanson",
            'points': NB_POINTS_ADD_SONG,
            'emoji': "💎"
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
            end = main_indices[idx + 1] if (idx + 1) < len(main_indices) else len(events)

            deposits = [deposit_payload(main_ds)]
            consumed[mi] = True

            # revealed après le main, même box, <= +1h, avant le prochain main
            for j in range(mi + 1, end):
                ds = events[j]
                if ds.discovered_type != "revealed":
                    continue
                if ds.deposit_id.box_id.id != box.id:
                    continue
                if ds.discovered_at <= deadline:
                    deposits.append(deposit_payload(ds))
                    consumed[j] = True

            sessions_all.append({
                "session_id": str(main_ds.id),
                "box": {"id": box.id, "name": box.name, "url": box.url},
                "started_at": start.isoformat(),
                "deposits": deposits,
            })

        # --- 3) Sessions orphelines
        next_main_pos_from = [None] * len(events)
        next_idx = None
        for i in range(len(events) - 1, -1, -1):
            next_main_pos_from[i] = next_idx
            if events[i].discovered_type == "main":
                next_idx = i

        orph_counter = 0
        i = 0
        while i < len(events):
            if consumed[i] or events[i].discovered_type != "revealed":
                i += 1
                continue

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
                if ds2.discovered_type == "revealed" and ds2.deposit_id.box_id.id == box.id and ds2.discovered_at <= deadline:
                    deposits.append(deposit_payload(ds2))
                    consumed[j] = True
                    j += 1
                    continue
                if ds2.discovered_type == "main":
                    break
                j += 1

            sessions_all.append({
                "session_id": f"orph-{orph_counter}",
                "box": {"id": box.id, "name": box.name, "url": box.url},
                "started_at": start.isoformat(),
                "deposits": deposits,
            })
            orph_counter += 1
            i = j if j is not None else (i + 1)

        # --- 4) Tri global et pagination
        sessions_all.sort(key=lambda s: s["started_at"], reverse=True)

        total_sessions = len(sessions_all)
        slice_start = offset
        slice_end = offset + limit
        sessions_page = sessions_all[slice_start:slice_end]
        has_more = slice_end < total_sessions
        next_offset = slice_end if has_more else slice_end

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

        # 4) Coût
        cost = int(COST_REVEAL_BOX)

        # 5) Vérifier solde
        try:
            user.refresh_from_db(fields=["points"])
        except Exception:
            user.refresh_from_db()
        if getattr(user, "points", 0) < cost:
            return Response(
                {"error": "insufficient_funds", "message": "Tu n’as pas assez de crédit pour révéler cette pépite"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        csrf_token = get_token(request)
        origin = request.build_absolute_uri("/")
        headers_bg = {
            "Content-Type": "application/json",
            "X-CSRFToken": csrf_token,
            "Referer": origin,
            "Origin": origin.rstrip("/"),
        }
        cookies = request.COOKIES

        # 6) Débiter
        try:
            add_points_url = request.build_absolute_uri(reverse('add-points'))
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

        # 7) Enregistrer découverte
        try:
            discover_url = request.build_absolute_uri("/box-management/discovered-songs")
            r2 = requests.post(
                discover_url,
                cookies=cookies,
                headers=headers_bg,
                data=json.dumps({"deposit_id": deposit_id, "discovered_type": "revealed"}),
                timeout=4,
            )
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

        # 8) Solde à jour
        try:
            user.refresh_from_db(fields=["points"])
        except Exception:
            user.refresh_from_db()
        points_balance = getattr(user, "points", None)

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
    permission_classes = []  # public

    def get(self, request):
        # 1) Lecture & validation du paramètre user_id
        raw_user_id = (request.GET.get("user_id") or "").strip()
        if not raw_user_id:
            return Response({"errors": ["Pas d'utilisateur spécifié"]}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user_id = int(raw_user_id)
        except ValueError:
            return Response({"errors": ["Pas d'utilisateur spécifié"]}, status=status.HTTP_400_BAD_REQUEST)

        # 2) Vérification que l'utilisateur existe
        target_user = User.objects.filter(id=user_id).first()
        if not target_user:
            return Response({"errors": ["Utilisateur inexistant"]}, status=status.HTTP_404_NOT_FOUND)

        # 3) Récupération des 500 dépôts les plus récents
        #    ⚠️ le FK vers Song s'appelle 'song_id', il faut donc select_related("song_id")
        deposits = (
            Deposit.objects
            .filter(user_id=user_id)           # 'user' est le FK, 'user_id' le champ id implicite
            .select_related("song_id")         # important: le nom exact du champ FK
            .order_by("-deposited_at")[:500]
        )

        # 4) Construction de la réponse
        response_data = []
        for deposit in deposits:
            song = getattr(deposit, "song_id", None)  # objet Song, car le champ s'appelle song_id
            deposited_at = getattr(deposit, "deposited_at", None)

            title = getattr(song, "title", None)
            artist = getattr(song, "artist", None)
            img_url = getattr(song, "image_url", None)

            response_data.append({
                "deposit_id": getattr(deposit, "id", None),
                "deposit_date": deposited_at.isoformat() if deposited_at else None,
                "song": {
                    "title": title,
                    "artist": artist,
                    "img_url": img_url,
                },
            })

        return Response(response_data, status=status.HTTP_200_OK)


# ==========================================================
# EMOJIS & REACTIONS
# ==========================================================

class EmojiCatalogView(APIView):
    """
    GET /box-management/emojis/catalog
    ?deposit_id=<int> (optionnel) pour retourner aussi la réaction courante
    """
    permission_classes = []

    def get(self, request):
        deposit_id = request.GET.get("deposit_id")
        basics = list(Emoji.objects.filter(active=True, basic=True).order_by('char'))
        actives_paid = list(Emoji.objects.filter(active=True, basic=False).order_by('cost', 'char'))

        owned_ids = []
        current_reaction = None

        if request.user.is_authenticated:
            # Emojis déjà possédés
            owned_ids = list(
                EmojiRight.objects.filter(user=request.user, emoji__active=True)
                .values_list('emoji_id', flat=True)
            )

            # Emoji actuellement sélectionné sur ce dépôt
            if deposit_id:
                r = Reaction.objects.filter(user=request.user, deposit_id=deposit_id).select_related("emoji").first()
                if r:
                    current_reaction = {"emoji": r.emoji.char, "id": r.emoji.id}

        data = {
            "basic": EmojiSerializer(basics, many=True).data,
            "actives_paid": EmojiSerializer(actives_paid, many=True).data,
            "owned_ids": owned_ids,
            "current_reaction": current_reaction,
        }
        return Response(data, status=status.HTTP_200_OK)


class PurchaseEmojiView(APIView):
    """
    POST /box-management/emojis/purchase
    Body: { "emoji_id": <int> }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        emoji_id = request.data.get("emoji_id")
        if not emoji_id:
            return Response({"detail": "emoji_id manquant"}, status=status.HTTP_400_BAD_REQUEST)

        emoji = Emoji.objects.filter(id=emoji_id).first()
        if not emoji or not emoji.active:
            return Response({"detail": "Emoji indisponible"}, status=status.HTTP_404_NOT_FOUND)
        if emoji.basic:
            return Response({"ok": True, "owned": True}, status=status.HTTP_200_OK)

        if EmojiRight.objects.filter(user=request.user, emoji=emoji).exists():
            return Response({"ok": True, "owned": True}, status=status.HTTP_200_OK)

        cost = int(emoji.cost or 0)
        request.user.refresh_from_db(fields=["points"])
        if getattr(request.user, "points", 0) < cost:
            return Response({"error": "insufficient_funds", "message": "Crédits insuffisants"}, status=status.HTTP_400_BAD_REQUEST)

        # Débiter points
        csrf_token = get_token(request)
        origin = request.build_absolute_uri("/")
        headers_bg = {
            "Content-Type": "application/json",
            "X-CSRFToken": csrf_token,
            "Referer": origin,
            "Origin": origin.rstrip("/"),
        }
        r = requests.post(
            request.build_absolute_uri(reverse('add-points')),
            cookies=request.COOKIES,
            headers=headers_bg,
            data=json.dumps({"points": -cost}),
            timeout=4,
        )
        if not r.ok:
            return Response({"detail": "Erreur débit points"}, status=status.HTTP_502_BAD_GATEWAY)

        EmojiRight.objects.create(user=request.user, emoji=emoji)
        request.user.refresh_from_db(fields=["points"])
        return Response({"ok": True, "owned": True, "points_balance": getattr(request.user, "points", None)}, status=status.HTTP_200_OK)


class ReactionView(APIView):
    """
    POST /box-management/reactions
    Body: { "deposit_id": <int>, "emoji_id": <int|null|\"none\"> }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        deposit_id = request.data.get("deposit_id")
        emoji_id = request.data.get("emoji_id")

        if not deposit_id:
            return Response({"detail": "deposit_id manquant"}, status=status.HTTP_400_BAD_REQUEST)

        deposit = Deposit.objects.filter(id=deposit_id).first()
        if not deposit:
            return Response({"detail": "Dépôt introuvable"}, status=status.HTTP_404_NOT_FOUND)

        # suppression ("none")
        if emoji_id in (None, "", 0, "none"):
            Reaction.objects.filter(user=request.user, deposit=deposit).delete()
            summary = _reactions_summary_for_deposits([deposit.id]).get(deposit.id, [])
            return Response({"my_reaction": None, "reactions_summary": summary}, status=status.HTTP_200_OK)

        emoji = Emoji.objects.filter(id=emoji_id, active=True).first()
        if not emoji:
            return Response({"detail": "Emoji invalide"}, status=status.HTTP_404_NOT_FOUND)

        # ✅ Pas de check de droit si basic OU cost==0
        if not (emoji.basic or (emoji.cost or 0) == 0):
            has_right = EmojiRight.objects.filter(user=request.user, emoji=emoji).exists()
            if not has_right:
                return Response({"error": "forbidden", "message": "Emoji non débloqué"}, status=status.HTTP_403_FORBIDDEN)

        obj, created = Reaction.objects.get_or_create(
            user=request.user, deposit=deposit, defaults={"emoji": emoji}
        )
        if not created and obj.emoji_id != emoji.id:
            obj.emoji = emoji
            obj.save(update_fields=["emoji", "updated_at"])

        summary = _reactions_summary_for_deposits([deposit.id]).get(deposit.id, [])
        my = {"emoji": emoji.char, "reacted_at": obj.created_at.isoformat()}
        return Response({"my_reaction": my, "reactions_summary": summary}, status=status.HTTP_200_OK)






