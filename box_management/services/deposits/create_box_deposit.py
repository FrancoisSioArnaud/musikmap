from django.db import transaction

from box_management.builders.deposit_payloads import _build_deposits_payload
from box_management.models import DiscoveredSong
from box_management.services.deposits.song_creation import (
    _build_successes,
    _get_prev_head_and_older,
    create_song_deposit,
)
from users.models import CustomUser
from users.utils import apply_points_delta, build_current_user_payload


def create_box_deposit_payload(*, request, user, box, option):
    prev_head, older_list = _get_prev_head_and_older(box, limit=15)
    points_balance = None

    with transaction.atomic():
        user = CustomUser.objects.select_for_update().get(pk=user.pk)

        deposit, song, created_new_deposit = create_song_deposit(
            request=request,
            user=user,
            option=option,
            deposit_type="box",
            box=box,
            reuse_recent_window_seconds=10,
        )

        if not created_new_deposit:
            prev_head, older_list = _get_prev_head_and_older(box, limit=15, exclude_deposit_ids=[deposit.pk])
            successes = []
            points_balance = int(user.points or 0)
        else:
            successes, points_to_add = _build_successes(box=box, user=user, song=song, current_deposit=deposit)

            if prev_head is not None:
                try:
                    DiscoveredSong.objects.get_or_create(
                        user=user,
                        deposit_id=prev_head.pk,
                        defaults={"discovered_type": "main"},
                    )
                except Exception:
                    pass

            ok_points, points_payload, _points_code = apply_points_delta(user, points_to_add, lock_user=False)
            if ok_points:
                points_balance = points_payload.get("points_balance")

    reveal_ids = [prev_head.pk] if prev_head else []
    deposits_to_serialize = ([prev_head] if prev_head else []) + list(older_list or [])
    serialized = _build_deposits_payload(
        deposits_to_serialize,
        viewer=user,
        include_user=True,
        force_song_infos_for=reveal_ids if not getattr(user, "is_guest", False) else reveal_ids,
    )

    return {
        "main": serialized[0] if serialized else None,
        "older_deposits": serialized[1:] if len(serialized) > 1 else [],
        "successes": successes,
        "points_balance": points_balance,
        "current_user": build_current_user_payload(user),
    }
