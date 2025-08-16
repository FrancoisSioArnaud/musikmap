import os
from uuid import uuid4


def generate_unique_filename(instance, filename):
    ext = os.path.splitext(filename)[1]
    unique_filename = f"{uuid4().hex}{ext}"
    return unique_filename


NB_POINTS_ADD_SONG = 50  # Points ajoutés lors du dépôt d'une musique
NB_POINTS_FIRST_DEPOSIT_USER_ON_BOX = 10  # Premier dépot d'un utilisateur dans une certaine boite
NB_POINTS_FIRST_SONG_DEPOSIT_BOX = 20  # Première fois que ce son est déposé dans une boite
NB_POINTS_FIRST_SONG_DEPOSIT_GLOBAL = 5  # Première fois que ce son est déposé sur le réseau
NB_POINTS_CONSECUTIVE_DAYS_BOX = 2  # Jours consécutifs de dépôt sur une même boite
NB_POINTS_FAVORITE_SONG_DISCOVERY = -10 # Points dépensés pour découvrir une chanson de coeur d'un autre user
