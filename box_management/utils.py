# --- Standard Library ---
import re
from math import radians, sin, cos, sqrt, atan2
from types import SimpleNamespace
from urllib.parse import urlparse
from collections import Counter
from typing import Any, Dict, List, Optional, Union

# --- Django ---
from django.conf import settings
from django.db.models import QuerySet

# --- Local apps ---
from users.models import CustomUser
from box_management.models import Reaction
from box_management.utils import _buildReactions




def _buildUser(userName: str) -> Dict[str, str]:
    """
    Construit un petit objet dict représentant un utilisateur existant pour l'UI.

    Paramètres
    ----------
    userName : str
        Username (sensible à la casse, doit exister).

    Retour
    ------
    dict
        {
            "username": <str>,
            "profilepic": <str>  # URL relative ("/media/...") ou image par défaut
        }
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

    Paramètres
    ----------
    song_id : int
        PK de la chanson (Song.id).
    hidden : bool
        - True  => renvoie uniquement {"image_url": ...}
        - False => renvoie {"image_url", "title", "artist", "spotify_url", "deezer_url"}

    Retour
    ------
    dict :
        Si hidden=True :
            { "image_url": str }
        Si hidden=False :
            {
              "image_url": str,
              "title": str,
              "artist": str,
              "spotify_url": str | None,
              "deezer_url": str | None
            }

    Remarques
    ---------
    - On suppose que la chanson existe (Song.id valide) et que image_url est non vide.
    - spotify_url / deezer_url sont normalisés à None si vides.
    """
    from .models import Song  # import local pour éviter d'éventuels imports circulaires

    if hidden:
        data = (
            Song.objects
            .filter(id=song_id)
            .values("image_url")
            .get()  # .get() si non trouvé -> Song.DoesNotExist (cas non prévu ici)
        )
        return {"image_url": data["image_url"]}

    # visible : on prend les 5 champs
    data = (
        Song.objects
        .filter(id=song_id)
        .values("image_url", "title", "artist", "spotify_url", "deezer_url")
        .get()
    )

    # Normalisation des URLs vides en None (spotify/deezer)
    if not data.get("spotify_url"):
        data["spotify_url"] = None
    if not data.get("deezer_url"):
        data["deezer_url"] = None

    return {
        "image_url": data["image_url"],
        "title": data["title"],
        "artist": data["artist"],
        "spotify_url": data["spotify_url"],
        "deezer_url": data["deezer_url"],
    }






def _buildReactions(deposit_id: int, current_user: Optional[Union[CustomUser, int]] = None) -> Dict[str, Any]:
    """
    Construit la liste des réactions pour un dépôt + un résumé agrégé par emoji.

    Règles :
      - Filtre : uniquement les réactions dont l'emoji est actif (emoji.active=True).
      - Tri principal : par date de création croissante (created_at ASC).
      - Ma réaction (si current_user fourni) est déplacée en TÊTE de la liste.
      - Sortie 'flat' : [{ "user.name": "<username>", "emoji.char": "<char>" }, ...]
      - Summary : [{ "emoji.char": "<char>", "count": <int> }], trié par count DESC puis char ASC.
      - Pas de pagination : renvoie tout.

    :param deposit_id: int - ID du dépôt (Deposit.id).
    :param current_user: Optional[CustomUser | int] - utilisateur courant (objet ou id) pour mettre sa réaction en premier.
    :return: dict avec deux clés :
             {
               "reactions": [ { "user.name": ..., "emoji.char": ... }, ... ],
               "summary":   [ { "emoji.char": ..., "count": ... }, ... ]
             }
    """
    # Normaliser l'id de l'utilisateur courant si un objet CustomUser est passé
    current_user_id: Optional[int] = None
    if current_user is not None:
        current_user_id = getattr(current_user, "id", None) if not isinstance(current_user, int) else current_user

    # Requête optimisée : on charge seulement ce qui est nécessaire
    qs: QuerySet[Reaction] = (
        Reaction.objects
        .filter(deposit_id=deposit_id, emoji__active=True)
        .select_related("user", "emoji")
        .only("created_at", "id", "user__username", "emoji__char")
        .order_by("created_at", "id")
    )

    reactions_list: List[Dict[str, str]] = []
    mine: Optional[Dict[str, str]] = None

    # Compteur pour le résumé par emoji
    counts = Counter()

    for r in qs:
        username = r.user.username  # "Toujours présent" d’après ton cadrage
        char = r.emoji.char

        payload = {"user.name": username, "emoji.char": char}
        counts[char] += 1

        if current_user_id is not None and r.user_id == current_user_id:
            # On retient la réaction de l'utilisateur courant pour la mettre en tête
            mine = payload
        else:
            reactions_list.append(payload)

    # Si l'utilisateur courant a réagi, on place sa réaction en tête
    if mine is not None:
        reactions = [mine] + reactions_list
    else:
        reactions = reactions_list

    # Construire le summary trié par count DESC puis char ASC (déterministe)
    summary = [
        {"emoji.char": char, "count": count}
        for char, count in sorted(counts.items(), key=lambda x: (-x[1], x[0]))
    ]

    return {
        "reactions": reactions,
        "summary": summary,
    }


def normalize_string(input_string):
    """
    Function goal: Normalize a string by removing special characters and converting it to lowercase.

    Args:
        input_string: the string to normalize

    Returns:
        normalized_string: the normalized string
    """
    # Remove special characters and convert to lowercase
    normalized_string = re.sub(r'[^a-zA-Z0-9\s]', '', input_string).lower()
    # Replace multiple spaces with a single space
    normalized_string = re.sub(r'\s+', ' ', normalized_string).strip()
    return normalized_string


def calculate_distance(lat1, lon1, lat2, lon2):
    """
    Function goal: Calculate the distance between two geographical points (using haversine distance)

    Args:
        lat1: the latitude of the first point
        lon1: the longitude of the first point
        lat2: the latitude of the second point
        lon2: the longitude of the second point

    Returns:
        distance: the distance between the two points in meters

    """

    # Convert the coordinates to radians
    lat1 = radians(lat1)
    lon1 = radians(lon1)
    lat2 = radians(lat2)
    lon2 = radians(lon2)

    # Radius of the Earth in meters
    r = 6371000

    # Latitude and longitude differences
    d_lat = lat2 - lat1
    d_lon = lon2 - lon1

    # Haversine formula
    a = sin(d_lat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(d_lon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    distance = r * c

    return distance



