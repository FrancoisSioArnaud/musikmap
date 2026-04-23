from django.db.models import Count, Max, Q
from django.utils import timezone

from box_management.models import Box, BoxSession, Deposit, LocationPoint


def get_box_by_slug(box_slug):
    box_slug = (box_slug or "").strip()
    if not box_slug:
        return None
    return Box.objects.select_related("client").filter(url=box_slug).first()


def get_active_box_session(user, box):
    if not user or not box:
        return None
    return (
        BoxSession.objects.filter(user=user, box=box, expires_at__gt=timezone.now())
        .order_by("-expires_at", "-id")
        .first()
    )


def get_box_with_stats(slug):
    return (
        Box.objects.select_related("client")
        .filter(url=slug)
        .annotate(
            deposit_count=Count("deposits", filter=Q(deposits__deposit_type=Deposit.DEPOSIT_TYPE_BOX)),
            last_deposit_at=Max("deposits__deposited_at", filter=Q(deposits__deposit_type=Deposit.DEPOSIT_TYPE_BOX)),
        )
        .only("name", "url", "client__slug")
        .first()
    )


def get_location_points(box):
    return LocationPoint.objects.filter(box=box)
