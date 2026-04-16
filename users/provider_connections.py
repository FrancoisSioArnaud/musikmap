from __future__ import annotations

from datetime import timedelta
from typing import Iterable, Optional

from django.utils import timezone

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
    return bool(connection and connection.is_active and connection.access_token)


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
