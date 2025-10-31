# box_management/utils.py

import re
from collections import Counter
from math import radians, sin, cos, sqrt, atan2
from typing import Any, Dict, List, Optional, Union

from django.conf import settings
from django.db.models import QuerySet
from django.contrib.humanize.templatetags.humanize import naturaltime

from users.models import CustomUser
from .models import Deposit, Reaction


def _buildUser(user_id: int) -> Dict[str, str]:
    """
    Construit un petit objet dict représentant un utilisateur existant pour l'UI.
    - Entrée: user_id (int)
    - Si l'utilisateur n'existe pas: renvoie "Anonyme" + image par défaut.
    """
    default_pic = f"{settings.STATIC_URL.rstrip('/')}/img/default_profile.jpg"

    user = CustomUser.objects.only("username", "profile_picture").filter(id=user_id).first()
    if not user:
        return {"username": "Anonyme", "profile_pic_url": default_pic}

    profilepic = user.profile_picture.url if getattr(user, "profile_picture", None) else default_pic
    return {"username": user.username, "profile_pic_url": profilepic}


def _buildSong(song_id: int, hidden: bool) -> Dict[str, Any]:
    """
    Construit un objet 'song' minimal pour le frontend à partir de la PK (Song.id).
    """
    from .models import Song  # import local pour éviter un import circulaire

    if hidden:
        data = Song.objects.filter(id=song_id).values("image_url").get()
        return {"image_url": data["image_url"]}

    data = (
        Song.objects.filter(id=song_id)
        .values("image_url", "title", "artist", "spotify_url", "deezer_url")
        .get()
    )
    data["spotify_url"] = data["spotify_url"] or None
    data["deezer_url"] = data["deezer_url"] or None
    return data


def _buildReactions(
    deposit_id: int,
    current_user: Optional[Union[CustomUser, int]] = None
) -> Dict[str, Any]:
    """
    Construit les réactions d'un dépôt + un résumé agrégé par emoji.
    - Retourne: {"detail": [...], "summary": [...]}
      * detail: liste d'objets {"user": {"name": ...}, "emoji": "🔥"}
      * summary: liste d'objets {"emoji": "🔥", "count": 3}
    - Si current_user est fourni, place sa réaction en premier dans 'detail'.
    """
    current_user_id: Optional[int] = None
    if current_user is not None:
        current_user_id = current_user if isinstance(current_user, int) else getattr(current_user, "id", None)

    qs: QuerySet[Reaction] = (
        Reaction.objects
        .filter(deposit_id=deposit_id, emoji__active=True)
        .select_related("user", "emoji")
        .only("created_at", "id", "user__username", "emoji__char")
        .order_by("created_at", "id")
    )

    reactions_list: List[Dict[str, Any]] = []
    mine: Optional[Dict[str, Any]] = None
    counts = Counter()

    for r in qs:
        username = r.user.username
        char = r.emoji.char
        payload = {"user": {"name": username}, "emoji": char}
        counts[char] += 1

        if current_user_id is not None and r.user_id == current_user_id:
            mine = payload
        else:
            reactions_list.append(payload)

    detail = [mine] + reactions_list if mine else reactions_list

    summary = [
        {"emoji": char, "count": count}
        for char, count in sorted(counts.items(), key=lambda x: (-x[1], x[0]))
    ]

    return {"detail": detail, "summary": summary}


def _buildDeposit(deposit_id: int, includeUser: bool, hidden: bool) -> Dict[str, Any]:
    """
    Construit le payload d'un dépôt avec format de date humanisé.

    Args:
        deposit_id: ID du Deposit à charger.
        includeUser: Si True, inclut un objet 'user' depuis _buildUser().
        hidden: Transmis à _buildSong() pour déterminer le niveau de détail retourné.

    Returns:
        dict avec les clés: 'date', ('user' si includeUser=True), 'song',
        'reactions', 'reactions_summary'.
    """
    # Modèle mis à jour: FK nommée 'song' (standard Django)
    deposit = (
        Deposit.objects.select_related("user", "song")
        .only("id", "deposited_at", "user_id", "song_id")
        .get(id=deposit_id)
    )

    payload: Dict[str, Any] = {
        "date": naturaltime(deposit.deposited_at),
    }

    if includeUser:
        payload["user"] = _buildUser(deposit.user_id)

    payload["song"] = _buildSong(deposit.song_id, hidden)

    reactions_pack = _buildReactions(deposit.id)
    payload["reactions"] = reactions_pack.get("detail", [])
    payload["reactions_summary"] = reactions_pack.get("summary", [])

    return payload


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
