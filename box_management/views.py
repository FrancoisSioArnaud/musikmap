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

# Projet
from .models import (
    Box,
    Deposit,
    Song,
    LocationPoint,
    DiscoveredSong,
    Emoji,
    EmojiRight,
    Reaction,
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


def _reactions_summary_for_deposits(dep_ids):
    """
    Retourne un dict {deposit_id: [{"emoji": "🔥", "count": 3}, ...], ...}
    Trié par count desc pour chaque dépôt.
    """
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
        did = row['deposit_id']
        emoji_char = row['emoji__char']
        cnt = row['count']
        summary.setdefault(did, []).append({"emoji": emoji_char, "count": cnt})

    for did in summary:
        summary[did].sort(key=lambda x: x["count"], reverse=True)
    return summary


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

        dep_ids = [d.id for d in deposits]

        # Agrégats de réactions pour ces dépôts
        reactions_by_dep = _reactions_summary_for_deposits(dep_ids)

        # Réaction du user courant sur ces dépôts
        my_reac_by_dep = {}
        authed = bool(user and not isinstance(user, AnonymousUser) and getattr(user, "is_authenticated", False))
        if authed:
            for r in Reaction.objects.filter(user=user, deposit_id__in=dep_ids).select_related('emoji'):
                my_reac_by_dep[r.deposit_id_id] = {
                    "emoji": r.emoji.char,
                    "reacted_at": r.created_at.isoformat(),
                }

        discovered_by_dep = {}
        if authed and len(deposits) > 1:
            dep_ids_tail = [d.id for d in deposits[1:]]
            for ds in DiscoveredSong.objects.filter(user_id=user, deposit_id__in=dep_ids_tail):
                discovered_by_dep[ds.deposit_id_id] = ds

        out = []
        for idx, d in enumerate(deposits):
            s = d.song_id
            u = d.user
            user_payload = self._map_user(u)

            base = {
                "deposit_id": d.id,
                "deposit_date": self._naturaltime(getattr(d, "deposited_at", None)),
                "user": user_payload,
                "reactions_summary": reactions_by_dep.get(d.id, []),
            }
            if authed:
                base["my_reaction"] = my_reac_by_dep.get(d.id)

            if idx == 0:
                base["song"] = self._map_song_full(s, include_id=False)
            else:
                if authed:
                    ds = discovered_by_dep.get(d.id)
                    already_discovered = bool(ds)
                    if already_discovered:
                        base["song"] = self._map_song_full(s, include_id=True)
                        base["already_discovered"] = True
                        base["discovered_at"] = self._naturaltime(getattr(ds, "discovered_at", None))
                    else:
                        base["song"] = self._map_song_teaser(s)
                        base["already_discovered"] = False
                        base["discovered_at"] = None
                else:
                    base["song"] = self._map_song_teaser(s)
                    base["already_discovered"] = False
                    base["discovered_at"] = None

            out.append(base)

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
            return Response({'valid': False,
