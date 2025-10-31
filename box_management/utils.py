# box_management/utils.py

import re
from collections import Counter
from math import radians, sin, cos, sqrt, atan2
from typing import Any, Dict, List, Optional, Union

from django.conf import settings
from django.db.models import QuerySet

from users.models import CustomUser
from .models import Reaction


def _buildUser(userName: str) -> Dict[str, str]:
    """
    Construit un petit objet dict représentant un utilisateur existant pour l'UI.
    """
    default_pic = f"{settings.STATIC_URL.rstrip('/')}/img/default_profile.jpg"

    # 🔹 Recherche sensible à la casse (on suppose que l'utilisateur existe)
    user = CustomUser.objects.filter(username=userName).only("profile_picture").first()

    # 🔹 Détermination de l'image de profil
    profilepic = user.profile_picture.url if user.profile_picture else default_pic

    return {
        "username": userName,
        "profile_pic_url": profilepic,
    }


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


def _buildReactions(deposit_id: int, current_user: Optional[Union[CustomUser, int]] = None) -> Dict[str, Any]:
    """
    Construit la liste des réactions pour un dépôt + un résumé agrégé par emoji.
    """
    current_user_id: Optional[int] = None
    if current_user is not None:
        current_user_id = getattr(current_user, "id", None) if not isinstance(current_user, int) else current_user

    qs: QuerySet[Reaction] = (
        Reaction.objects
        .filter(deposit_id=deposit_id, emoji__active=True)
        .select_related("user", "emoji")
        .only("created_at", "id", "user__username", "emoji__char")
        .order_by("created_at", "id")
    )

    reactions_list: List[Dict[str, str]] = []
    mine: Optional[Dict[str, str]] = None
    counts = Counter()

    for r in qs:
        username = r.user.username
        char = r.emoji.char
        payload = {"user.name": username, "emoji.char": char}
        counts[char] += 1

        if current_user_id is not None and r.user_id == current_user_id:
            mine = payload
        else:
            reactions_list.append(payload)

    reactions = [mine] + reactions_list if mine else reactions_list

    summary = [
        {"emoji.char": char, "count": count}
        for char, count in sorted(counts.items(), key=lambda x: (-x[1], x[0]))
    ]

    return {"reactions": reactions, "summary": summary}


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
