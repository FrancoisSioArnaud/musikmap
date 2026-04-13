import requests
from requests import get, post, put

from .models import DeezerToken

BASE_URL = "https://api.deezer.com/"


def get_user_tokens(user):
    if not getattr(user, "is_authenticated", False):
        return None
    try:
        return DeezerToken.objects.filter(user=user).order_by("-created_at", "-id").first()
    except TypeError:
        return None


def update_or_create_user_tokens(user, access_token):
    if not getattr(user, "is_authenticated", False):
        return None

    tokens = get_user_tokens(user)
    if tokens:
        tokens.access_token = access_token
        tokens.save(update_fields=["access_token"])
        return tokens
    return DeezerToken.objects.create(user=user, access_token=access_token)


def is_deezer_authenticated(user):
    return bool(getattr(user, "is_authenticated", False) and get_user_tokens(user))


def disconnect_user(user):
    tokens = get_user_tokens(user)
    if tokens:
        tokens.delete()


def execute_deezer_api_request(user, endpoint, post_=False, put_=False, recent=False):
    headers = {"Content-Type": "application/json"}
    params = {"limit": 50}

    if recent:
        tokens = get_user_tokens(user)
        if not tokens:
            return None
        params["access_token"] = tokens.access_token

    url = BASE_URL + endpoint.lstrip("/")

    try:
        if post_:
            return post(url, headers=headers, params=params, timeout=20)
        if put_:
            return put(url, headers=headers, params=params, timeout=20)
        return get(url, headers=headers, params=params, timeout=20)
    except requests.RequestException:
        return None
