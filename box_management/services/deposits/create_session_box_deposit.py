from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework import status

from box_management.builders.deposit_payloads import _build_deposits_payload
from box_management.models import BoxSession, Deposit
from box_management.services.boxes.session_helpers import get_active_box_session_context
from box_management.services.deposits.song_creation import _build_successes, create_song_deposit
from users.models import CustomUser
from users.utils import apply_points_delta

SESSION_DEPOSIT_REUSE_WINDOW_SECONDS = 5


def _serialize_revealed_deposit(deposit, *, viewer):
    if not deposit:
        return None
    payloads = _build_deposits_payload(
        [deposit],
        viewer=viewer,
        include_user=True,
        force_song_infos_for=[deposit.pk],
    )
    return payloads[0] if payloads else None


def _already_exists_payload(*, deposit, user):
    return {
        "my_deposit": _serialize_revealed_deposit(deposit, viewer=user),
        "successes": [],
        "points_balance": int(user.points or 0),
        "already_exists": True,
    }


def _session_deposit_is_reusable(deposit):
    deposited_at = getattr(deposit, "deposited_at", None)
    if not deposited_at:
        return False
    return timezone.now() - deposited_at < timedelta(seconds=SESSION_DEPOSIT_REUSE_WINDOW_SECONDS)


def create_session_box_deposit(*, request, box_slug, option):
    context, error = get_active_box_session_context(request, box_slug)
    if error:
        return None, error

    with transaction.atomic():
        session = (
            BoxSession.objects.select_for_update()
            .select_related("box", "user", "deposit", "deposit__song", "deposit__box", "deposit__user")
            .get(pk=context["session"].pk)
        )
        if session.expires_at <= timezone.now():
            return None, {
                "status": status.HTTP_403_FORBIDDEN,
                "code": "BOX_SESSION_REQUIRED",
                "detail": "Ouvre la boîte pour continuer.",
            }

        user = CustomUser.objects.select_for_update().get(pk=session.user_id)

        if session.deposit_id:
            if _session_deposit_is_reusable(session.deposit):
                return _already_exists_payload(deposit=session.deposit, user=user), None
            return None, {
                "status": status.HTTP_409_CONFLICT,
                "code": "BOX_SESSION_DEPOSIT_ALREADY_EXISTS",
                "detail": "Une chanson a déjà été partagée pour cette session.",
            }

        try:
            deposit, song, created_new_deposit = create_song_deposit(
                request=request,
                user=user,
                option=option,
                deposit_type=Deposit.DEPOSIT_TYPE_BOX,
                box=session.box,
                reuse_recent_window_seconds=0,
            )
        except ValueError:
            return None, {
                "status": status.HTTP_400_BAD_REQUEST,
                "code": "INVALID_DEPOSIT_OPTION",
                "detail": "Le dépôt demandé est invalide.",
            }
        if not created_new_deposit:
            return None, {
                "status": status.HTTP_409_CONFLICT,
                "code": "BOX_SESSION_DEPOSIT_ALREADY_EXISTS",
                "detail": "Une chanson a déjà été partagée pour cette session.",
            }

        successes, points_to_add = _build_successes(
            box=session.box,
            user=user,
            song=song,
            current_deposit=deposit,
        )
        ok_points, points_payload, _points_code = apply_points_delta(user, points_to_add, lock_user=False)
        points_balance = points_payload.get("points_balance") if ok_points else int(user.points or 0)

        session.deposit = deposit
        session.save(update_fields=["deposit", "updated_at"])

        return {
            "my_deposit": _serialize_revealed_deposit(deposit, viewer=user),
            "successes": successes,
            "points_balance": points_balance,
            "already_exists": False,
        }, None
