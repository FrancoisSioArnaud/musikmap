from box_management.models import Article


def get_visible_articles_for_client(*, client_id, limit):
    return (
        Article.objects.with_related()
        .for_client(client_id)
        .currently_visible()
        .order_by("-published_at", "-created_at")[:limit]
    )


def get_visible_article_by_id(*, client_id, article_id):
    return Article.objects.with_related().for_client(client_id).currently_visible().filter(id=article_id).first()
