from datetime import timedelta
from typing import Any

from django.db.models import Prefetch
from django.utils import timezone

from box_management.models import Deposit, Reaction, Song
from box_management.provider_services import (
    get_or_create_song_from_track,
    normalize_track_payload,
    upsert_song_provider_link,
)
from box_management.services.deposits.accent_color import extract_accent_color_from_urls
from box_management.services.deposits.achievements import _build_successes
from users.models import CustomUser


def _get_prev_head_and_older(box, limit: int = 10, exclude_deposit_ids: list[int] | None = None):
    qs = (
        Deposit.objects.filter(box=box, deposit_type=Deposit.DEPOSIT_TYPE_BOX)
        .select_related("song", "user")
        .prefetch_related(
            Prefetch(
                "reactions",
                queryset=Reaction.objects.select_related("emoji", "user").order_by("created_at", "id"),
                to_attr="prefetched_reactions",
            )
        )
        .order_by("-deposited_at", "-id")
    )

    exclude_ids = [int(dep_id) for dep_id in (exclude_deposit_ids or []) if dep_id]
    if exclude_ids:
        qs = qs.exclude(pk__in=exclude_ids)

    deposits = list(qs[: limit + 1])
    if not deposits:
        return None, []

    prev_head = deposits[0]
    older_deposits_qs = deposits[1:]
    return prev_head, older_deposits_qs


def _find_recent_duplicate_deposit(
    *, user: CustomUser, song: Song, deposit_type: str, box=None, window_seconds: int = 0
):
    if int(window_seconds or 0) <= 0:
        return None

    threshold = timezone.now() - timedelta(seconds=int(window_seconds))
    qs = (
        Deposit.objects.filter(
            user=user,
            song=song,
            deposit_type=deposit_type,
            deposited_at__gte=threshold,
        )
        .select_related("song", "box", "user")
        .order_by("-deposited_at", "-id")
    )

    if deposit_type in (Deposit.DEPOSIT_TYPE_BOX, Deposit.DEPOSIT_TYPE_PINNED, Deposit.DEPOSIT_TYPE_COMMENT):
        qs = qs.filter(box=box)
    else:
        qs = qs.filter(box__isnull=True)

    return qs.first()


def create_song_deposit(
    *,
    request,
    user: CustomUser,
    option: dict[str, Any],
    deposit_type: str = "box",
    box=None,
    pin_duration_minutes: int | None = None,
    pin_points_spent: int = 0,
    pin_expires_at=None,
    reuse_recent_window_seconds: int = 0,
):
    track = normalize_track_payload(option or {})
    if not track.get("title") or not (track.get("artists") or []):
        raise ValueError("Titre ou artiste manquant")

    song = get_or_create_song_from_track(track)

    update_fields: list[str] = []
    if track.get("image_url") and not (song.image_url or "").strip():
        song.image_url = track["image_url"]
        update_fields.append("image_url")
    if track.get("image_url_small") and not (song.image_url_small or "").strip():
        song.image_url_small = track["image_url_small"]
        update_fields.append("image_url_small")
    if track.get("isrc") and not (song.isrc or "").strip():
        song.isrc = track["isrc"]
        update_fields.append("isrc")
    if track.get("artists") and not (song.artists_json or []):
        song.artists_json = list(track["artists"])
        update_fields.append("artists_json")
    if track.get("duration") and not int(song.duration or 0):
        song.duration = int(track["duration"])
        update_fields.append("duration")

    if not (song.accent_color or "").strip():
        accent_color = (
            extract_accent_color_from_urls(
                image_url_small=(track.get("image_url_small") or song.image_url_small or ""),
                image_url=(track.get("image_url") or song.image_url or ""),
            )
            or ""
        )
        if accent_color:
            song.accent_color = accent_color
            update_fields.append("accent_color")

    if update_fields:
        song.save(update_fields=update_fields)

    upsert_song_provider_link(song, track)

    provider_code = (track.get("provider_code") or "").strip().lower()
    if provider_code:
        try:
            from users.provider_connections import set_last_platform_for_user

            set_last_platform_for_user(user, provider_code)
        except Exception:
            pass

    if (
        deposit_type in (Deposit.DEPOSIT_TYPE_BOX, Deposit.DEPOSIT_TYPE_PINNED, Deposit.DEPOSIT_TYPE_COMMENT)
        and box is None
    ):
        raise ValueError("Boîte introuvable")

    recent_duplicate = _find_recent_duplicate_deposit(
        user=user,
        song=song,
        deposit_type=deposit_type,
        box=box,
        window_seconds=reuse_recent_window_seconds,
    )
    if recent_duplicate is not None:
        return recent_duplicate, song, False

    if deposit_type in (Deposit.DEPOSIT_TYPE_BOX, Deposit.DEPOSIT_TYPE_PINNED, Deposit.DEPOSIT_TYPE_COMMENT):
        Song.objects.filter(pk=song.pk).update(n_deposits=int(song.n_deposits or 0) + 1)
        song.n_deposits = int(song.n_deposits or 0) + 1

    deposit = Deposit.objects.create(
        song=song,
        box=box
        if deposit_type in (Deposit.DEPOSIT_TYPE_BOX, Deposit.DEPOSIT_TYPE_PINNED, Deposit.DEPOSIT_TYPE_COMMENT)
        else None,
        user=user,
        deposit_type=deposit_type,
        pin_duration_minutes=pin_duration_minutes,
        pin_points_spent=int(pin_points_spent or 0),
        pin_expires_at=pin_expires_at,
    )
    return deposit, song, True


__all__ = ["_build_successes", "_find_recent_duplicate_deposit", "_get_prev_head_and_older", "create_song_deposit"]
