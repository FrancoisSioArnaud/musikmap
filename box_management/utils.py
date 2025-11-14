# box_management/utils.py

import re
from collections import Counter
from math import radians, sin, cos, sqrt, atan2
from typing import Any, Dict, List, Optional, Union, Iterable, Sequence, Tuple
from datetime import timedelta

from django.conf import settings
from django.db.models import QuerySet, Prefetch, Q
from django.contrib.humanize.templatetags.humanize import naturaltime
from django.utils.timezone import localtime, localdate, timezone

from users.models import CustomUser
from .models import Deposit, Reaction, DiscoveredSong

# Barèmes & coûts (importés depuis ton module utils global)
from utils import (
    NB_POINTS_ADD_SONG,
    NB_POINTS_FIRST_DEPOSIT_USER_ON_BOX,
    NB_POINTS_FIRST_SONG_DEPOSIT_BOX,
    NB_POINTS_FIRST_SONG_DEPOSIT_GLOBAL,
    NB_POINTS_CONSECUTIVE_DAYS_BOX,
    COST_REVEAL_BOX,
)

# ---------- petits builders "from instance only" ----------

def _build_user_from_instance(user: Optional[CustomUser]) -> Dict[str, Any]:
    default_pic = f"{settings.STATIC_URL.rstrip('/')}/img/default_profile.jpg"
    if not user:
        return {"username": "Anonyme", "profile_pic_url": default_pic}

    pic = getattr(user, "profile_picture", None)
    profile_url = pic.url if pic else default_pic

    return {
        "username": getattr(user, "username", "Anonyme"),
        "profile_pic_url": profile_url,
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


def _build_deposit_from_instance(
    dep: Deposit,
    *,
    include_user: bool,
    hidden: bool,
    current_user: Optional[CustomUser] = None,
) -> Dict[str, Any]:
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


def build_deposits_payload(
    deposits: Union[Deposit, Iterable[Deposit], Sequence[Deposit]],
    *,
    viewer: Optional[CustomUser] = None,
    include_user: bool = True,
) -> List[Dict[str, Any]]:
    """
    Construit une liste de payloads de dépôts à partir d'instances déjà chargées.

    - N'effectue AUCUNE requête de "get par ID".
    - Optionnellement annote "is_revealed" pour le viewer fourni (en 1 requête bulk).
    - Construit le payload final via _build_deposit_from_instance(...).
    """
    # Normalisation en liste tout en respectant l’ordre fourni
    if isinstance(deposits, Deposit):
        deps: List[Deposit] = [deposits]
    else:
        deps = list(deposits or [])

    if not deps:
        return []

    # ------- Annotation "is_revealed" (BULK, 0/1 requête) -------
    if viewer is None:
        revealed_ids = set()  # personne -> rien de révélé
    else:
        dep_ids = [d.pk for d in deps]
        revealed_ids = set(
            DiscoveredSong.objects
            .filter(user_id=getattr(viewer, "id", None), deposit_id__in=dep_ids)
            .values_list("deposit_id", flat=True)
        )

    # ------- Construction des payloads à partir des instances -------
    out: List[Dict[str, Any]] = []
    for dep in deps:
        hidden = dep.pk not in revealed_ids
        payload = _build_deposit_from_instance(
            dep,
            include_user=include_user,
            hidden=hidden,
            current_user=viewer,
        )
        out.append(payload)

    return out


def _get_prev_head_and_older(box, limit: int = 10):
    """
    Retourne un snapshot de la box AVANT création d'un nouveau dépôt.

    - prev_head : dernier dépôt actuel (le plus récent) pour cette box.
    - older_deposits_qs : jusqu'à `limit` dépôts STRICTEMENT avant prev_head,
      avec song/user préchargés et réactions préfetchées.

    Si la box n'a encore aucun dépôt :
      → (None, Deposit.objects.none()).
    """
    prev_head = (
        Deposit.objects
        .filter(box=box)
        .order_by("-deposited_at", "-id")
        .first()
    )

    if prev_head is None:
        return None, Deposit.objects.none()

    older_deposits_qs = (
        Deposit.objects
        .filter(box=box)
        .filter(
            Q(deposited_at__lt=prev_head.deposited_at) |
            Q(deposited_at=prev_head.deposited_at, id__lt=prev_head.id)
        )
        .select_related("song", "user")
        .prefetch_related(
            Prefetch(
                "reactions",
                queryset=Reaction.objects
                .select_related("emoji", "user")
                .order_by("created_at", "id"),
                to_attr="prefetched_reactions",
            )
        )
        .order_by("-deposited_at", "-id")[:limit]
    )

    return prev_head, older_deposits_qs


# ---------- Normalisation & distance ----------

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


# ============ Achievements centralisés ============

def _is_first_user_deposit(user: Optional[CustomUser], box) -> bool:
    """Vrai si l'utilisateur n'a jamais déposé dans cette box."""
    if not user:
        return False
    return not Deposit.objects.filter(user=user, box=box).exists()


def _is_first_song_deposit_global_by_title_artist(title: str, artist: str) -> bool:
    """Vrai si (title, artist) n'a jamais été déposé nulle part (case-insensitive)."""
    if not title or not artist:
        return False
    return not Deposit.objects.filter(
        song__title__iexact=title, song__artist__iexact=artist
    ).exists()


def _is_first_song_deposit_in_box_by_title_artist(title: str, artist: str, box) -> bool:
    """Vrai si (title, artist) n'a jamais été déposé dans la box donnée (case-insensitive)."""
    if not title or not artist:
        return False
    return not Deposit.objects.filter(
        box=box, song__title__iexact=title, song__artist__iexact=artist
    ).exists()


def _get_consecutive_deposit_days(user: Optional[CustomUser], box) -> int:
    """
    Nombre de JOURS consécutifs (terminant hier) où 'user' a déposé dans 'box'.
    Ex: si l'user a déposé hier et avant-hier → 2.
    """
    if not user:
        return 0

    today = localdate()
    target = today - timedelta(days=1)  # on ne compte pas aujourd'hui
    streak = 0

    # Liste des dates (locales) distinctes de dépôts, récentes → anciennes
    dates = (
        Deposit.objects
        .filter(user=user, box=box)
        .order_by("-deposited_at")
        .values_list("deposited_at", flat=True)
    )

    seen_days: List = []
    for dt in dates:
        try:
            d = localtime(dt).date()
        except Exception:
            d = timezone.localtime(dt).date()  # fallback
        if not seen_days or seen_days[-1] != d:
            seen_days.append(d)

    for d in seen_days:
        if d == target:
            streak += 1
            target -= timedelta(days=1)
        elif d < target:
            break  # trou dans la chaîne

    return streak


def _build_successes(*, box, user: Optional[CustomUser], song: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], int]:
    """
    Calcule la liste des 'successes' (achievements) + le total de points.
    Entrée:
      - box: instance de Box
      - user: CustomUser | None
      - song: dict minimal {"title": str, "artist": str}
    Sortie:
      - (successes_list, points_total)
    """
    title = (song.get("title") or "").strip()
    artist = (song.get("artist") or "").strip()

    successes: Dict[str, Dict[str, Any]] = {}
    points_to_add = int(NB_POINTS_ADD_SONG)

    # 1) Série de jours consécutifs
    nb_consecutive_days = _get_consecutive_deposit_days(user, box) if user else 0
    if nb_consecutive_days > 0:
        bonus = nb_consecutive_days * int(NB_POINTS_CONSECUTIVE_DAYS_BOX)
        points_to_add += bonus
        successes["consecutive_days"] = {
            "name": "Amour fou",
            "desc": f"{nb_consecutive_days + 1} jours consécutifs avec cette boite",
            "points": bonus,
            "emoji": "🔥",
        }

    # 2) Premier dépôt de cet utilisateur dans cette box
    if _is_first_user_deposit(user, box):
        points_to_add += int(NB_POINTS_FIRST_DEPOSIT_USER_ON_BOX)
        successes["first_user_deposit_box"] = {
            "name": "Explorateur·ice",
            "desc": "Tu n'as jamais déposé ici",
            "points": int(NB_POINTS_FIRST_DEPOSIT_USER_ON_BOX),
            "emoji": "🔍",
        }

    # 3) Première fois (title, artist) dans la box
    if _is_first_song_deposit_in_box_by_title_artist(title, artist, box):
        points_to_add += int(NB_POINTS_FIRST_SONG_DEPOSIT_BOX)
        successes["first_song_deposit"] = {
            "name": "Far West",
            "desc": "Cette chanson n'a jamais été déposée ici",
            "points": int(NB_POINTS_FIRST_SONG_DEPOSIT_BOX),
            "emoji": "🤠",
        }

    # 4) Première fois (title, artist) sur le réseau
    if _is_first_song_deposit_global_by_title_artist(title, artist):
        points_to_add += int(NB_POINTS_FIRST_SONG_DEPOSIT_GLOBAL)
        successes["first_song_deposit_global"] = {
            "name": "Preums",
            "desc": "Cette chanson n'a jamais été déposée sur le réseau",
            "points": int(NB_POINTS_FIRST_SONG_DEPOSIT_GLOBAL),
            "emoji": "🥇",
        }

    # 5) Succès par défaut + total
    successes["default_deposit"] = {
        "name": "Pépite",
        "desc": "Tu as partagé·e une chanson",
        "points": int(NB_POINTS_ADD_SONG),
        "emoji": "💎",
    }
    successes["points_total"] = {"name": "Total", "points": points_to_add}

    return list(successes.values()), points_to_add

