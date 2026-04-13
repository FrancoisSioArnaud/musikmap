from __future__ import annotations

import base64
import requests
from datetime import timedelta
from django.utils import timezone

from spotify.credentials import CLIENT_ID, CLIENT_SECRET
from users.provider_connections import (
    disconnect_provider_connection,
    get_provider_connection,
    is_provider_authenticated,
    upsert_provider_connection,
)


TOKEN_URL = "https://accounts.spotify.com/api/token"
BASE_API_URL = "https://api.spotify.com/v1/"


def get_user_tokens(user):
    return get_provider_connection(user, "spotify")


def update_or_create_user_tokens(user, access_token, token_type=None, expires_in=None, refresh_token=None):
    return upsert_provider_connection(
        user=user,
        provider_code="spotify",
        access_token=access_token,
        refresh_token=refresh_token or "",
        expires_in=expires_in,
        scopes=["user-read-recently-played"],
    )


def is_spotify_authenticated(user):
    return is_provider_authenticated(user, "spotify")


def disconnect_user(user):
    return disconnect_provider_connection(user, "spotify")


def refresh_spotify_token(connection):
    if not connection or not connection.refresh_token:
        return connection
    credentials = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode("utf-8")
    headers = {
        "Authorization": f"Basic {credentials}",
        "Content-Type": "application/x-www-form-urlencoded",
    }
    response = requests.post(
        TOKEN_URL,
        headers=headers,
        data={
            "grant_type": "refresh_token",
            "refresh_token": connection.refresh_token,
        },
        timeout=10,
    )
    payload = response.json() if response.ok else {}
    access_token = payload.get("access_token")
    if not access_token:
        return connection
    connection.access_token = access_token
    expires_in = payload.get("expires_in")
    if expires_in:
        connection.expires_at = timezone.now() + timedelta(seconds=int(expires_in))
    if payload.get("refresh_token"):
        connection.refresh_token = payload["refresh_token"]
    connection.is_active = True
    connection.save(update_fields=["access_token", "expires_at", "refresh_token", "is_active", "updated_at"])
    return connection


def ensure_valid_spotify_connection(user):
    connection = get_provider_connection(user, "spotify")
    if not connection:
        return None
    if connection.expires_at and connection.expires_at <= timezone.now() and connection.refresh_token:
        return refresh_spotify_token(connection)
    return connection


def execute_spotify_api_request(user, endpoint):
    connection = ensure_valid_spotify_connection(user)
    if not connection or not connection.access_token:
        return {}
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {connection.access_token}",
    }
    response = requests.get(BASE_API_URL + endpoint.lstrip("/"), headers=headers, timeout=10)
    if response.status_code == 204:
        return {}
    try:
        return response.json()
    except Exception:
        return {}
