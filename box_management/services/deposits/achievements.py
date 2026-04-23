from datetime import timedelta
from typing import Any

from django.utils import timezone
from django.utils.timezone import localdate, localtime

from box_management.models import Deposit, Song
from la_boite_a_son.economy import (
    NB_POINTS_ADD_SONG,
    NB_POINTS_CONSECUTIVE_DAYS_BOX,
    NB_POINTS_FIRST_DEPOSIT_USER_ON_BOX,
    NB_POINTS_FIRST_SONG_DEPOSIT_BOX,
    NB_POINTS_FIRST_SONG_DEPOSIT_GLOBAL,
)
from users.models import CustomUser


def _get_consecutive_deposit_days(user: CustomUser | None, box) -> int:
    if not user:
        return 0

    today = localdate()
    target = today - timedelta(days=1)
    streak = 0

    dates = Deposit.objects.filter(user=user, box=box).order_by("-deposited_at").values_list("deposited_at", flat=True)

    seen_days: list = []
    for dt in dates:
        try:
            d = localtime(dt).date()
        except Exception:
            d = timezone.localtime(dt).date()
        if not seen_days or seen_days[-1] != d:
            seen_days.append(d)

    for d in seen_days:
        if d == target:
            streak += 1
            target -= timedelta(days=1)
        elif d < target:
            break

    return streak


def _build_successes(
    *, box, user: CustomUser | None, song: Song, current_deposit: Deposit | None = None
) -> tuple[list[dict[str, Any]], int]:
    title = (getattr(song, "title", "") or "").strip()
    artist = (getattr(song, "artist", "") or "").strip()

    successes: dict[str, dict[str, Any]] = {}
    points_to_add = int(NB_POINTS_ADD_SONG)

    def _compute_streak_from_dates(dates: list) -> int:
        if not dates:
            return 0

        today = localdate()
        target = today - timedelta(days=1)
        streak = 0

        seen_days: list = []
        for dt in dates:
            try:
                d = localtime(dt).date()
            except Exception:
                d = timezone.localtime(dt).date()
            if not seen_days or seen_days[-1] != d:
                seen_days.append(d)

        for d in seen_days:
            if d == target:
                streak += 1
                target -= timedelta(days=1)
            elif d < target:
                break

        return streak

    exclude_current_filter: dict[str, Any] = {}
    if current_deposit is not None and getattr(current_deposit, "pk", None):
        exclude_current_filter["pk"] = current_deposit.pk

    user_box_dates: list = []
    has_user_deposit_in_box = False
    if user:
        user_box_qs = Deposit.objects.filter(user=user, box=box)
        if exclude_current_filter:
            user_box_qs = user_box_qs.exclude(**exclude_current_filter)

        user_box_dates = list(user_box_qs.order_by("-deposited_at").values_list("deposited_at", flat=True))
        has_user_deposit_in_box = len(user_box_dates) > 0

    song_box_ids: list[int] = []
    if title and artist:
        song_deposits_qs = Deposit.objects.filter(song=song)
        if exclude_current_filter:
            song_deposits_qs = song_deposits_qs.exclude(**exclude_current_filter)

        song_box_ids = list(song_deposits_qs.values_list("box_id", flat=True))

    nb_consecutive_days = _compute_streak_from_dates(user_box_dates) if user else 0
    if nb_consecutive_days > 0:
        bonus = nb_consecutive_days * int(NB_POINTS_CONSECUTIVE_DAYS_BOX)
        points_to_add += bonus
        successes["consecutive_days"] = {
            "name": "Amour fou",
            "desc": f"{nb_consecutive_days + 1} jours consécutifs avec cette boite",
            "points": bonus,
            "emoji": "🔥",
        }

    if user and not has_user_deposit_in_box:
        points_to_add += int(NB_POINTS_FIRST_DEPOSIT_USER_ON_BOX)
        successes["first_user_deposit_box"] = {
            "name": "Explorateur·ice",
            "desc": "C’est ta première chanson dans cette boîte",
            "points": int(NB_POINTS_FIRST_DEPOSIT_USER_ON_BOX),
            "emoji": "🔍",
        }

    is_first_song_in_box = False
    if title and artist:
        is_first_song_in_box = box.id not in song_box_ids

    if is_first_song_in_box:
        points_to_add += int(NB_POINTS_FIRST_SONG_DEPOSIT_BOX)
        successes["first_song_deposit"] = {
            "name": "Far West",
            "desc": "Cette chanson n’a jamais été déposée dans cette boîte",
            "points": int(NB_POINTS_FIRST_SONG_DEPOSIT_BOX),
            "emoji": "🤠",
        }

    is_first_song_global = False
    if title and artist:
        is_first_song_global = len(song_box_ids) == 0

    if is_first_song_global:
        points_to_add += int(NB_POINTS_FIRST_SONG_DEPOSIT_GLOBAL)
        successes["first_song_deposit_global"] = {
            "name": "Preums",
            "desc": "Cette chanson n'a jamais été déposée sur le réseau",
            "points": int(NB_POINTS_FIRST_SONG_DEPOSIT_GLOBAL),
            "emoji": "🥇",
        }

    successes["default_deposit"] = {
        "name": "Pépite",
        "desc": "Tu as partagé·e une chanson",
        "points": int(NB_POINTS_ADD_SONG),
        "emoji": "💎",
    }
    successes["points_total"] = {"name": "Total", "points": points_to_add}

    return list(successes.values()), points_to_add


__all__ = ["_build_successes", "_get_consecutive_deposit_days"]
