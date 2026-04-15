from __future__ import annotations

import os
import re
from datetime import timedelta
from typing import Optional

import requests
from django.core.files.base import ContentFile
from django.utils import timezone
from requests import get, post, put

from users.models import CustomUser
from users.provider_connections import (
    disconnect_provider_connection,
    get_provider_connection,
    is_provider_authenticated,
    upsert_provider_connection,
)
from users.utils import merge_guest_into_user

from .credentials import CLIENT_ID, CLIENT_SECRET

BASE_URL = "https://api.spotify.com/v1/me/"
PENDING_SPOTIFY_AUTH_SESSION_KEY = "pending_spotify_auth"
DEFAULT_SPOTIFY_SCOPES = ["user-read-email", "user-read-recently-played"]


def get_user_tokens(user):
    return get_provider_connection(user, "spotify")


def update_or_create_user_tokens(user, access_token, token_type, expires_in, refresh_token, provider_user_id="", scopes=None):
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


def execute_spotify_api_request(user, endpoint, post_=False, put_=False):
    if not is_spotify_authenticated(user):
        return {"error": "User not authenticated with Spotify"}

    connection = get_user_tokens(user)
    if not connection:
        return {"error": "Missing Spotify token"}

    headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + connection.access_token,
    }

    try:
        if post_:
            response = post(BASE_URL + endpoint, headers=headers, timeout=20)
        elif put_:
            response = put(BASE_URL + endpoint, headers=headers, timeout=20)
        else:
            response = get(BASE_URL + endpoint, headers=headers, timeout=20)

        if response.status_code == 204:
            return {}
        return response.json()
    except requests.RequestException:
        return {"error": "Spotify request failed"}


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

    if not user.username:
        user.username = generate_unique_username(display_name, email.split("@")[0] if email else "")
        update_fields.append("username")
    elif getattr(user, "is_guest", False) and user.username.startswith("guest_") and display_name:
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


def get_pending_spotify_auth(request) -> Optional[dict]:
    payload = request.session.get(PENDING_SPOTIFY_AUTH_SESSION_KEY)
    return payload if isinstance(payload, dict) else None


def clear_pending_spotify_auth(request):
    if PENDING_SPOTIFY_AUTH_SESSION_KEY in request.session:
        del request.session[PENDING_SPOTIFY_AUTH_SESSION_KEY]
        request.session.modified = True


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

    scopes = pending.get("scopes") or DEFAULT_SPOTIFY_SCOPES
    upsert_provider_connection(
        user=user,
        provider_code="spotify",
        access_token=pending.get("access_token") or "",
        refresh_token=pending.get("refresh_token") or "",
        expires_in=pending.get("expires_in") or 3600,
        provider_user_id=pending.get("provider_user_id") or "",
        scopes=scopes,
        is_active=True,
    )
    hydrate_user_from_spotify_profile(user, pending.get("profile") or {})
    clear_pending_spotify_auth(request)
    return {"type": "provider_linked"}
