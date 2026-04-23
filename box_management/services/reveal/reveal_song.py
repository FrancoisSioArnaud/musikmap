from django.db import IntegrityError, transaction
from rest_framework import status

from box_management.models import DiscoveredSong
from box_management.selectors.boxes import get_active_box_session
from box_management.selectors.deposits import get_deposit_for_reveal
from users.models import CustomUser
from users.utils import apply_points_delta


def reveal_song_for_user(*, user, dep_public_key, context, cost_reveal_box):
    if context in (None, ""):
        context = "box"
    if context not in ("box", "profile"):
        return None, {
            "type": "api_error",
            "status": status.HTTP_400_BAD_REQUEST,
            "code": "INVALID_DISCOVERY_CONTEXT",
            "detail": "Contexte invalide.",
        }

    with transaction.atomic():
        user = CustomUser.objects.select_for_update().get(pk=user.pk)
        deposit = get_deposit_for_reveal(dep_public_key)
        if not deposit:
            return None, {
                "type": "api_error",
                "status": status.HTTP_404_NOT_FOUND,
                "code": "DEPOSIT_NOT_FOUND",
                "detail": "Dépôt introuvable",
            }

        if context == "box" and getattr(deposit, "box", None) and not get_active_box_session(user, deposit.box):
            return None, {
                "type": "api_error",
                "status": status.HTTP_403_FORBIDDEN,
                "code": "BOX_SESSION_REQUIRED",
                "detail": "Ouvre la boîte pour continuer.",
            }

        song = deposit.song
        if not song:
            return None, {
                "type": "api_error",
                "status": status.HTTP_404_NOT_FOUND,
                "code": "DEPOSIT_SONG_NOT_FOUND",
                "detail": "Chanson introuvable pour ce dépôt",
            }

        discovery = DiscoveredSong.objects.filter(user=user, deposit=deposit).first()
        points_balance = int(getattr(user, "points", 0) or 0)

        if discovery is None:
            ok_points, points_payload, points_status = apply_points_delta(user, -int(cost_reveal_box), lock_user=False)
            if not ok_points:
                return None, {"type": "response", "payload": points_payload, "status": points_status}
            points_balance = points_payload.get("points_balance")
            try:
                DiscoveredSong.objects.create(user=user, deposit=deposit, discovered_type="revealed", context=context)
            except IntegrityError:
                pass

    return {"song": song, "points_balance": points_balance}, None
