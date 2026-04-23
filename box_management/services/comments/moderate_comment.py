from rest_framework import status

from box_management.domain.constants import COMMENT_REASON_REMOVE_BY_MODERATION
from box_management.models import Comment, CommentModerationDecision
from box_management.selectors.comments import get_client_comment_for_moderation, get_client_moderated_comment


def moderate_comment(*, client_id, actor, comment_id, action, reason_code, note):
    comment = get_client_comment_for_moderation(client_id=client_id, comment_id=comment_id)
    if not comment:
        return None, {
            "status": status.HTTP_404_NOT_FOUND,
            "code": "COMMENT_NOT_FOUND",
            "detail": "Commentaire introuvable.",
        }

    if action == "publish":
        comment.status = Comment.STATUS_PUBLISHED
        comment.reason_code = reason_code or ""
        decision_code = "publish"
    elif action == "remove":
        comment.status = Comment.STATUS_REMOVED_MODERATION
        comment.reason_code = reason_code or COMMENT_REASON_REMOVE_BY_MODERATION
        decision_code = "remove"
    else:
        return None, {
            "status": status.HTTP_400_BAD_REQUEST,
            "code": "COMMENT_MODERATION_ACTION_INVALID",
            "detail": "Action de modération invalide.",
        }

    comment.save(update_fields=["status", "reason_code", "updated_at"])
    CommentModerationDecision.objects.create(
        comment=comment,
        acted_by=actor,
        decision_code=decision_code,
        reason_code=comment.reason_code or "",
        internal_note=note,
    )

    return {"item": get_client_moderated_comment(comment.pk)}, None
