from box_management.models import Sticker


def get_client_sticker_by_slug(*, client_id, slug):
    return Sticker.objects.select_related("client", "box").filter(client_id=client_id, slug=slug).first()


def get_client_sticker_by_id(*, client_id, sticker_id):
    return Sticker.objects.select_related("client", "box").filter(client_id=client_id, id=sticker_id).first()


def get_client_stickers_by_ids(*, client_id, sticker_ids):
    if not sticker_ids:
        return []
    stickers = list(
        Sticker.objects.select_related("client", "box").filter(client_id=client_id, id__in=sticker_ids).order_by("id")
    )
    by_id = {s.id: s for s in stickers}
    return [by_id[sid] for sid in sticker_ids if sid in by_id]
