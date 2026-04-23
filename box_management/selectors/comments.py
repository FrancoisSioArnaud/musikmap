from django.db.models import Prefetch

from box_management.models import Comment, CommentModerationDecision, CommentReport


def get_comment_for_author_delete(comment_id):
    return Comment.objects.select_related("deposit", "deposit__box", "client").filter(pk=comment_id).first()


def get_comment_for_report(comment_id):
    return Comment.objects.select_related("user", "deposit", "client").filter(pk=comment_id).first()


def get_client_admin_comments(*, client_id, tab):
    qs = Comment.objects.filter(client_id=client_id)
    if tab == "signaled":
        qs = qs.filter(reports_count__gt=0)
    elif tab == "recent":
        pass
    else:
        qs = qs.filter(status=Comment.STATUS_QUARANTINED)
    return list(
        qs.select_related("user", "deposit", "deposit__box")
        .prefetch_related(
            Prefetch(
                "reports", queryset=CommentReport.objects.order_by("-created_at", "-id"), to_attr="prefetched_reports"
            ),
            Prefetch(
                "moderation_decisions",
                queryset=CommentModerationDecision.objects.select_related("acted_by").order_by("-created_at", "-id"),
                to_attr="prefetched_decisions",
            ),
        )
        .order_by("-created_at", "-id")[:100]
    )


def get_client_comment_for_moderation(*, client_id, comment_id):
    return (
        Comment.objects.select_related("user", "deposit", "deposit__box")
        .filter(client_id=client_id, pk=comment_id)
        .first()
    )


def get_client_moderated_comment(comment_id):
    return (
        Comment.objects.select_related("user", "deposit", "deposit__box")
        .prefetch_related(
            Prefetch(
                "reports", queryset=CommentReport.objects.order_by("-created_at", "-id"), to_attr="prefetched_reports"
            ),
            Prefetch(
                "moderation_decisions",
                queryset=CommentModerationDecision.objects.select_related("acted_by").order_by("-created_at", "-id"),
                to_attr="prefetched_decisions",
            ),
        )
        .get(pk=comment_id)
    )
