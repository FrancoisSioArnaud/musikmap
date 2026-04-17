from rest_framework.response import Response

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


def http_title_for_status(status_code: int) -> str:
    try:
        status_code = int(status_code)
    except (TypeError, ValueError):
        return "Error"
    return HTTP_STATUS_TITLES.get(status_code, "Error")


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
