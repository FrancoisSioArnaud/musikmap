import re

from django.db.models import Count, Q
from rest_framework import status

from box_management.builders.sticker_payloads import serialize_client_admin_sticker, serialize_client_box_assignment
from box_management.models import Box, Sticker
from box_management.selectors.stickers import get_client_sticker_by_id, get_client_sticker_by_slug


def get_sticker_install_payload(*, client_id, sticker_slug, search):
    sticker = None
    if sticker_slug:
        if not re.fullmatch(r"\d{11}", sticker_slug):
            return None, {
                "status": status.HTTP_400_BAD_REQUEST,
                "code": "INVALID_STICKER_SLUG",
                "detail": "Slug sticker invalide.",
            }

        sticker = get_client_sticker_by_slug(client_id=client_id, slug=sticker_slug)
        if not sticker:
            return None, {
                "status": status.HTTP_404_NOT_FOUND,
                "code": "STICKER_NOT_FOUND",
                "detail": "Sticker introuvable pour ce client.",
            }
        if not sticker.is_active:
            return None, {
                "status": status.HTTP_410_GONE,
                "code": "STICKER_DISABLED",
                "detail": "Sticker désactivé.",
            }

    boxes_qs = Box.objects.filter(client_id=client_id)
    if search:
        boxes_qs = boxes_qs.filter(Q(name__icontains=search) | Q(url__icontains=search))

    boxes = list(boxes_qs.order_by("name"))
    if boxes:
        counts_by_box_id = dict(
            Sticker.objects.filter(client_id=client_id, box_id__in=[box.id for box in boxes])
            .values_list("box_id")
            .annotate(count=Count("id"))
        )
    else:
        counts_by_box_id = {}

    serialized_boxes = [serialize_client_box_assignment(box, counts_by_box_id.get(box.id, 0)) for box in boxes]
    serialized_boxes.sort(key=lambda item: (0 if not item["has_assigned_sticker"] else 1, (item["name"] or "").lower()))

    message = ""
    if sticker and sticker.box_id:
        message = f"Sticker assigné à {sticker.box.url}"
        serialized_boxes = []

    return {
        "sticker": serialize_client_admin_sticker(sticker) if sticker else None,
        "boxes": serialized_boxes,
        "message": message,
    }, None


def assign_sticker_to_box(*, client_id, sticker_id, box_id):
    sticker = get_client_sticker_by_id(client_id=client_id, sticker_id=sticker_id)
    if not sticker:
        return None, {
            "status": status.HTTP_404_NOT_FOUND,
            "code": "STICKER_NOT_FOUND",
            "detail": "Sticker introuvable.",
        }
    if not sticker.is_active:
        return None, {"status": status.HTTP_410_GONE, "code": "STICKER_DISABLED", "detail": "Sticker désactivé."}
    if sticker.box_id:
        return None, {
            "status": status.HTTP_409_CONFLICT,
            "code": "STICKER_ALREADY_ASSIGNED",
            "detail": f"Sticker assigné à {sticker.box.url}.",
            "sticker": serialize_client_admin_sticker(sticker),
        }

    box = Box.objects.filter(client_id=client_id, id=box_id).first()
    if not box:
        return None, {
            "status": status.HTTP_404_NOT_FOUND,
            "code": "BOX_NOT_FOUND",
            "detail": "Box introuvable pour ce client.",
        }

    sticker.assign_box(box)
    sticker.save(update_fields=["box", "assigned_at", "status", "updated_at", "qr_generated_at", "downloaded_at"])
    return {"sticker": serialize_client_admin_sticker(sticker)}, None


def unassign_sticker_from_box(*, client_id, sticker_id):
    sticker = get_client_sticker_by_id(client_id=client_id, sticker_id=sticker_id)
    if not sticker:
        return None, {
            "status": status.HTTP_404_NOT_FOUND,
            "code": "STICKER_NOT_FOUND",
            "detail": "Sticker introuvable.",
        }

    sticker.unassign_box()
    sticker.save(update_fields=["box", "assigned_at", "status", "updated_at", "qr_generated_at", "downloaded_at"])
    return {"sticker": serialize_client_admin_sticker(sticker)}, None
