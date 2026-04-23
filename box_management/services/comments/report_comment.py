from rest_framework import status

from box_management.domain.constants import COMMENT_REASON_REPORT_THRESHOLD, COMMENT_REPORT_REASON_CHOICES
from box_management.models import Comment, CommentModerationDecision, CommentReport
from box_management.selectors.comments import get_comment_for_report


def report_comment(*, current_user, comment_id, reason, details):
    comment = get_comment_for_report(comment_id)
    if not comment:
        return None, {
            "status": status.HTTP_404_NOT_FOUND,
            "code": "COMMENT_NOT_FOUND",
            "detail": "Commentaire introuvable.",
        }
    if comment.user_id == current_user.id:
        return None, {
            "status": status.HTTP_400_BAD_REQUEST,
            "code": "COMMENT_SELF_REPORT_FORBIDDEN",
            "detail": "Vous ne pouvez pas signaler votre propre commentaire.",
        }
    if comment.status != Comment.STATUS_PUBLISHED:
        return None, {
            "status": status.HTTP_400_BAD_REQUEST,
            "code": "COMMENT_REPORT_NOT_ALLOWED",
            "detail": "Ce commentaire ne peut plus être signalé.",
        }

    reason_code = (reason or "other").strip()
    if reason_code not in COMMENT_REPORT_REASON_CHOICES:
        reason_code = "other"
    free_text = str(details or "").strip()[:255]

    report, created = CommentReport.objects.get_or_create(
        comment=comment,
        reporter=current_user,
        defaults={
            "reason_code": reason_code,
            "free_text": free_text,
            "reporter_username": current_user.username or "",
            "reporter_email": current_user.email or "",
        },
    )
    if not created:
        return {"ok": True, "already_reported": True}, None

    comment.reports_count = comment.reports.count()
    if comment.reports_count >= 3 and comment.status == Comment.STATUS_PUBLISHED:
        comment.status = Comment.STATUS_QUARANTINED
        comment.reason_code = COMMENT_REASON_REPORT_THRESHOLD
        comment.save(update_fields=["reports_count", "status", "reason_code", "updated_at"])
        CommentModerationDecision.objects.create(
            comment=comment,
            acted_by=None,
            decision_code="auto_quarantine_report_threshold",
            reason_code=COMMENT_REASON_REPORT_THRESHOLD,
            internal_note=f"reports_count={comment.reports_count}",
        )
    else:
        comment.save(update_fields=["reports_count", "updated_at"])

    return {"ok": True, "reports_count": comment.reports_count}, None
