import re
from math import radians, sin, cos, sqrt, atan2

# box_management/utils.py

from types import SimpleNamespace
from urllib.parse import urlparse
from django.conf import settings

# ⚠️ adapte l'import ci-dessous au nom réel de ton app "users"
# ex: from users.models import CustomUser
from users.models import CustomUser








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

# box_management/utils.py
from typing import Dict, Any




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


