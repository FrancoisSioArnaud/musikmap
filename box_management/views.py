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


# -----------------------
# Helpers réactions
# -----------------------

def _reactions_summary_for_deposits(dep_ids):
    """Retourne {deposit_id: [{"emoji": "🔥", "count": 3}, ...]}"""
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
# Vues principales
# -----------------------

class BoxMeta(APIView):
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

        # Agrégats de réactions
        reactions_by_dep = _reactions_summary_for_deposits(dep_ids)

        # Réactions de l'utilisateur
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
            for ds in DiscoveredSong.objects.filter(user_id=user, deposit_id__in=dep_ids[1:]):
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


# -----------------------
# Autres vues (inchangées)
# -----------------------

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


# -----------------------
# NOUVELLES VUES EMOJIS / RÉACTIONS
# -----------------------

class EmojiCatalogView(APIView):
    permission_classes = []

    def get(self, request):
        basics = list(Emoji.objects.filter(active=True, basic=True).order_by('char'))
        actives_paid = list(Emoji.objects.filter(active=True, basic=False).order_by('cost', 'char'))

        owned_ids = []
        if request.user.is_authenticated:
            owned_ids = list(
                EmojiRight.objects.filter(user=request.user, emoji__active=True).values_list('emoji_id', flat=True)
            )

        data = {
            "basic": EmojiSerializer(basics, many=True).data,
            "actives_paid": EmojiSerializer(actives_paid, many=True).data,
            "owned_ids": owned_ids,
        }
        return Response(data, status=status.HTTP_200_OK)


class PurchaseEmojiView(APIView):
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
    permission_classes = [IsAuthenticated]

    def post(self, request):
        deposit_id = request.data.get("deposit_id")
        emoji_id = request.data.get("emoji_id", None)

        if not deposit_id:
            return Response({"detail": "deposit_id manquant"}, status=status.HTTP_400_BAD_REQUEST)

        deposit = Deposit.objects.filter(id=deposit_id).first()
        if not deposit:
            return Response({"detail": "Dépôt introuvable"}, status=status.HTTP_404_NOT_FOUND)

        # Suppression
        if emoji_id in (None, "", 0, "none"):
            Reaction.objects.filter(user=request.user, deposit=deposit).delete()
            summary = _reactions_summary_for_deposits([deposit.id]).get(deposit.id, [])
            return Response({"my_reaction": None, "reactions_summary": summary}, status=status.HTTP_200_OK)

        emoji = Emoji.objects.filter(id=emoji_id, active=True).first()
        if not emoji:
            return Response({"detail": "Emoji invalide"}, status=status.HTTP_404_NOT_FOUND)

        if not emoji.basic:
            has_right = EmojiRight.objects.filter(user=request.user, emoji=emoji).exists()
            if not has_right:
                return Response({"error": "forbidden", "message": "Emoji non débloqué"}, status=status.HTTP_403_FORBIDDEN)

        obj, created = Reaction.objects.get_or_create(user=request.user, deposit=deposit, defaults={"emoji": emoji})
        if not created:
            if obj.emoji_id != emoji.id:
                obj.emoji = emoji
                obj.save(update_fields=["emoji", "updated_at"])

        summary = _reactions_summary_for_deposits([deposit.id]).get(deposit.id, [])
        my = {"emoji": emoji.char, "reacted_at": obj.created_at.isoformat()}
        return Response({"my_reaction": my, "reactions_summary": summary}, status=status.HTTP_200_OK)
