import os
from uuid import uuid4


def generate_unique_filename(instance, filename):
    ext = os.path.splitext(filename)[1]
    unique_filename = f"{uuid4().hex}{ext}"
    return unique_filename


NB_POINTS_ADD_SONG = 50  # Points ajoutés lors du dépôt d'une musique
NB_POINTS_FIRST_DEPOSIT_USER_ON_BOX = 75  # Premier dépot d'un utilisateur dans une certaine boite
NB_POINTS_FIRST_SONG_DEPOSIT_BOX = 35  # Première fois que ce son est déposé dans cette boite
NB_POINTS_FIRST_SONG_DEPOSIT_GLOBAL = 25  # Première fois que ce son est déposé sur le réseau
NB_POINTS_CONSECUTIVE_DAYS_BOX = 50  # Jours consécutifs de dépôt sur une même boite
COST_REVEAL_BOX = 100 #cout d'un reveal dans une box
COST_REVEAL_PROFILE = 80 #depot sur profil
#COST_REVEAL_HEARTSONG #chanson de coeur


