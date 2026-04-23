from django.utils.timezone import localdate

from box_management.models import IncitationPhrase


def _get_current_incitation_for_box(box, at_date=None):
    client_id = getattr(box, "client_id", None)
    if not client_id:
        return None

    current_date = at_date or localdate()
    return (
        IncitationPhrase.objects.for_client(client_id)
        .active_on_date(current_date)
        .order_by("-created_at", "-id")
        .first()
    )


__all__ = ["_get_current_incitation_for_box"]
