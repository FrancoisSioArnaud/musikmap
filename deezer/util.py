from __future__ import annotations

import requests

from users.provider_connections import (
    disconnect_provider_connection,
    get_provider_connection,
    is_provider_authenticated,
    upsert_provider_connection,
)

BASE_URL = "https://api.deezer.com/"


def get_user_tokens(user):
    return get_provider_connection(user, "deezer")


def update_or_create_user_tokens(user, access_token):
    return upsert_provider_connection(
        user=user,
        provider_code="deezer",
        access_token=access_token,
        scopes=["listening_history"],
    )


def is_deezer_authenticated(user):
    return is_provider_authenticated(user, "deezer")


def disconnect_user(user):
    return disconnect_provider_connection(user, "deezer")


def execute_deezer_api_request(user, endpoint, *, recent=False):
    connection = get_provider_connection(user, "deezer")
    params = {"limit": 50}
    if recent and connection and connection.access_token:
        params["access_token"] = connection.access_token
    response = requests.get(BASE_URL + endpoint.lstrip("/"), params=params, timeout=10)
    return response
