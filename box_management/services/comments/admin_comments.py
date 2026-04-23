from datetime import timedelta

from django.db.models import Q
from rest_framework import status

from box_management.models import Comment, CommentAttemptLog, CommentUserRestriction
from box_management.selectors.comments import get_client_admin_comments
from users.models import CustomUser


def list_client_admin_comments(*, client_id, tab):
    return {"items": get_client_admin_comments(client_id=client_id, tab=tab)}, None


def list_comment_restrictions(*, client_id, show_all, now_dt):
    qs = CommentUserRestriction.objects.filter(client_id=client_id).select_related("user", "created_by")
    if not show_all:
        qs = qs.filter(starts_at__lte=now_dt).filter(Q(ends_at__isnull=True) | Q(ends_at__gt=now_dt))
    return {"items": list(qs.order_by("-created_at", "-id")[:100])}, None


def create_comment_restriction(*, client_id, actor, user_id, restriction_type, reason_code, internal_note, now_dt):
    target_user = CustomUser.objects.filter(pk=user_id, is_guest=False).first()
    if not target_user:
        return None, {
            "status": status.HTTP_404_NOT_FOUND,
            "code": "USER_NOT_FOUND",
            "detail": "Utilisateur introuvable.",
        }

    has_client_comment_activity = Comment.objects.filter(client_id=client_id, user_id=target_user.id).exists()
    has_client_attempt_activity = CommentAttemptLog.objects.filter(client_id=client_id, user_id=target_user.id).exists()
    if not (has_client_comment_activity or has_client_attempt_activity):
        return None, {
            "status": status.HTTP_403_FORBIDDEN,
            "code": "COMMENT_RESTRICTION_TARGET_NOT_ELIGIBLE",
            "detail": "Vous ne pouvez sanctionner que des utilisateurs ayant déjà interagi avec vos commentaires.",
        }

    if restriction_type not in {
        CommentUserRestriction.TYPE_MUTE_24H,
        CommentUserRestriction.TYPE_MUTE_7D,
        CommentUserRestriction.TYPE_BAN,
    }:
        return None, {
            "status": status.HTTP_400_BAD_REQUEST,
            "code": "COMMENT_RESTRICTION_TYPE_INVALID",
            "detail": "restriction_type invalide.",
        }

    ends_at = None
    if restriction_type == CommentUserRestriction.TYPE_MUTE_24H:
        ends_at = now_dt + timedelta(hours=24)
    elif restriction_type == CommentUserRestriction.TYPE_MUTE_7D:
        ends_at = now_dt + timedelta(days=7)

    restriction = CommentUserRestriction.objects.create(
        client_id=client_id,
        user=target_user,
        created_by=actor,
        restriction_type=restriction_type,
        reason_code=reason_code,
        internal_note=internal_note,
        starts_at=now_dt,
        ends_at=ends_at,
    )
    restriction = CommentUserRestriction.objects.select_related("user", "created_by").get(pk=restriction.pk)
    return {"item": restriction}, None
