def serialize_client_admin_sticker(sticker):
    box = getattr(sticker, "box", None)
    return {
        "id": sticker.id,
        "slug": sticker.slug,
        "status": sticker.status,
        "status_label": sticker.get_status_display(),
        "is_active": bool(sticker.is_active),
        "client": {
            "id": sticker.client_id,
            "name": getattr(getattr(sticker, "client", None), "name", None),
            "slug": getattr(getattr(sticker, "client", None), "slug", None),
        },
        "box": (
            {
                "id": box.id,
                "name": box.name,
                "slug": box.url,
            }
            if box
            else None
        ),
        "qr_generated_at": sticker.qr_generated_at.isoformat() if sticker.qr_generated_at else None,
        "downloaded_at": sticker.downloaded_at.isoformat() if sticker.downloaded_at else None,
        "assigned_at": sticker.assigned_at.isoformat() if sticker.assigned_at else None,
        "created_at": sticker.created_at.isoformat() if sticker.created_at else None,
        "updated_at": sticker.updated_at.isoformat() if sticker.updated_at else None,
        "sticker_url": f"/s/{sticker.slug}",
        "flowbox_url": f"/flowbox/{box.url}" if box and box.url else None,
        "is_assigned": bool(sticker.box_id),
        "is_generated": bool(sticker.qr_generated_at),
        "is_downloaded": bool(sticker.downloaded_at),
    }


def serialize_client_box_assignment(box, assigned_sticker_count=0):
    return {
        "id": box.id,
        "name": box.name,
        "slug": box.url,
        "assigned_sticker_count": int(assigned_sticker_count or 0),
        "has_assigned_sticker": bool(assigned_sticker_count),
    }
