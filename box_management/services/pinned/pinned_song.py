from django.db.models import Prefetch
from rest_framework import status

from box_management.models import Deposit, Reaction
from box_management.services.boxes.box_content import serialize_active_pinned_deposit_for_box
from box_management.services.pinned.create_pinned_deposit import create_pinned_deposit
from box_management.services.pinned.pricing import (
    build_pinned_price_steps_payload,
    get_active_pinned_deposit_for_box,
    get_pinned_price_step,
)
from users.models import CustomUser


def _serialize_active_deposit(deposit, viewer):
    if not deposit:
        return None
    return serialize_active_pinned_deposit_for_box(deposit.box, viewer=viewer)


def build_pinned_song_payload(*, box, viewer):
    active_pinned = get_active_pinned_deposit_for_box(box)
    return {
        "active_pinned_deposit": _serialize_active_deposit(active_pinned, viewer),
        "price_steps": build_pinned_price_steps_payload(user_points=getattr(viewer, "points", None) if viewer else None),
    }


def create_pinned_song_for_session(*, user, box, option, duration_minutes):
    try:
        duration_minutes = int(duration_minutes)
    except (TypeError, ValueError):
        return None, {"status": status.HTTP_400_BAD_REQUEST, "code": "PIN_DURATION_INVALID", "detail": "Durée invalide."}

    price_step = get_pinned_price_step(duration_minutes)
    if not price_step:
        return None, {
            "status": status.HTTP_400_BAD_REQUEST,
            "code": "PIN_DURATION_UNAVAILABLE",
            "detail": "Durée non disponible.",
        }

    if not option:
        return None, {"status": status.HTTP_400_BAD_REQUEST, "code": "PIN_SONG_REQUIRED", "detail": "Chanson manquante."}

    result, error = create_pinned_deposit(
        user=user,
        box=box,
        option=option,
        duration_minutes=duration_minutes,
        points_cost=int(price_step["points"]),
    )
    if error:
        if error.get("code") == "PIN_SLOT_OCCUPIED":
            return None, {
                "status": error["status"],
                "code": error["code"],
                "detail": error["detail"],
                "active_pinned_deposit": _serialize_active_deposit(error["active_pinned"], error["user"]),
                "price_steps": build_pinned_price_steps_payload(user_points=error["user"].points),
            }
        if "payload" in error:
            points_payload = error["payload"]
            return None, {
                "status": error["status"],
                "code": points_payload.get("code") or "INSUFFICIENT_POINTS",
                "detail": points_payload.get("detail") or "Pas assez de points pour effectuer cette action.",
                "points_balance": points_payload.get("points_balance", error["user"].points),
                "price_steps": build_pinned_price_steps_payload(user_points=error["user"].points),
            }
        return None, {"status": error["status"], "code": error["code"], "detail": error["detail"]}

    pinned_deposit = result["deposit"]
    refreshed_user = CustomUser.objects.filter(pk=user.pk).first() or user
    pinned_deposit = (
        Deposit.objects.select_related("song", "user", "box")
        .prefetch_related(
            Prefetch(
                "reactions",
                queryset=Reaction.objects.select_related("emoji", "user").order_by("created_at", "id"),
                to_attr="prefetched_reactions",
            )
        )
        .filter(pk=pinned_deposit.pk)
        .first()
    )

    return {
        "action": "created",
        "active_pinned_deposit": _serialize_active_deposit(pinned_deposit, refreshed_user),
        "price_steps": build_pinned_price_steps_payload(user_points=refreshed_user.points),
        "points_balance": int(getattr(refreshed_user, "points", 0) or 0),
    }, None


__all__ = ["build_pinned_song_payload", "create_pinned_song_for_session"]
