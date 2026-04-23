from rest_framework import status

from la_boite_a_son.api_errors import api_error


def _coerce_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    value = str(value or "").strip().lower()
    return value in {"1", "true", "yes", "y", "on", "oui"}


def _get_active_client_user_or_response(request):
    user = request.user

    if not user or not user.is_authenticated:
        return None, api_error(
            status.HTTP_401_UNAUTHORIZED,
            "AUTH_REQUIRED",
            "Authentification requise.",
        )

    if not getattr(user, "client_id", None):
        return None, api_error(
            status.HTTP_403_FORBIDDEN,
            "CLIENT_NOT_ATTACHED",
            "Ce compte n'est rattaché à aucun client.",
        )

    if getattr(user, "portal_status", None) != "active":
        return None, api_error(
            status.HTTP_403_FORBIDDEN,
            "CLIENT_PORTAL_INACTIVE",
            "Ce compte n'a pas accès au portail client.",
        )

    if getattr(user, "client_role", "") not in {"client_owner", "client_editor"}:
        return None, api_error(
            status.HTTP_403_FORBIDDEN,
            "CLIENT_ROLE_FORBIDDEN",
            "Ce compte n'a pas les droits nécessaires.",
        )

    return user, None


__all__ = ["_coerce_bool", "_get_active_client_user_or_response"]
