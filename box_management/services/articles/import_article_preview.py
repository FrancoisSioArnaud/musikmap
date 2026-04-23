import requests
from rest_framework import serializers, status

from box_management.integrations.article_scraper import extract_article_preview


def import_article_preview(link_value):
    link = (link_value or "").strip()
    if not link:
        return None, {
            "status": status.HTTP_400_BAD_REQUEST,
            "code": "VALIDATION_ERROR",
            "detail": "Le lien externe est obligatoire pour importer une page.",
            "field_errors": {"link": ["Le lien externe est obligatoire pour importer une page."]},
        }

    url_field = serializers.URLField()
    try:
        link = url_field.run_validation(link)
    except serializers.ValidationError as exc:
        return None, {
            "status": status.HTTP_400_BAD_REQUEST,
            "code": "VALIDATION_ERROR",
            "detail": "Le lien externe est invalide.",
            "field_errors": {"link": list(exc.detail) if isinstance(exc.detail, (list, tuple)) else exc.detail},
        }

    try:
        return extract_article_preview(link), None
    except requests.Timeout:
        return None, {
            "status": status.HTTP_504_GATEWAY_TIMEOUT,
            "code": "ARTICLE_IMPORT_TIMEOUT",
            "detail": "Le site a mis trop de temps à répondre.",
        }
    except requests.HTTPError as exc:
        status_code = exc.response.status_code if exc.response is not None else 502
        detail = f"La page n'est pas accessible (HTTP {status_code})."
        if status_code in {401, 402, 403}:
            detail = f"Le site refuse l'import automatique de cette page (HTTP {status_code})."
        return None, {
            "status": status.HTTP_502_BAD_GATEWAY,
            "code": "ARTICLE_IMPORT_REMOTE_FORBIDDEN"
            if status_code in {401, 402, 403}
            else "ARTICLE_IMPORT_REMOTE_UNAVAILABLE",
            "detail": detail,
            "remote_status": status_code,
        }
    except ValueError:
        return None, {
            "status": status.HTTP_400_BAD_REQUEST,
            "code": "ARTICLE_IMPORT_INVALID_CONTENT",
            "detail": "Le contenu importé est invalide.",
        }
    except requests.RequestException:
        return None, {
            "status": status.HTTP_502_BAD_GATEWAY,
            "code": "ARTICLE_IMPORT_REMOTE_UNAVAILABLE",
            "detail": "Impossible de récupérer cette page pour le moment.",
        }
    except Exception:
        return None, {
            "status": status.HTTP_400_BAD_REQUEST,
            "code": "ARTICLE_IMPORT_PARSE_FAILED",
            "detail": "Impossible d'analyser cette page.",
        }
