from rest_framework import status

from box_management.builders.deposit_payloads import _build_comments_context_for_deposits
from box_management.domain.constants import COMMENT_REASON_DELETE_BY_AUTHOR
from box_management.models import Comment, CommentModerationDecision
from box_management.selectors.comments import get_comment_for_author_delete


def delete_comment_by_author(*, current_user, comment_id):
    comment = get_comment_for_author_delete(comment_id)
    if not comment:
        return None, {
            "status": status.HTTP_404_NOT_FOUND,
            "code": "COMMENT_NOT_FOUND",
            "detail": "Commentaire introuvable.",
        }
    if comment.user_id != current_user.id:
        return None, {
            "status": status.HTTP_403_FORBIDDEN,
            "code": "COMMENT_DELETE_FORBIDDEN",
            "detail": "Action non autorisée.",
        }

    if comment.status != Comment.STATUS_DELETED_BY_AUTHOR or comment.reason_code != COMMENT_REASON_DELETE_BY_AUTHOR:
        comment.status = Comment.STATUS_DELETED_BY_AUTHOR
        comment.reason_code = COMMENT_REASON_DELETE_BY_AUTHOR
        comment.save(update_fields=["status", "reason_code", "updated_at"])

    already_logged = CommentModerationDecision.objects.filter(
        comment=comment,
        acted_by=current_user,
        decision_code="delete_by_author",
        reason_code=COMMENT_REASON_DELETE_BY_AUTHOR,
    ).exists()
    if not already_logged:
        CommentModerationDecision.objects.create(
            comment=comment,
            acted_by=current_user,
            decision_code="delete_by_author",
            reason_code=COMMENT_REASON_DELETE_BY_AUTHOR,
        )

    comments_context = {"items": [], "count": 0, "viewer_state": {}}
    if comment.deposit_id:
        comments_context = _build_comments_context_for_deposits(
            [comment.deposit], viewer=current_user, include_items=True
        ).get(
            comment.deposit_id,
            comments_context,
        )
    return {"ok": True, "comments": comments_context}, None
