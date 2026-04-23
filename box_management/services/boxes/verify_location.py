from rest_framework import status

from box_management.selectors.boxes import get_box_by_slug, get_location_points
from box_management.services.geo.distance import _calculate_distance


def verify_location_for_box(*, box_slug, latitude, longitude):
    if not box_slug:
        return None, {
            "status": status.HTTP_400_BAD_REQUEST,
            "code": "BOX_SLUG_REQUIRED",
            "detail": "boxSlug manquant",
        }

    box = get_box_by_slug(box_slug)
    if not box:
        return None, {
            "status": status.HTTP_404_NOT_FOUND,
            "code": "BOX_NOT_FOUND",
            "detail": "Boîte introuvable.",
        }

    points = get_location_points(box)
    if not points.exists():
        return None, {
            "status": status.HTTP_404_NOT_FOUND,
            "code": "BOX_LOCATION_NOT_CONFIGURED",
            "detail": "No location points for this box",
        }

    for point in points:
        if _calculate_distance(latitude, longitude, point.latitude, point.longitude) <= point.dist_location:
            return {"box": box}, None

    return None, {
        "status": status.HTTP_403_FORBIDDEN,
        "code": "OUTSIDE_ALLOWED_BOX_RANGE",
        "detail": "Rapproche-toi de la boîte pour l’ouvrir.",
    }
