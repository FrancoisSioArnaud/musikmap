import json
from pathlib import Path
from typing import Any

from django.db.models import Prefetch
from django.utils import timezone

from box_management.models import Deposit, Reaction

PINNED_PRICE_STEPS_PATH = Path(__file__).resolve().parents[2] / "data" / "pinned_price_steps.json"


def load_pinned_price_steps() -> list[dict[str, int]]:
    try:
        raw = json.loads(PINNED_PRICE_STEPS_PATH.read_text(encoding="utf-8"))
    except Exception:
        raw = []

    steps: list[dict[str, int]] = []
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        try:
            minutes = int(item.get("minutes"))
            points = int(item.get("points"))
        except (TypeError, ValueError):
            continue
        if minutes <= 0 or points <= 0:
            continue
        steps.append({"minutes": minutes, "points": points})

    steps.sort(key=lambda entry: entry["minutes"])
    return steps


def get_pinned_price_steps_raw() -> list[dict[str, int]]:
    return load_pinned_price_steps()


def get_pinned_price_step(duration_minutes: int) -> dict[str, int] | None:
    try:
        duration_minutes = int(duration_minutes)
    except (TypeError, ValueError):
        return None

    for step in load_pinned_price_steps():
        if step["minutes"] == duration_minutes:
            return step
    return None


def build_pinned_price_steps_payload(*, user_points: int | None = None) -> list[dict[str, Any]]:
    points_value = None
    try:
        if user_points is not None:
            points_value = int(user_points)
    except (TypeError, ValueError):
        points_value = None

    payload: list[dict[str, Any]] = []
    for step in load_pinned_price_steps():
        price = int(step["points"])
        payload.append(
            {
                "minutes": int(step["minutes"]),
                "points": price,
                "is_affordable": (points_value is None) or (points_value >= price),
            }
        )
    return payload


def get_active_pinned_deposit_for_box(box, *, for_update: bool = False):
    qs = (
        Deposit.objects.filter(
            box=box,
            deposit_type=Deposit.DEPOSIT_TYPE_PINNED,
            pin_expires_at__gt=timezone.now(),
        )
        .select_related("song", "user", "box")
        .prefetch_related(
            Prefetch(
                "reactions",
                queryset=Reaction.objects.select_related("emoji", "user").order_by("created_at", "id"),
                to_attr="prefetched_reactions",
            )
        )
        .order_by("-pin_expires_at", "-deposited_at", "-id")
    )
    if for_update:
        qs = qs.select_for_update()
    return qs.first()


__all__ = [
    "load_pinned_price_steps",
    "build_pinned_price_steps_payload",
    "get_active_pinned_deposit_for_box",
    "get_pinned_price_step",
    "get_pinned_price_steps_raw",
]
