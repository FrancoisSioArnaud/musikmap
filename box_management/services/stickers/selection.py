from rest_framework import status

from box_management.selectors.stickers import get_client_stickers_by_ids


def parse_sticker_ids(payload):
    raw_ids = payload.get("sticker_ids")
    if raw_ids is None:
        raw_ids = payload.get("ids")
    if not isinstance(raw_ids, list):
        return []
    ids = []
    for item in raw_ids:
        try:
            ids.append(int(item))
        except (TypeError, ValueError):
            continue
    return ids


def resolve_client_sticker_selection(*, client_id, payload):
    sticker_ids = parse_sticker_ids(payload)
    stickers = get_client_stickers_by_ids(client_id=client_id, sticker_ids=sticker_ids)
    if not stickers:
        return None, {
            "status": status.HTTP_400_BAD_REQUEST,
            "code": "STICKER_SELECTION_REQUIRED",
            "detail": "Aucun sticker sélectionné.",
        }
    return stickers, None
