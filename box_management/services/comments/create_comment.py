from datetime import timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.timezone import localdate
from rest_framework import status

from box_management.domain.constants import (
    COMMENT_COOLDOWN_SECONDS,
    COMMENT_REASON_ALREADY_COMMENTED,
    COMMENT_REASON_CONSECUTIVE_BLOCKED,
    COMMENT_REASON_EMPTY,
    COMMENT_REASON_RATE_LIMIT,
    COMMENT_REASON_RESTRICTED,
    COMMENT_REASON_RISK_QUARANTINE,
    COMMENT_REASON_TARGET_USER_DAILY_COMMENT_LIMIT_REACHED,
    COMMENT_TARGET_USER_DAILY_LIMIT,
)
from box_management.models import Comment, CommentModerationDecision, Deposit
from box_management.selectors.boxes import get_active_box_session
from box_management.selectors.deposits import get_deposit_for_comment
from box_management.services.comments.moderation_rules import (
    _detect_comment_pre_creation_error,
    _get_active_comment_restrictions_for_clients,
    _get_profile_picture_url,
    _log_blocked_comment_attempt,
    _normalize_comment_text,
    _score_comment_risk,
)
from box_management.services.deposits.song_creation import create_song_deposit


def _is_consecutive_comment_blocked(*, deposit, user):
    last_visible_comment = (
        Comment.objects.filter(deposit=deposit, status=Comment.STATUS_PUBLISHED).order_by("-created_at", "-id").first()
    )
    return bool(last_visible_comment and last_visible_comment.user_id == user.id)


def create_comment(*, user, dep_public_key, text_value, song_option, author_ip, author_user_agent):
    normalized_text = _normalize_comment_text(text_value)
    deposit = get_deposit_for_comment(dep_public_key)
    if not deposit:
        return None, {"status": status.HTTP_404_NOT_FOUND, "code": "DEPOSIT_NOT_FOUND", "detail": "Dépôt introuvable."}

    if getattr(deposit, "box", None) and getattr(deposit, "deposit_type", "box") != "favorite":
        if not get_active_box_session(user, deposit.box):
            return None, {
                "status": status.HTTP_403_FORBIDDEN,
                "code": "BOX_SESSION_REQUIRED",
                "detail": "Ouvre la boîte pour continuer.",
            }

    client = getattr(getattr(deposit, "box", None), "client", None)
    if not client and getattr(deposit, "deposit_type", "box") != "favorite":
        return None, {
            "status": status.HTTP_400_BAD_REQUEST,
            "code": "DEPOSIT_CLIENT_NOT_FOUND",
            "detail": "Client introuvable pour ce dépôt.",
        }

    has_text = bool((text_value or "").strip())
    has_song = bool(song_option)
    if not has_text and not has_song:
        return None, {"reason_code": COMMENT_REASON_EMPTY, "status": status.HTTP_400_BAD_REQUEST}

    active_restriction = (
        _get_active_comment_restrictions_for_clients(user, [client.id]).get(client.id) if client else None
    )
    if active_restriction:
        _log_blocked_comment_attempt(
            client=client,
            deposit=deposit,
            user=user,
            text=text_value,
            normalized_text=normalized_text,
            reason_code=COMMENT_REASON_RESTRICTED,
            author_ip=author_ip,
            author_user_agent=author_user_agent,
            meta={"restriction_type": active_restriction.restriction_type},
        )
        return None, {"reason_code": COMMENT_REASON_RESTRICTED, "status": status.HTTP_403_FORBIDDEN}

    pre_creation_error = _detect_comment_pre_creation_error(text_value) if has_text else None
    if pre_creation_error:
        _log_blocked_comment_attempt(
            client=client,
            deposit=deposit,
            user=user,
            text=text_value,
            normalized_text=normalized_text,
            reason_code=pre_creation_error,
            author_ip=author_ip,
            author_user_agent=author_user_agent,
        )
        return None, {"reason_code": pre_creation_error, "status": status.HTTP_400_BAD_REQUEST}

    if deposit.user_id and deposit.user_id != user.id:
        daily_target_count = Comment.objects.filter(
            user=user, client=client, deposit_owner_user_id=deposit.user_id, created_at__date=localdate()
        ).count()
        if daily_target_count >= COMMENT_TARGET_USER_DAILY_LIMIT:
            _log_blocked_comment_attempt(
                client=client,
                deposit=deposit,
                user=user,
                text=text_value,
                normalized_text=normalized_text,
                reason_code=COMMENT_REASON_TARGET_USER_DAILY_COMMENT_LIMIT_REACHED,
                author_ip=author_ip,
                author_user_agent=author_user_agent,
                meta={"target_owner_user_id": deposit.user_id},
            )
            return None, {
                "reason_code": COMMENT_REASON_TARGET_USER_DAILY_COMMENT_LIMIT_REACHED,
                "status": status.HTTP_403_FORBIDDEN,
            }

    if _is_consecutive_comment_blocked(deposit=deposit, user=user):
        _log_blocked_comment_attempt(
            client=client,
            deposit=deposit,
            user=user,
            text=text_value,
            normalized_text=normalized_text,
            reason_code=COMMENT_REASON_CONSECUTIVE_BLOCKED,
            author_ip=author_ip,
            author_user_agent=author_user_agent,
        )
        return None, {"reason_code": COMMENT_REASON_CONSECUTIVE_BLOCKED, "status": status.HTTP_400_BAD_REQUEST}

    recent_cutoff = timezone.now() - timedelta(seconds=COMMENT_COOLDOWN_SECONDS)
    if Comment.objects.filter(user=user, created_at__gte=recent_cutoff).exists():
        _log_blocked_comment_attempt(
            client=client,
            deposit=deposit,
            user=user,
            text=text_value,
            normalized_text=normalized_text,
            reason_code=COMMENT_REASON_RATE_LIMIT,
            author_ip=author_ip,
            author_user_agent=author_user_agent,
        )
        return None, {"reason_code": COMMENT_REASON_RATE_LIMIT, "status": status.HTTP_429_TOO_MANY_REQUESTS}

    risk_score, risk_flags = _score_comment_risk(text=text_value, normalized_text=normalized_text)
    comment_status = Comment.STATUS_PUBLISHED
    reason_code = ""
    if risk_score >= 70:
        comment_status = Comment.STATUS_QUARANTINED
        reason_code = risk_flags[0] if risk_flags else COMMENT_REASON_RISK_QUARANTINE

    try:
        with transaction.atomic():
            reply_deposit = None
            if has_song:
                reply_deposit, _, _ = create_song_deposit(
                    request=None,
                    user=user,
                    option=song_option,
                    deposit_type=Deposit.DEPOSIT_TYPE_COMMENT,
                    box=deposit.box,
                    reuse_recent_window_seconds=0,
                )

            comment = Comment.objects.create(
                client=client,
                deposit=deposit,
                reply_deposit=reply_deposit,
                user=user,
                text=text_value,
                normalized_text=normalized_text,
                status=comment_status,
                reason_code=reason_code,
                risk_score=risk_score,
                risk_flags=risk_flags,
                deposit_public_key=deposit.public_key or "",
                deposit_box_name=getattr(deposit.box, "name", "") or "",
                deposit_box_url=getattr(deposit.box, "url", "") or "",
                deposit_deleted=False,
                deposit_owner_user_id=getattr(deposit, "user_id", None),
                deposit_owner_username=getattr(getattr(deposit, "user", None), "username", "") or "",
                author_username=user.username or "",
                author_display_name=getattr(user, "display_name", None) or user.username or "",
                author_email=user.email or "",
                author_avatar_url=_get_profile_picture_url(user) or "",
                author_ip=author_ip,
                author_user_agent=(author_user_agent or "")[:255],
            )
    except IntegrityError:
        return None, {"reason_code": COMMENT_REASON_ALREADY_COMMENTED, "status": status.HTTP_400_BAD_REQUEST}
    except ValueError:
        return None, {
            "status": status.HTTP_400_BAD_REQUEST,
            "code": "INVALID_SONG_OPTION",
            "detail": "Chanson invalide.",
        }

    if comment_status == Comment.STATUS_QUARANTINED:
        CommentModerationDecision.objects.create(
            comment=comment,
            acted_by=None,
            decision_code="auto_quarantine",
            reason_code=reason_code or COMMENT_REASON_RISK_QUARANTINE,
            internal_note=", ".join(risk_flags or []),
        )

    return {"comment": comment, "deposit": deposit}, None
