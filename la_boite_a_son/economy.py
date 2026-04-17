"""Centralized economy configuration.

This module is the single source of truth for:
- points gained from core actions
- points spent for core actions (e.g. reveal)

Keep this file free of app-layer imports (models/views) so it can be imported
from both back and front-facing views without circular dependencies.
"""

# Points gained
NB_POINTS_ADD_SONG = 50  # Points ajoutés lors du dépôt d'une musique
NB_POINTS_FIRST_DEPOSIT_USER_ON_BOX = 75  # Premier dépôt d'un utilisateur dans une boîte
NB_POINTS_FIRST_SONG_DEPOSIT_BOX = 35  # Première fois que ce son est déposé dans cette boîte
NB_POINTS_FIRST_SONG_DEPOSIT_GLOBAL = 25  # Première fois que ce son est déposé sur le réseau
NB_POINTS_CONSECUTIVE_DAYS_BOX = 50  # Jours consécutifs de dépôt sur une même boîte


# Points spent
COST_REVEAL_BOX = 100  # Coût d'un reveal (box / profil)


def build_economy_payload():
    """Payload intended to be served to the frontend."""
    return {
        "reveal_cost": COST_REVEAL_BOX,
        "points": {
            "deposit_song": NB_POINTS_ADD_SONG,
            "first_deposit_user_on_box": NB_POINTS_FIRST_DEPOSIT_USER_ON_BOX,
            "first_song_deposit_box": NB_POINTS_FIRST_SONG_DEPOSIT_BOX,
            "first_song_deposit_global": NB_POINTS_FIRST_SONG_DEPOSIT_GLOBAL,
            "consecutive_days_box": NB_POINTS_CONSECUTIVE_DAYS_BOX,
        },
    }
