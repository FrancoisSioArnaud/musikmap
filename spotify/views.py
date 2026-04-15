import base64
from urllib.parse import urlencode

import requests
from django.contrib.auth import login
from django.shortcuts import redirect
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import CustomUser
from users.utils import (
    build_current_user_payload,
    clear_guest_cookie,
    get_current_app_user,
    merge_guest_into_user,
    touch_last_seen,
)

from .credentials import CLIENT_ID, CLIENT_SECRET
from .spotipy_client import sp
from .util import (
    DEFAULT_SPOTIFY_SCOPES,
    clear_pending_spotify_auth,
    disconnect_user,
    fetch_spotify_profile,
    get_user_tokens,
    hydrate_user_from_spotify_profile,
    is_spotify_authenticated,
    refresh_spotify_token,
    store_pending_spotify_auth,
    update_or_create_user_tokens,
)

SPOTIFY_SCOPES = " ".join(DEFAULT_SPOTIFY_SCOPES)


def _frontend_result_redirect(result_type: str, extra_params: dict | None = None):
    params = {"result": result_type}
    if extra_params:
        params.update({key: value for key, value in extra_params.items() if value not in (None, "")})
    return redirect("/auth/return?" + urlencode(params))


def _absolute_callback_uri(request):
    callback_url = request.build_absolute_uri("/spotify/redirect")
    forwarded_proto = request.META.get("HTTP_X_FORWARDED_PROTO")
    if forwarded_proto == "https" and callback_url.startswith("http://"):
        return "https://" + callback_url[len("http://") :]
    if not request.get_host().startswith(("localhost", "127.0.0.1")) and callback_url.startswith("http://"):
        return "https://" + callback_url[len("http://") :]
    return callback_url


def _spotify_auth_url(request):
    auth_headers = {
        "client_id": CLIENT_ID,
        "response_type": "code",
        "redirect_uri": _absolute_callback_uri(request),
        "scope": SPOTIFY_SCOPES,
        "show_dialog": "true",
    }
    return "https://accounts.spotify.com/authorize?" + urlencode(auth_headers)


def _finalize_guest_from_spotify(guest_user, profile, access_token, refresh_token, expires_in):
    guest_user.is_guest = False
    guest_user.guest_device_token = None
    guest_user.converted_at = timezone.now()
    guest_user.last_seen_at = timezone.now()
    if not guest_user.username or guest_user.username.startswith("guest_"):
        guest_user.username = generate_unique_username(
            profile.get("display_name") or "",
            (profile.get("email") or "").split("@")[0] if profile.get("email") else "",
        )
    if profile.get("email") and not guest_user.email:
        guest_user.email = profile.get("email")
    guest_user.save()
    hydrate_user_from_spotify_profile(guest_user, profile)
    upsert_provider_connection(
        user=guest_user,
        provider_code="spotify",
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=expires_in,
        provider_user_id=profile.get("id") or "",
        scopes=DEFAULT_SPOTIFY_SCOPES,
        is_active=True,
    )
    return guest_user


def _create_user_from_spotify(profile, access_token, refresh_token, expires_in):
    username = generate_unique_username(
        profile.get("display_name") or "",
        (profile.get("email") or "").split("@")[0] if profile.get("email") else "",
    )
    user = CustomUser(
        username=username,
        email=(profile.get("email") or "").strip(),
        is_guest=False,
        converted_at=timezone.now(),
        last_seen_at=timezone.now(),
    )
    user.set_unusable_password()
    user.save()
    hydrate_user_from_spotify_profile(user, profile)
    upsert_provider_connection(
        user=user,
        provider_code="spotify",
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=expires_in,
        provider_user_id=profile.get("id") or "",
        scopes=DEFAULT_SPOTIFY_SCOPES,
        is_active=True,
    )
    return user


class AuthURL(APIView):
    def get(self, request, format=None):
        return Response({"url": _spotify_auth_url(request)}, status=status.HTTP_200_OK)


class Disconnect(APIView):
    def get(self, request, format=None):
        if getattr(request.user, "is_authenticated", False):
            disconnect_user(request.user)
        return Response({"status": True}, status=status.HTTP_200_OK)

    def post(self, request, format=None):
        return self.get(request, format=format)


class IsAuthenticated(APIView):
    def get(self, request, format=None):
        return Response({"status": is_spotify_authenticated(self.request.user)}, status=status.HTTP_200_OK)


class RefreshAccessToken(APIView):
    def post(self, request, format=None):
        if not getattr(request.user, "is_authenticated", False):
            return Response({"detail": "Utilisateur non connecté."}, status=status.HTTP_401_UNAUTHORIZED)

        if not refresh_spotify_token(request.user):
            return Response({"detail": "Impossible de rafraîchir le token Spotify."}, status=status.HTTP_400_BAD_REQUEST)

        connection = get_user_tokens(request.user)
        connection_payload = build_current_user_payload(request.user)
        return Response(
            {
                "access_token": connection.access_token if connection else None,
                "expires_at": connection.expires_at.isoformat() if connection and connection.expires_at else None,
                "current_user": connection_payload,
            },
            status=status.HTTP_200_OK,
        )


class ClearPendingAuth(APIView):
    def post(self, request, format=None):
        clear_pending_spotify_auth(request)
        return Response({"status": True}, status=status.HTTP_200_OK)


class Search(APIView):
    def post(self, request, format=None):
        search_query = request.data.get("search_query")
        results = sp.search(q=search_query, type="track", limit=15)

        tracks = []
        for item in results.get("tracks", {}).get("items", []):
            images = item.get("album", {}).get("images", [])
            image_url = images[0]["url"] if images else None
            image_64 = next((img for img in images if img.get("height") == 64), None)
            image_url_small = image_64["url"] if image_64 else (images[-1]["url"] if images else None)
            artists = item.get("artists") or []

            tracks.append(
                {
                    "id": item.get("id"),
                    "name": item.get("name"),
                    "artist": artists[0]["name"] if artists else "",
                    "artists": [artist.get("name") for artist in artists if artist.get("name")],
                    "album": item.get("album", {}).get("name"),
                    "image_url": image_url,
                    "image_url_small": image_url_small,
                    "duration": (item.get("duration_ms") or 0) // 1000,
                    "platform_id": 1,
                    "url": (item.get("external_urls") or {}).get("spotify"),
                }
            )

        return Response(tracks, status=status.HTTP_200_OK)


def spotify_callback(request, format=None):
    clear_pending_spotify_auth(request)

    error = request.GET.get("error")
    code = request.GET.get("code")
    if error or not code:
        return _frontend_result_redirect("error", {"reason": "spotify_oauth_error"})

    encoded_credentials = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode("utf-8")).decode("utf-8")
    headers = {
        "Authorization": "Basic " + encoded_credentials,
        "Content-Type": "application/x-www-form-urlencoded",
    }

    response = requests.post(
        "https://accounts.spotify.com/api/token",
        headers=headers,
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": _absolute_callback_uri(request),
        },
        timeout=20,
    )
    payload = response.json() if response.content else {}

    access_token = payload.get("access_token")
    if not response.ok or not access_token:
        return _frontend_result_redirect("error", {"reason": "spotify_token_error"})

    refresh_token = payload.get("refresh_token") or ""
    expires_in = payload.get("expires_in") or 3600
    profile = fetch_spotify_profile(access_token)
    provider_user_id = str(profile.get("id") or "").strip()
    spotify_email = str(profile.get("email") or "").strip().lower()

    if not provider_user_id:
        return _frontend_result_redirect("error", {"reason": "spotify_profile_error"})

    current_user = get_current_app_user(request)

    from users.models import UserProviderConnection

    provider_owner_connection = (
        UserProviderConnection.objects.select_related("user")
        .filter(provider_code="spotify", provider_user_id=provider_user_id, is_active=True)
        .first()
    )
    provider_owner = provider_owner_connection.user if provider_owner_connection else None

    if current_user and getattr(current_user, "is_authenticated", False) and not getattr(current_user, "is_guest", False):
        if provider_owner and provider_owner.pk != current_user.pk:
            store_pending_spotify_auth(
                request,
                {
                    "type": "merge_required",
                    "reason": "spotify_already_linked",
                    "provider_user_id": provider_user_id,
                    "target_user_id": provider_owner.pk,
                    "current_user_id": current_user.pk,
                },
            )
            return _frontend_result_redirect("merge_required", {"reason": "spotify_already_linked"})

        update_or_create_user_tokens(
            current_user,
            access_token,
            payload.get("token_type", "Bearer"),
            expires_in,
            refresh_token,
            provider_user_id=provider_user_id,
            scopes=DEFAULT_SPOTIFY_SCOPES,
        )
        hydrate_user_from_spotify_profile(current_user, profile)
        touch_last_seen(current_user)
        return _frontend_result_redirect("provider_linked")

    if getattr(current_user, "is_guest", False):
        if provider_owner and provider_owner.pk != current_user.pk:
            try:
                merge_guest_into_user(current_user, provider_owner)
            except Exception:
                return _frontend_result_redirect("merge_required", {"reason": "spotify_already_linked"})
            login(request, provider_owner)
            update_or_create_user_tokens(
                provider_owner,
                access_token,
                payload.get("token_type", "Bearer"),
                expires_in,
                refresh_token,
                provider_user_id=provider_user_id,
                scopes=DEFAULT_SPOTIFY_SCOPES,
            )
            hydrate_user_from_spotify_profile(provider_owner, profile)
            touch_last_seen(provider_owner)
            response = _frontend_result_redirect("login_success")
            clear_guest_cookie(response)
            return response

        email_owner = None
        if spotify_email:
            email_owner = CustomUser.objects.filter(email__iexact=spotify_email, is_guest=False).first()
        if email_owner and email_owner.pk != current_user.pk:
            store_pending_spotify_auth(
                request,
                {
                    "type": "login_existing_required",
                    "reason": "email_collision",
                    "guest_user_id": current_user.pk,
                    "provider_user_id": provider_user_id,
                    "access_token": access_token,
                    "refresh_token": refresh_token,
                    "expires_in": expires_in,
                    "profile": profile,
                    "scopes": DEFAULT_SPOTIFY_SCOPES,
                    "email": spotify_email,
                },
            )
            return _frontend_result_redirect("login_existing_required", {"email": spotify_email})

        user = _finalize_guest_from_spotify(current_user, profile, access_token, refresh_token, expires_in)
        login(request, user)
        touch_last_seen(user)
        response = _frontend_result_redirect("account_created")
        clear_guest_cookie(response)
        return response

    if provider_owner:
        update_or_create_user_tokens(
            provider_owner,
            access_token,
            payload.get("token_type", "Bearer"),
            expires_in,
            refresh_token,
            provider_user_id=provider_user_id,
            scopes=DEFAULT_SPOTIFY_SCOPES,
        )
        hydrate_user_from_spotify_profile(provider_owner, profile)
        login(request, provider_owner)
        touch_last_seen(provider_owner)
        return _frontend_result_redirect("login_success")

    email_owner = None
    if spotify_email:
        email_owner = CustomUser.objects.filter(email__iexact=spotify_email, is_guest=False).first()
    if email_owner:
        store_pending_spotify_auth(
            request,
            {
                "type": "login_existing_required",
                "reason": "email_collision",
                "provider_user_id": provider_user_id,
                "access_token": access_token,
                "refresh_token": refresh_token,
                "expires_in": expires_in,
                "profile": profile,
                "scopes": DEFAULT_SPOTIFY_SCOPES,
                "email": spotify_email,
            },
        )
        return _frontend_result_redirect("login_existing_required", {"email": spotify_email})

    user = _create_user_from_spotify(profile, access_token, refresh_token, expires_in)
    login(request, user)
    touch_last_seen(user)
    return _frontend_result_redirect("account_created")
