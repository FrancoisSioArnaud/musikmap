import re
from math import radians, sin, cos, sqrt, atan2

# box_management/utils.py

from types import SimpleNamespace
from urllib.parse import urlparse
from django.conf import settings

# ⚠️ adapte l'import ci-dessous au nom réel de ton app "users"
# ex: from users.models import CustomUser
from users.models import CustomUser






DEFAULT_PROFILE_PICTURE = "/static/img/default_profile.jpg"


def _to_relative_path(url_or_path: str) -> str:
    """
    Prend une URL absolue ou un chemin (ex: 'https://site.com/media/x.jpg' ou '/media/x.jpg')
    et renvoie toujours un chemin RELATIF commençant par '/media/' ou '/static/'.
    """
    if not url_or_path:
        return DEFAULT_PROFILE_PICTURE

    # Si c'est déjà un chemin relatif, on renvoie tel quel
    if url_or_path.startswith("/"):
        return url_or_path

    # Sinon, on parse l'URL et on récupère juste le path
    parsed = urlparse(url_or_path)
    return parsed.path or DEFAULT_PROFILE_PICTURE




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

