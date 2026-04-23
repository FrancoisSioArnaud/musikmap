# ruff: noqa: UP017
from collections.abc import Iterable, Sequence
from datetime import timezone as dt_timezone
from typing import Any

from django.conf import settings

from box_management.builders.comment_payloads import _build_comments_context_for_deposits
from box_management.models import Deposit, DiscoveredSong
from box_management.provider_services import get_song_provider_links_map
from users.models import CustomUser


def _build_user_from_instance(user: CustomUser | None) -> dict[str, Any]:
    default_pic = f"{settings.STATIC_URL.rstrip('/')}/img/default_profile.jpg"
    if not user:
        return {
            "id": None,
            "username": None,
            "display_name": "anonyme",
            "profile_picture_url": default_pic,
            "is_guest": False,
        }

    pic = getattr(user, "profile_picture", None)
    profile_url = pic.url if pic else default_pic
    is_guest = bool(getattr(user, "is_guest", False))
    username = None if is_guest else getattr(user, "username", None)
    display_name = "Invité" if is_guest else (getattr(user, "username", None) or "anonyme")

    return {
        "id": getattr(user, "id", None),
        "username": username,
        "display_name": display_name,
        "profile_picture_url": profile_url,
        "is_guest": is_guest,
    }


def _build_song_from_instance(song, hidden: bool) -> dict[str, Any]:
    if hidden:
        return {"image_url": song.image_url, "image_url_small": song.image_url_small or None}

    provider_links = get_song_provider_links_map(song)
    spotify_link = provider_links.get("spotify") or {}
    deezer_link = provider_links.get("deezer") or {}

    return {
        "public_key": song.public_key,
        "image_url": song.image_url,
        "image_url_small": song.image_url_small or None,
        "title": song.title,
        "artists": list(song.artists_json or []),
        "artist": song.artist,
        "duration": int(getattr(song, "duration", 0) or 0),
        "isrc": (getattr(song, "isrc", "") or "") or None,
        "provider_links": provider_links,
        "spotify_url": spotify_link.get("provider_url") or None,
        "deezer_url": deezer_link.get("provider_url") or None,
    }


def _iter_reactions_from_instance(dep: Deposit):
    reacs = getattr(dep, "prefetched_reactions", None)
    if reacs is not None:
        return reacs
    return dep.reactions.select_related("emoji", "user").order_by("created_at", "id").all()


def _build_reactions_from_instance(dep: Deposit, current_user: CustomUser | None = None) -> dict[str, Any]:
    current_user_id = getattr(current_user, "id", None) if current_user else None

    detail: list[dict[str, Any]] = []
    mine: dict[str, Any] | None = None

    for r in _iter_reactions_from_instance(dep):
        if not getattr(r.emoji, "active", True):
            continue
        payload = {
            "user": _build_user_from_instance(getattr(r, "user", None)),
            "emoji": r.emoji.char,
        }
        if current_user_id is not None and r.user_id == current_user_id:
            mine = {"emoji": r.emoji.char}
        detail.append(payload)

    return {"detail": detail, "mine": mine}


def _build_deposit_from_instance(
    dep: Deposit,
    *,
    include_user: bool,
    include_deposit_time: bool,
    hidden: bool,
    current_user: CustomUser | None = None,
    comments_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "public_key": dep.public_key,
        "deposit_type": getattr(dep, "deposit_type", Deposit.DEPOSIT_TYPE_BOX),
        "song": _build_song_from_instance(dep.song, hidden),
        "accent_color": (getattr(dep.song, "accent_color", "") or "") or None,
        "pin_expires_at": dep.pin_expires_at.isoformat() if getattr(dep, "pin_expires_at", None) else None,
        "pin_duration_minutes": int(getattr(dep, "pin_duration_minutes", 0) or 0),
        "pin_points_spent": int(getattr(dep, "pin_points_spent", 0) or 0),
    }

    if include_deposit_time:
        payload["deposited_at"] = dep.deposited_at.astimezone(dt_timezone.utc).isoformat()

    if include_user:
        payload["user"] = _build_user_from_instance(dep.user)

    rx = _build_reactions_from_instance(dep, current_user=current_user)
    payload["reactions"] = rx["detail"]
    payload["my_reaction"] = rx["mine"]
    payload["comments"] = comments_context or {"items": [], "count": 0, "viewer_state": {}}

    return payload


def _build_deposits_payload(
    deposits: Deposit | Iterable[Deposit] | Sequence[Deposit],
    *,
    viewer: CustomUser | None = None,
    include_user: bool = True,
    include_deposit_time: bool = True,
    force_song_infos_for: Iterable[int] | None = None,
) -> list[dict[str, Any]]:
    if isinstance(deposits, Deposit):
        deps: list[Deposit] = [deposits]
    else:
        deps = list(deposits or [])

    if not deps:
        return []

    force_ids = set(force_song_infos_for or [])

    public_visible_ids = {
        d.pk
        for d in deps
        if getattr(d, "deposit_type", Deposit.DEPOSIT_TYPE_BOX)
        in (
            Deposit.DEPOSIT_TYPE_FAVORITE,
            Deposit.DEPOSIT_TYPE_PINNED,
        )
    }

    if viewer is None:
        revealed_ids = public_visible_ids
    else:
        viewer_id = getattr(viewer, "id", None)
        dep_ids = [d.pk for d in deps]

        own_dep_ids = {d.pk for d in deps if getattr(d, "user_id", None) == viewer_id} | public_visible_ids

        remaining_ids = [i for i in dep_ids if i not in own_dep_ids]

        discovered_ids = set()
        if remaining_ids:
            discovered_ids = set(
                DiscoveredSong.objects.filter(user_id=viewer_id, deposit_id__in=remaining_ids).values_list(
                    "deposit_id", flat=True
                )
            )

        revealed_ids = own_dep_ids | discovered_ids

    comments_by_deposit = _build_comments_context_for_deposits(deps, viewer=viewer, include_items=False)

    out: list[dict[str, Any]] = []
    for dep in deps:
        hidden = (dep.pk not in revealed_ids) and (dep.pk not in force_ids)

        payload = _build_deposit_from_instance(
            dep,
            include_user=include_user,
            include_deposit_time=include_deposit_time,
            hidden=hidden,
            current_user=viewer,
            comments_context=comments_by_deposit.get(dep.pk) or {"items": [], "viewer_state": {}},
        )
        out.append(payload)

    return out


__all__ = [
    "_build_comments_context_for_deposits",
    "_build_deposit_from_instance",
    "_build_deposits_payload",
    "_build_reactions_from_instance",
    "_build_song_from_instance",
    "_build_user_from_instance",
]
