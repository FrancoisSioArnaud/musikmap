from __future__ import annotations

import os
import re

import requests
from django.core.files.base import ContentFile
from django.utils import timezone
from requests import post

from users.models import CustomUser
from users.provider_connections import (
    disconnect_provider_connection,
    get_provider_connection,
    is_provider_authenticated,
    upsert_provider_connection,
)
from users.utils import merge_guest_into_user, merge_user_into_user

from .credentials import CLIENT_ID, CLIENT_SECRET

BASE_URL = "https://api.spotify.com/v1/me/"
PENDING_SPOTIFY_AUTH_SESSION_KEY = "pending_spotify_auth"
DEFAULT_SPOTIFY_SCOPES = ["user-read-email", "user-read-recently-played"]


def get_user_tokens(user):
    return get_provider_connection(user, "spotify")


def update_or_create_user_tokens(
    user, access_token, token_type, expires_in, refresh_token, provider_user_id="", scopes=None
):
    if not getattr(user, "is_authenticated", False):
        return None
    return upsert_provider_connection(
        user=user,
        provider_code="spotify",
        access_token=access_token,
        refresh_token=refresh_token or "",
        expires_in=expires_in,
        provider_user_id=provider_user_id or "",
        scopes=list(scopes or DEFAULT_SPOTIFY_SCOPES),
        is_active=True,
    )


def is_spotify_authenticated(user):
    if not getattr(user, "is_authenticated", False):
        return False

    if is_provider_authenticated(user, "spotify"):
        connection = get_user_tokens(user)
        if not connection:
            return False
        if connection.expires_at and connection.expires_at <= timezone.now():
            return refresh_spotify_token(user)
        return True
    return False


def disconnect_user(user):
    try:
        disconnect_provider_connection(user, "spotify")
    except Exception:
        pass


def refresh_spotify_token(user):
    connection = get_user_tokens(user)
    if not connection or not connection.refresh_token:
        return False

    response = post(
        "https://accounts.spotify.com/api/token",
        data={
            "grant_type": "refresh_token",
            "refresh_token": connection.refresh_token,
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
        },
        timeout=20,
    )

    if not response.ok:
        return False

    payload = response.json()
    update_or_create_user_tokens(
        user,
        payload.get("access_token"),
        payload.get("token_type", "Bearer"),
        payload.get("expires_in", 3600),
        payload.get("refresh_token") or connection.refresh_token,
        provider_user_id=connection.provider_user_id,
        scopes=connection.scopes or DEFAULT_SPOTIFY_SCOPES,
    )
    return True


def fetch_spotify_profile(access_token: str) -> dict:
    response = requests.get(
        "https://api.spotify.com/v1/me",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=20,
    )
    if not response.ok:
        return {}
    return response.json() if response.content else {}


def _sanitize_username_base(value: str) -> str:
    base = re.sub(r"[^\w.@+-]+", "_", str(value or "").strip(), flags=re.UNICODE)
    base = re.sub(r"_+", "_", base).strip("_")
    return base[:120] if base else ""


def generate_unique_username(*preferred_values: str) -> str:
    for preferred in preferred_values:
        base = _sanitize_username_base(preferred)
        if not base:
            continue
        candidate = base
        if not CustomUser.objects.filter(username__iexact=candidate).exists():
            return candidate
        for index in range(1, 1000):
            candidate = f"{base}_{index}"
            if not CustomUser.objects.filter(username__iexact=candidate).exists():
                return candidate

    fallback = f"spotify_{timezone.now().strftime('%Y%m%d%H%M%S')}"
    if not CustomUser.objects.filter(username__iexact=fallback).exists():
        return fallback
    suffix = 1
    while CustomUser.objects.filter(username__iexact=f"{fallback}_{suffix}").exists():
        suffix += 1
    return f"{fallback}_{suffix}"


def spotify_profile_image_url(profile: dict) -> str:
    images = profile.get("images") or []
    if not isinstance(images, list):
        return ""
    for image in images:
        url = (image or {}).get("url")
        if url:
            return url
    return ""


def hydrate_user_from_spotify_profile(user: CustomUser, profile: dict) -> CustomUser:
    update_fields = []
    display_name = (profile.get("display_name") or "").strip()
    email = (profile.get("email") or "").strip()

    if not user.username or getattr(user, "is_guest", False) and user.username.startswith("guest_") and display_name:
        user.username = generate_unique_username(display_name, email.split("@")[0] if email else "")
        update_fields.append("username")

    if email and not user.email:
        user.email = email
        update_fields.append("email")

    image_url = spotify_profile_image_url(profile)
    if image_url and not user.profile_picture:
        try:
            image_response = requests.get(image_url, timeout=20)
            if image_response.ok and image_response.content:
                filename = os.path.basename(image_url.split("?")[0]) or "spotify_profile.jpg"
                user.profile_picture.save(filename, ContentFile(image_response.content), save=False)
                update_fields.append("profile_picture")
        except Exception:
            pass

    if update_fields:
        user.save(update_fields=list(dict.fromkeys(update_fields)))
    return user


def store_pending_spotify_auth(request, payload: dict):
    request.session[PENDING_SPOTIFY_AUTH_SESSION_KEY] = payload
    request.session.modified = True


def get_pending_spotify_auth(request) -> dict | None:
    payload = request.session.get(PENDING_SPOTIFY_AUTH_SESSION_KEY)
    return payload if isinstance(payload, dict) else None


def clear_pending_spotify_auth(request):
    if PENDING_SPOTIFY_AUTH_SESSION_KEY in request.session:
        del request.session[PENDING_SPOTIFY_AUTH_SESSION_KEY]
        request.session.modified = True


def link_spotify_to_user(
    user: CustomUser,
    *,
    access_token: str,
    refresh_token: str = "",
    expires_in: int = 3600,
    provider_user_id: str = "",
    profile: dict | None = None,
    scopes=None,
):
    update_or_create_user_tokens(
        user,
        access_token,
        "Bearer",
        expires_in,
        refresh_token,
        provider_user_id=provider_user_id,
        scopes=scopes or DEFAULT_SPOTIFY_SCOPES,
    )
    if profile:
        hydrate_user_from_spotify_profile(user, profile)
    return user


def apply_pending_spotify_auth_to_user(request, user: CustomUser):
    pending = get_pending_spotify_auth(request)
    if not pending:
        return None

    guest_user_id = pending.get("guest_user_id")
    if guest_user_id and getattr(user, "pk", None) and int(guest_user_id) != user.pk:
        try:
            guest = CustomUser.objects.filter(pk=guest_user_id, is_guest=True).first()
            if guest:
                merge_guest_into_user(guest, user)
        except Exception:
            pass

    link_spotify_to_user(
        user,
        access_token=pending.get("access_token") or "",
        refresh_token=pending.get("refresh_token") or "",
        expires_in=pending.get("expires_in") or 3600,
        provider_user_id=pending.get("provider_user_id") or "",
        profile=pending.get("profile") or {},
        scopes=pending.get("scopes") or DEFAULT_SPOTIFY_SCOPES,
    )
    clear_pending_spotify_auth(request)
    return {"type": "provider_linked"}


def resolve_pending_spotify_auth(request, *, action: str):
    pending = get_pending_spotify_auth(request)
    if not pending:
        return {"ok": False, "reason": "missing_pending_auth", "status": 404}

    pending_type = pending.get("type")
    if action == "cancel":
        clear_pending_spotify_auth(request)
        return {"ok": True, "type": "cancelled"}

    if action != "merge" or pending_type != "merge_required":
        return {"ok": False, "reason": "invalid_action", "status": 400}

    source_user_id = pending.get("current_user_id")
    target_user_id = pending.get("target_user_id")
    if not source_user_id or not target_user_id:
        return {"ok": False, "reason": "invalid_pending_payload", "status": 400}

    source_user = CustomUser.objects.filter(pk=source_user_id).first()
    target_user = CustomUser.objects.filter(pk=target_user_id).first()
    if not source_user or not target_user:
        clear_pending_spotify_auth(request)
        return {"ok": False, "reason": "missing_users", "status": 404}

    merge_result = merge_user_into_user(source_user, target_user)
    if not merge_result.get("merged"):
        return {"ok": False, "reason": merge_result.get("reason") or "merge_failed", "status": 400}

    link_spotify_to_user(
        target_user,
        access_token=pending.get("access_token") or "",
        refresh_token=pending.get("refresh_token") or "",
        expires_in=pending.get("expires_in") or 3600,
        provider_user_id=pending.get("provider_user_id") or "",
        profile=pending.get("profile") or {},
        scopes=pending.get("scopes") or DEFAULT_SPOTIFY_SCOPES,
    )
    clear_pending_spotify_auth(request)
    return {"ok": True, "type": "merge_success", "user": target_user}
