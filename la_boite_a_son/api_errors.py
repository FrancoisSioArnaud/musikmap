from collections.abc import Mapping

from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

HTTP_STATUS_TITLES = {
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    409: "Conflict",
    410: "Gone",
    422: "Unprocessable Content",
    429: "Too Many Requests",
    500: "Internal Server Error",
    502: "Bad Gateway",
    503: "Service Unavailable",
    504: "Gateway Timeout",
}

DEFAULT_ERROR_CODES = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    410: "GONE",
    422: "UNPROCESSABLE_CONTENT",
    429: "TOO_MANY_REQUESTS",
    500: "INTERNAL_SERVER_ERROR",
    502: "BAD_GATEWAY",
    503: "SERVICE_UNAVAILABLE",
    504: "GATEWAY_TIMEOUT",
}

DEFAULT_ERROR_DETAILS = {
    400: "La requête est invalide.",
    401: "Authentification requise.",
    403: "Accès interdit.",
    404: "Ressource introuvable.",
    405: "Méthode HTTP non autorisée.",
    409: "Conflit avec l’état actuel de la ressource.",
    410: "Cette ressource n’est plus disponible.",
    422: "Le contenu de la requête ne peut pas être traité.",
    429: "Trop de requêtes. Réessaie plus tard.",
    500: "Une erreur interne s’est produite.",
    502: "Service amont indisponible.",
    503: "Service temporairement indisponible.",
    504: "Le service amont a mis trop de temps à répondre.",
}


def http_title_for_status(status_code: int) -> str:
    try:
        status_code = int(status_code)
    except (TypeError, ValueError):
        return "Error"
    return HTTP_STATUS_TITLES.get(status_code, "Error")


def default_error_code_for_status(status_code: int) -> str:
    try:
        status_code = int(status_code)
    except (TypeError, ValueError):
        return "UNKNOWN_ERROR"
    return DEFAULT_ERROR_CODES.get(status_code, "UNKNOWN_ERROR")


def default_error_detail_for_status(status_code: int) -> str:
    try:
        status_code = int(status_code)
    except (TypeError, ValueError):
        return "Une erreur inattendue s’est produite."
    return DEFAULT_ERROR_DETAILS.get(status_code, "Une erreur inattendue s’est produite.")


def api_error_payload(status_code: int, code: str, detail: str, **extra):
    payload = {
        "status": int(status_code),
        "code": str(code or "UNKNOWN_ERROR"),
        "title": http_title_for_status(status_code),
        "detail": str(detail or "An unexpected error occurred."),
    }
    payload.update(extra)
    return payload


def api_error(status_code: int, code: str, detail: str, **extra):
    return Response(api_error_payload(status_code, code, detail, **extra), status=int(status_code))


def _first_field_error(field_errors) -> str | None:
    if not isinstance(field_errors, Mapping):
        return None

    for value in field_errors.values():
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, (list, tuple)):
            for item in value:
                if isinstance(item, str) and item.strip():
                    return item.strip()
                if isinstance(item, Mapping):
                    nested = _first_field_error(item)
                    if nested:
                        return nested
        if isinstance(value, Mapping):
            nested = _first_field_error(value)
            if nested:
                return nested
    return None


def api_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None:
        return Response(
            api_error_payload(500, "INTERNAL_SERVER_ERROR", default_error_detail_for_status(500)),
            status=500,
        )

    status_code = int(getattr(response, "status_code", 500) or 500)
    data = response.data

    if isinstance(data, Mapping) and all(key in data for key in ("code", "detail")):
        payload = dict(data)
        payload["status"] = status_code
        payload["title"] = http_title_for_status(status_code)
        return Response(payload, status=status_code)

    if isinstance(data, Mapping):
        if "field_errors" in data and isinstance(data.get("field_errors"), Mapping):
            detail = _first_field_error(data.get("field_errors")) or default_error_detail_for_status(status_code)
            payload = api_error_payload(
                status_code,
                data.get("code")
                or ("VALIDATION_ERROR" if status_code < 500 else default_error_code_for_status(status_code)),
                data.get("detail") or detail,
                field_errors=data.get("field_errors"),
            )
            extras = {k: v for k, v in data.items() if k not in {"status", "code", "title", "detail", "field_errors"}}
            payload.update(extras)
            return Response(payload, status=status_code)

        known_keys = {"status", "code", "title", "detail", "field_errors"}
        has_only_known_keys = set(data.keys()).issubset(known_keys)
        if not has_only_known_keys and "detail" not in data:
            field_errors = dict(data)
            detail = _first_field_error(field_errors) or default_error_detail_for_status(status_code)
            return Response(
                api_error_payload(status_code, "VALIDATION_ERROR", detail, field_errors=field_errors),
                status=status_code,
            )

        detail = (
            data.get("detail")
            or data.get("message")
            or data.get("error")
            or default_error_detail_for_status(status_code)
        )
        payload = api_error_payload(
            status_code,
            data.get("code") or default_error_code_for_status(status_code),
            detail,
        )
        extras = {k: v for k, v in data.items() if k not in {"status", "code", "title", "detail", "message", "error"}}
        payload.update(extras)
        return Response(payload, status=status_code)

    if isinstance(data, list):
        detail = default_error_detail_for_status(status_code)
        for item in data:
            if isinstance(item, str) and item.strip():
                detail = item.strip()
                break
        return Response(
            api_error_payload(status_code, "VALIDATION_ERROR", detail, field_errors={"non_field_errors": data}),
            status=status_code,
        )

    return Response(
        api_error_payload(
            status_code,
            default_error_code_for_status(status_code),
            str(data or default_error_detail_for_status(status_code)),
        ),
        status=status_code,
    )
