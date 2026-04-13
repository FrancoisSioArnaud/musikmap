from datetime import timedelta

import requests
from django.utils import timezone
from requests import get, post, put
from users.provider_connections import disconnect_provider_connection, is_provider_authenticated, upsert_provider_connection

from .credentials import CLIENT_ID, CLIENT_SECRET
from .models import SpotifyToken

BASE_URL = "https://api.spotify.com/v1/me/"


def get_user_tokens(user):
    if not getattr(user, "is_authenticated", False):
        return None
    try:
        return SpotifyToken.objects.filter(user=user).order_by("-created_at", "-id").first()
    except TypeError:
        return None


def update_or_create_user_tokens(user, access_token, token_type, expires_in, refresh_token):
    if not getattr(user, "is_authenticated", False):
        return None

    tokens = get_user_tokens(user)
    expires_at = timezone.now() + timedelta(seconds=int(expires_in or 0))

    if tokens:
        tokens.access_token = access_token
        if refresh_token:
            tokens.refresh_token = refresh_token
        tokens.expires_in = expires_at
        tokens.token_type = token_type or tokens.token_type
        tokens.save(update_fields=["access_token", "refresh_token", "expires_in", "token_type"])
        try:
            upsert_provider_connection(
                user=user,
                provider_code="spotify",
                access_token=access_token,
                refresh_token=tokens.refresh_token,
                expires_in=max(0, int((expires_at - timezone.now()).total_seconds())),
                is_active=True,
            )
        except Exception:
            pass
        return tokens

    created = SpotifyToken.objects.create(
        user=user,
        access_token=access_token,
        refresh_token=refresh_token or "",
        expires_in=expires_at,
        token_type=token_type or "Bearer",
    )
    try:
        upsert_provider_connection(
            user=user,
            provider_code="spotify",
            access_token=access_token,
            refresh_token=refresh_token or "",
            expires_in=max(0, int((expires_at - timezone.now()).total_seconds())) if expires_at else None,
            is_active=True,
        )
    except Exception:
        pass
    return created


def is_spotify_authenticated(user):
    if not getattr(user, "is_authenticated", False):
        return False

    if is_provider_authenticated(user, "spotify"):
        return True

    tokens = get_user_tokens(user)
    if not tokens:
        return False

    if tokens.expires_in <= timezone.now():
        return refresh_spotify_token(user)
    return True


def disconnect_user(user):
    tokens = get_user_tokens(user)
    if tokens:
        tokens.delete()
    try:
        disconnect_provider_connection(user, "spotify")
    except Exception:
        pass


def refresh_spotify_token(user):
    tokens = get_user_tokens(user)
    if not tokens or not tokens.refresh_token:
        return False

    response = post(
        "https://accounts.spotify.com/api/token",
        data={
            "grant_type": "refresh_token",
            "refresh_token": tokens.refresh_token,
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
        payload.get("token_type", tokens.token_type),
        payload.get("expires_in", 3600),
        payload.get("refresh_token") or tokens.refresh_token,
    )
    return True


def execute_spotify_api_request(user, endpoint, post_=False, put_=False):
    if not is_spotify_authenticated(user):
        return {"error": "User not authenticated with Spotify"}

    tokens = get_user_tokens(user)
    if not tokens:
        return {"error": "Missing Spotify token"}

    headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + tokens.access_token,
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
