# ruff: noqa: UP017
from collections.abc import Iterable
from datetime import timezone as dt_timezone
from typing import Any

from box_management.models import Comment, CommentUserRestriction, Deposit
from box_management.services.comments.moderation_rules import (
    get_active_comment_restrictions_for_clients,
    is_full_comment_user,
)
from users.models import CustomUser


def _get_comment_snapshot_user_payload(comment: Comment) -> dict[str, Any]:
    from box_management.builders.deposit_payloads import build_user_payload_from_instance

    user = getattr(comment, "user", None)
    if user and not getattr(user, "is_guest", False):
        return build_user_payload_from_instance(user)
    return {
        "id": getattr(comment, "user_id", None),
        "username": comment.author_username or None,
        "display_name": comment.author_display_name or comment.author_username or "anonyme",
        "profile_picture_url": comment.author_avatar_url or None,
        "is_guest": False,
    }


def _build_comment_item_from_instance(comment: Comment, *, viewer_id: int | None = None) -> dict[str, Any]:
    from box_management.builders.deposit_payloads import build_deposit_payload_from_instance

    payload = {
        "id": comment.id,
        "text": comment.text,
        "created_at": comment.created_at.astimezone(dt_timezone.utc).isoformat(),
        "user": _get_comment_snapshot_user_payload(comment),
        "is_mine": bool(viewer_id and comment.user_id == viewer_id),
    }
    reply_deposit = getattr(comment, "reply_deposit", None)
    if reply_deposit:
        payload["reply_deposit"] = build_deposit_payload_from_instance(
            reply_deposit,
            include_user=True,
            include_deposit_time=True,
            hidden=False,
            current_user=None,
            comments_context={"items": [], "viewer_state": {}},
        )
    return payload


def _build_comment_viewer_state(
    *,
    viewer: CustomUser | None,
    dep: Deposit,
    has_consecutive_block: bool,
    restriction: CommentUserRestriction | None,
):
    if not is_full_comment_user(viewer):
        return {
            "can_post": False,
            "has_spent_right": False,
            "status": None,
            "comment_id": None,
            "notice": None,
            "restriction": None,
        }

    restriction_payload = None
    if restriction:
        restriction_payload = {
            "restriction_type": restriction.restriction_type,
            "reason_code": restriction.reason_code or "",
            "ends_at": restriction.ends_at.astimezone(dt_timezone.utc).isoformat() if restriction.ends_at else None,
        }

    if restriction:
        return {
            "can_post": False,
            "has_spent_right": False,
            "status": None,
            "comment_id": None,
            "notice": "Vous ne pouvez pas commenter pour le moment.",
            "restriction": restriction_payload,
        }

    return {
        "can_post": True,
        "has_spent_right": False,
        "status": None,
        "comment_id": None,
        "notice": None,
        "restriction": restriction_payload,
    }


def build_comments_context_for_deposits(
    deposits: Iterable[Deposit], *, viewer: CustomUser | None = None, include_items: bool = True
):
    deps = list(deposits or [])
    if not deps:
        return {}

    dep_ids = [dep.id for dep in deps if getattr(dep, "id", None)]
    if not dep_ids:
        return {}

    viewer_id = getattr(viewer, "id", None) if is_full_comment_user(viewer) else None
    comments_by_dep = {dep_id: [] for dep_id in dep_ids}
    published_counts_by_dep = {dep_id: 0 for dep_id in dep_ids}
    last_published_user_by_dep = {}

    comments_qs = (
        Comment.objects.filter(deposit_id__in=dep_ids)
        .select_related("user", "reply_deposit", "reply_deposit__song", "reply_deposit__user")
        .order_by("created_at", "id")
        .filter(status=Comment.STATUS_PUBLISHED)
    )

    for comment in comments_qs:
        dep_id = comment.deposit_id
        published_counts_by_dep[dep_id] = int(published_counts_by_dep.get(dep_id, 0)) + 1
        last_published_user_by_dep[dep_id] = comment.user_id
        if include_items:
            comments_by_dep.setdefault(dep_id, []).append(_build_comment_item_from_instance(comment, viewer_id=viewer_id))

    client_id_by_dep_id = {}
    missing_dep_ids = []
    for dep in deps:
        cached_box = getattr(getattr(dep, "_state", None), "fields_cache", {}).get("box")
        if cached_box is not None:
            client_id_by_dep_id[dep.id] = getattr(cached_box, "client_id", None)
        else:
            missing_dep_ids.append(dep.id)

    if missing_dep_ids:
        client_id_by_dep_id.update(
            {
                deposit_id: client_id
                for deposit_id, client_id in Deposit.objects.filter(id__in=missing_dep_ids).values_list(
                    "id", "box__client_id"
                )
            }
        )

    restriction_by_client = get_active_comment_restrictions_for_clients(
        viewer,
        [client_id for client_id in client_id_by_dep_id.values() if client_id],
    )

    payload = {}
    for dep in deps:
        restriction = restriction_by_client.get(client_id_by_dep_id.get(dep.id))
        has_consecutive_block = bool(viewer_id and last_published_user_by_dep.get(dep.id) == viewer_id)
        payload[dep.id] = {
            "items": comments_by_dep.get(dep.id, []),
            "count": int(published_counts_by_dep.get(dep.id, 0)),
            "viewer_state": _build_comment_viewer_state(
                viewer=viewer,
                dep=dep,
                has_consecutive_block=has_consecutive_block,
                restriction=restriction,
            ),
        }
    return payload


def build_client_admin_comment_payload(comment):
    from box_management.services.comments.moderation_rules import get_profile_picture_url

    reports = list(getattr(comment, "prefetched_reports", []) or [])
    decisions = list(getattr(comment, "prefetched_decisions", []) or [])
    latest_decision = decisions[0] if decisions else None

    user = getattr(comment, "user", None)
    profile_picture_url = get_profile_picture_url(user) if user else (comment.author_avatar_url or None)

    return {
        "id": comment.id,
        "text": comment.text,
        "status": comment.status,
        "reason_code": comment.reason_code or "",
        "risk_score": int(comment.risk_score or 0),
        "risk_flags": list(comment.risk_flags or []),
        "reports_count": int(comment.reports_count or 0),
        "created_at": comment.created_at.isoformat(),
        "updated_at": comment.updated_at.isoformat() if getattr(comment, "updated_at", None) else None,
        "deposit_deleted": bool(comment.deposit_deleted or not comment.deposit_id),
        "deposit": {
            "public_key": comment.deposit_public_key
            or (comment.deposit.public_key if getattr(comment, "deposit", None) else ""),
            "box_name": comment.deposit_box_name
            or (
                comment.deposit.box.name
                if getattr(comment, "deposit", None) and getattr(comment.deposit, "box", None)
                else ""
            ),
            "box_url": comment.deposit_box_url
            or (
                comment.deposit.box.url
                if getattr(comment, "deposit", None) and getattr(comment.deposit, "box", None)
                else ""
            ),
        },
        "author": {
            "id": comment.user_id,
            "username": getattr(user, "username", None) or comment.author_username or None,
            "display_name": getattr(user, "username", None)
            or comment.author_display_name
            or comment.author_username
            or "anonyme",
            "email": getattr(user, "email", None) or comment.author_email or None,
            "profile_picture_url": profile_picture_url,
        },
        "report_reason_codes": [r.reason_code for r in reports],
        "latest_decision": (
            {
                "decision_code": latest_decision.decision_code,
                "reason_code": latest_decision.reason_code,
                "internal_note": latest_decision.internal_note,
                "created_at": latest_decision.created_at.isoformat(),
                "acted_by": getattr(latest_decision.acted_by, "username", None),
            }
            if latest_decision
            else None
        ),
    }


def build_comment_restriction_payload(restriction):
    return {
        "id": restriction.id,
        "user_id": restriction.user_id,
        "username": getattr(restriction.user, "username", None),
        "email": getattr(restriction.user, "email", None),
        "restriction_type": restriction.restriction_type,
        "reason_code": restriction.reason_code or "",
        "internal_note": restriction.internal_note or "",
        "starts_at": restriction.starts_at.isoformat() if restriction.starts_at else None,
        "ends_at": restriction.ends_at.isoformat() if restriction.ends_at else None,
        "created_at": restriction.created_at.isoformat() if restriction.created_at else None,
        "created_by": getattr(restriction.created_by, "username", None),
    }


__all__ = [
    "build_client_admin_comment_payload",
    "build_comment_restriction_payload",
    "build_comments_context_for_deposits",
]
