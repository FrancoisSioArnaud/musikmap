from django.contrib.humanize.templatetags.humanize import naturaltime
from django.utils.timezone import localtime
from rest_framework import status

from box_management.models import Deposit
from box_management.selectors.boxes import get_box_with_stats
from box_management.services.boxes.incitations import _get_current_incitation_for_box


def get_box_page_data(slug):
    if not slug:
        return None, {
            "status": status.HTTP_400_BAD_REQUEST,
            "code": "BOX_NAME_REQUIRED",
            "detail": "Merci de spécifier le nom d'une boîte (paramètre ?name=)",
        }

    box = get_box_with_stats(slug)
    if not box:
        return None, {
            "status": status.HTTP_404_NOT_FOUND,
            "code": "BOX_NOT_FOUND",
            "detail": "Désolé. Cette boîte n'existe pas.",
        }

    last_deposit = (
        box.deposits.filter(deposit_type=Deposit.DEPOSIT_TYPE_BOX)
        .select_related("song")
        .order_by("-deposited_at")
        .first()
    )

    current_incitation = _get_current_incitation_for_box(box)
    return {
        "slug": box.slug,
        "name": box.name,
        "client_slug": box.client.slug if box.client else None,
        "deposit_count": box.deposit_count,
        "last_deposit_date": naturaltime(localtime(box.last_deposit_at)) if box.last_deposit_at else None,
        "last_deposit_song_image_url": last_deposit.song.image_url if last_deposit and last_deposit.song else None,
        "search_incitation_text": current_incitation.text if current_incitation else None,
    }, None
