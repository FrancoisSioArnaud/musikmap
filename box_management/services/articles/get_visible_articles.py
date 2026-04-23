from rest_framework import status

from box_management.selectors.articles import get_visible_article_by_id, get_visible_articles_for_client
from box_management.selectors.boxes import get_box_by_slug


def resolve_box_for_articles(box_slug):
    if not box_slug:
        return None, {
            "status": status.HTTP_400_BAD_REQUEST,
            "code": "BOX_SLUG_REQUIRED",
            "detail": "boxSlug manquant.",
        }
    box = get_box_by_slug(box_slug)
    if not box or not box.client_id:
        return None, None
    return box, None


def get_visible_articles(*, box_slug, limit):
    box, error = resolve_box_for_articles(box_slug)
    if error:
        return None, error
    if not box:
        return {"box": None, "items": []}, None

    limit = max(1, min(limit, 20))
    return {"box": box, "items": list(get_visible_articles_for_client(client_id=box.client_id, limit=limit))}, None


def get_visible_article_detail(*, box_slug, article_id):
    box, error = resolve_box_for_articles(box_slug)
    if error:
        return None, error
    if not box:
        return None, {
            "status": status.HTTP_404_NOT_FOUND,
            "code": "ARTICLE_NOT_FOUND",
            "detail": "Article introuvable.",
        }

    article = get_visible_article_by_id(client_id=box.client_id, article_id=article_id)
    if not article:
        return None, {
            "status": status.HTTP_404_NOT_FOUND,
            "code": "ARTICLE_NOT_FOUND",
            "detail": "Article introuvable.",
        }
    return {"box": box, "article": article}, None
