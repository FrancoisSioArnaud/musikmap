def extract_article_preview(url: str):
    # Keep compatibility with existing test patch target:
    # box_management.views._extract_import_preview_from_url
    from box_management import views as box_views

    return box_views._extract_import_preview_from_url(url)
