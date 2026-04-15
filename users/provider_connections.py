from __future__ import annotations

from datetime import datetime, timedelta
from typing import Iterable, Optional

from django.utils import timezone
from social_django.models import UserSocialAuth

from .models import CustomUser, UserProviderConnection


SUPPORTED_PROVIDER_CODES = {"spotify", "deezer"}
PERSONALIZED_SEARCH_PROVIDER_CODES = ("spotify",)


def normalize_provider_code(value) -> str:
    provider = str(value or "").strip().lower()
    return provider if provider in SUPPORTED_PROVIDER_CODES else ""


def get_provider_connection(
    user: Optional[CustomUser],
    provider_code: str,
) -> Optional[UserProviderConnection]:
    normalized = normalize_provider_code(provider_code)
    if not user or not getattr(user, "pk", None) or not normalized:
        return None
    return UserProviderConnection.objects.filter(
        user=user,
        provider_code=normalized,
    ).first()


def _coerce_expires_at(raw_value):
    if not raw_value:
        return None
    try:
        if isinstance(raw_value, (int, float)):
            return datetime.fromtimestamp(
                raw_value,
                tz=timezone.get_current_timezone(),
            )
        if isinstance(raw_value, str) and raw_value.isdigit():
            return datetime.fromtimestamp(
                int(raw_value),
                tz=timezone.get_current_timezone(),
            )
    except Exception:
        return None
    return None


def get_social_auth_connection_payload(
    user: Optional[CustomUser],
    provider_code: str,
):
    normalized = normalize_provider_code(provider_code)
    if not user or not getattr(user, "pk", None) or not normalized:
        return None

    social_auth = UserSocialAuth.objects.filter(
        user=user,
        provider=normalized,
    ).first()
    if not social_auth:
        return None

    extra_data = social_auth.extra_data or {}
    access_token = (
        extra_data.get("access_token")
        or extra_data.get("accessToken")
        or extra_data.get("token")
        or ""
    )
    if not access_token:
        return None

    refresh_token = (
        extra_data.get("refresh_token")
        or extra_data.get("refreshToken")
        or ""
    )
    scopes_raw = extra_data.get("scope") or extra_data.get("scopes") or []
    if isinstance(scopes_raw, str):
        scopes = [value for value in scopes_raw.replace(",", " ").split() if value]
    elif isinstance(scopes_raw, (list, tuple, set)):
        scopes = [str(value) for value in scopes_raw if str(value)]
    else:
        scopes = []

    return {
        "provider_code": normalized,
        "provider_user_id": str(extra_data.get("id") or social_auth.uid or "") or None,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_at": _coerce_expires_at(
            extra_data.get("expires") or extra_data.get("expires_at")
        ),
        "scopes": scopes,
        "connected": True,
        "can_recent_plays": normalized in set(PERSONALIZED_SEARCH_PROVIDER_CODES),
        "source": "social_auth",
    }


def upsert_provider_connection(
    *,
    user: CustomUser,
    provider_code: str,
    access_token: str,
    refresh_token: str = "",
    expires_in: Optional[int] = None,
    provider_user_id: str = "",
    scopes: Optional[Iterable[str]] = None,
    is_active: bool = True,
):
    normalized = normalize_provider_code(provider_code)
    if not normalized:
        raise ValueError("Unsupported provider")

    expires_at = None
    if expires_in:
        try:
            expires_at = timezone.now() + timedelta(seconds=int(expires_in))
        except Exception:
            expires_at = None

    connection, _created = UserProviderConnection.objects.update_or_create(
        user=user,
        provider_code=normalized,
        defaults={
            "access_token": access_token or "",
            "refresh_token": refresh_token or "",
            "expires_at": expires_at,
            "provider_user_id": provider_user_id or "",
            "scopes": list(scopes or []),
            "is_active": bool(is_active),
        },
    )
    return connection


def has_personalized_provider_connection(
    user: Optional[CustomUser],
    provider_code: str,
) -> bool:
    normalized = normalize_provider_code(provider_code)
    if normalized not in PERSONALIZED_SEARCH_PROVIDER_CODES:
        return False

    connection = get_provider_connection(user, normalized)
    if connection and connection.is_active and connection.access_token:
        return True

    payload = get_social_auth_connection_payload(user, normalized)
    return bool(payload and payload.get("access_token"))


def disconnect_provider_connection(
    user: Optional[CustomUser],
    provider_code: str,
) -> bool:
    normalized = normalize_provider_code(provider_code)
    connection = get_provider_connection(user, normalized)
    removed = False

    if connection:
        connection.delete()
        removed = True

    return removed


def is_provider_authenticated(
    user: Optional[CustomUser],
    provider_code: str,
) -> bool:
    connection = get_provider_connection(user, provider_code)
    if connection and connection.is_active and connection.access_token:
        return True

    payload = get_social_auth_connection_payload(user, provider_code)
    return bool(payload and payload.get("access_token"))


def serialize_provider_connection(
    connection: Optional[UserProviderConnection],
    provider_code: Optional[str] = None,
):
    if not connection:
        return {
            "connected": False,
            "provider_code": provider_code,
            "access_token": None,
            "expires_at": None,
            "scopes": [],
            "can_recent_plays": False,
            "source": None,
        }

    scopes = list(connection.scopes or [])
    return {
        "connected": bool(connection.is_active and connection.access_token),
        "provider_code": connection.provider_code,
        "provider_user_id": connection.provider_user_id or None,
        "access_token": connection.access_token or None,
        "expires_at": connection.expires_at.isoformat() if connection.expires_at else None,
        "scopes": scopes,
        "can_recent_plays": (
            connection.provider_code in set(PERSONALIZED_SEARCH_PROVIDER_CODES)
            and bool(connection.is_active and connection.access_token)
        ),
        "source": "provider_connection",
    }


def serialize_provider_connections_for_user(user: Optional[CustomUser]):
    mapping = {
        provider: serialize_provider_connection(None, provider)
        for provider in SUPPORTED_PROVIDER_CODES
    }
    if not user or not getattr(user, "pk", None):
        return mapping

    for connection in UserProviderConnection.objects.filter(
        user=user,
        provider_code__in=SUPPORTED_PROVIDER_CODES,
    ):
        mapping[connection.provider_code] = serialize_provider_connection(connection)

    for provider in PERSONALIZED_SEARCH_PROVIDER_CODES:
        if mapping[provider].get("connected"):
            continue
        payload = get_social_auth_connection_payload(user, provider)
        if payload:
            mapping[provider] = payload

    return mapping


def merge_provider_connections(guest: CustomUser, target: CustomUser):
    for connection in UserProviderConnection.objects.filter(user=guest).order_by("id"):
        target_connection = UserProviderConnection.objects.filter(
            user=target,
            provider_code=connection.provider_code,
        ).first()

        if target_connection:
            if not target_connection.access_token and connection.access_token:
                target_connection.access_token = connection.access_token
                target_connection.refresh_token = connection.refresh_token
                target_connection.expires_at = connection.expires_at
                target_connection.provider_user_id = connection.provider_user_id
                target_connection.scopes = list(connection.scopes or [])
                target_connection.is_active = connection.is_active
                target_connection.save()
            connection.delete()
            continue

        connection.user = target
        connection.save(update_fields=["user"])
