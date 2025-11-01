# box_management/utils.py

import re
from collections import Counter
from math import radians, sin, cos, sqrt, atan2
from typing import Any, Dict, List, Optional, Union

from django.conf import settings
from django.db.models import QuerySet
from django.contrib.humanize.templatetags.humanize import naturaltime
from django.utils.timezone import localtime

from users.models import CustomUser
from .models import Deposit, Reaction


# ---------- petits builders "from instance only" ----------

def _build_user_from_instance(user: Optional[CustomUser]) -> Dict[str, Any]:
    """Ne fait AUCUNE requête : lit uniquement l'instance déjà chargée."""
    default_pic = f"{settings.STATIC_URL.rstrip('/')}/img/default_profile.jpg"
    if not user:
        return {"username": "Anonyme", "profile_pic_url": default_pic}
    pic = getattr(user, "profile_picture", None)
    return {
        "username": getattr(user, "username", "Anonyme"),
        "profile_pic_url": (getattr(pic, "url", None) or default_pic),
    }


def _build_song_from_instance(song, hidden: bool) -> Dict[str, Any]:
    """Ne fait AUCUNE requête : lit uniquement l'instance déjà chargée."""
    if hidden:
        return {"image_url": song.image_url}
    return {
        "image_url": song.image_url,
        "title": song.title,
        "artist": song.artist,
        "spotify_url": song.spotify_url or None,
        "deezer_url": song.deezer_url or None,
    }


def _iter_reactions_from_instance(dep: Deposit):
    """
    Utilise en priorité la prefetch list (to_attr). Sinon, une SEULE requête
    jointe (select_related) – mais reste centrée sur l'objet (pas d'ID).
    """
    reacs = getattr(dep, "prefetched_reactions", None)
    if reacs is not None:
        return reacs
    return dep.reactions.select_related("emoji", "user").order_by("created_at", "id").all()


def _build_reactions_from_instance(dep: Deposit, current_user: Optional[CustomUser] = None) -> Dict[str, Any]:
    """Ne refait pas de get par ID : exploite uniquement dep + relations."""
    current_user_id = getattr(current_user, "id", None) if current_user else None

    detail: List[Dict[str, Any]] = []
    mine: Optional[Dict[str, Any]] = None
    counts: Counter = Counter()

    for r in _iter_reactions_from_instance(dep):
        if not getattr(r.emoji, "active", True):
            continue
        payload = {"user": {"name": getattr(r.user, "username", "Anonyme")}, "emoji": r.emoji.char}
        counts[r.emoji.char] += 1
        if current_user_id is not None and r.user_id == current_user_id:
            mine = payload
        else:
            detail.append(payload)

    if mine:
        detail = [mine] + detail

    summary = [{"emoji": e, "count": c} for e, c in sorted(counts.items(), key=lambda x: (-x[1], x[0]))]
    return {"detail": detail, "summary": summary}


def _build_deposit_from_instance(dep: Deposit, *, include_user: bool, hidden: bool, current_user: Optional[CustomUser] = None) -> Dict[str, Any]:
    """Construit le payload final UNIQUEMENT depuis l'instance fournie."""
    payload: Dict[str, Any] = {
        "date": naturaltime(localtime(dep.deposited_at)),
        "song": _build_song_from_instance(dep.song, hidden),
    }
    if include_user:
        payload["user"] = _build_user_from_instance(dep.user)

    rx = _build_reactions_from_instance(dep, current_user=current_user)
    payload["reactions"] = rx["detail"]
    payload["reactions_summary"] = rx["summary"]
    return payload



def get_deposit(deposit_id: int, *, viewer: Optional[CustomUser] = None, include_user: bool = True) -> Dict[str, Any]:
    """
    1) Charge l'objet Deposit (select_related + prefetch réactions)
    2) Annote is_revealed pour le viewer (si fourni)
    3) Construit le payload UNIQUEMENT depuis l'objet chargé (zéro re-get par ID)
    """
    # Annotation de visibilité (is_revealed) via DiscoveredSong
    if viewer is None:
        # tout hidden si pas de viewer
        qs = Deposit.objects.select_related("song", "box", "user").prefetch_related(
            Prefetch(
                "reactions",
                queryset=Reaction.objects.select_related("emoji", "user").order_by("created_at", "id"),
                to_attr="prefetched_reactions",
            )
        ).annotate(is_revealed=Value(False, output_field=BooleanField()))
    else:
        ds = DiscoveredSong.objects.filter(user_id=viewer.id, deposit_id=OuterRef("pk"))
        qs = Deposit.objects.select_related("song", "box", "user").prefetch_related(
            Prefetch(
                "reactions",
                queryset=Reaction.objects.select_related("emoji", "user").order_by("created_at", "id"),
                to_attr="prefetched_reactions",
            )
        ).annotate(is_revealed=Exists(ds))

    dep: Deposit = qs.get(pk=deposit_id)
    hidden = not getattr(dep, "is_revealed", False)

    # construction finale, 100% basée sur l'instance
    return _build_deposit_from_instance(dep, include_user=include_user, hidden=hidden, current_user=viewer)


def normalize_string(input_string: str) -> str:
    """
    Normalise une chaîne : supprime les caractères spéciaux et met en minuscule.
    """
    normalized_string = re.sub(r'[^a-zA-Z0-9\s]', '', input_string).lower()
    normalized_string = re.sub(r'\s+', ' ', normalized_string).strip()
    return normalized_string


def calculate_distance(lat1, lon1, lat2, lon2) -> float:
    """
    Calcule la distance entre deux points géographiques (Haversine).
    """
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    r = 6371000  # rayon de la Terre en mètres

    d_lat = lat2 - lat1
    d_lon = lon2 - lon1

    a = sin(d_lat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(d_lon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return r * c

