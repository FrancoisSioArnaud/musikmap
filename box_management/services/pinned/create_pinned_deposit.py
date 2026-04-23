from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework import status

from box_management.models import Box, Deposit
from box_management.services.deposits.song_creation import create_song_deposit
from box_management.services.pinned.pricing import get_active_pinned_deposit_for_box
from users.models import CustomUser
from users.utils import apply_points_delta


def create_pinned_deposit(*, user, box, option, duration_minutes, points_cost):
    try:
        with transaction.atomic():
            user = CustomUser.objects.select_for_update().get(pk=user.pk)
            box = Box.objects.select_for_update().select_related("client").get(pk=box.pk)
            active_pinned = get_active_pinned_deposit_for_box(box, for_update=True)
            if active_pinned:
                return None, {
                    "status": status.HTTP_409_CONFLICT,
                    "code": "PIN_SLOT_OCCUPIED",
                    "detail": "Une chanson est déjà épinglée pour le moment.",
                    "active_pinned": active_pinned,
                    "user": user,
                }

            ok_points, points_payload, points_status = apply_points_delta(user, -points_cost, lock_user=False)
            if not ok_points:
                return None, {"status": points_status, "payload": points_payload, "user": user}

            pin_expires_at = timezone.now() + timedelta(minutes=duration_minutes)
            pinned_deposit, _song, _created = create_song_deposit(
                request=None,
                user=user,
                option=option,
                deposit_type=Deposit.DEPOSIT_TYPE_PINNED,
                box=box,
                pin_duration_minutes=duration_minutes,
                pin_points_spent=points_cost,
                pin_expires_at=pin_expires_at,
            )
            return {"deposit": pinned_deposit, "user": user}, None
    except ValueError:
        return None, {
            "status": status.HTTP_400_BAD_REQUEST,
            "code": "PIN_CREATION_INVALID",
            "detail": "Impossible d’épingler cette chanson avec les paramètres fournis.",
        }
    except Exception:
        return None, {
            "status": status.HTTP_500_INTERNAL_SERVER_ERROR,
            "code": "PIN_CREATION_FAILED",
            "detail": "Impossible d’épingler cette chanson pour le moment.",
        }
