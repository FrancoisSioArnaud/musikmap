import base64
from urllib.parse import urlencode

import requests
from django.contrib.auth import login
from django.shortcuts import redirect
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import CustomUser, UserProviderConnection
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
    apply_pending_spotify_auth_to_user,
    clear_pending_spotify_auth,
    disconnect_user,
    fetch_spotify_profile,
    generate_unique_username,
    get_pending_spotify_auth,
    get_user_tokens,
    hydrate_user_from_spotify_profile,
    is_spotify_authenticated,
    link_spotify_to_user,
    refresh_spotify_token,
    resolve_pending_spotify_auth,
    store_pending_spotify_auth,
    update_or_create_user_tokens,
)
from users.provider_connections import upsert_provider_connection

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


class PendingAuthStatus(APIView):
    def get(self, request, format=None):
        pending = get_pending_spotify_auth(request)
        if not pending:
            return Response({"pending": False}, status=status.HTTP_200_OK)
        return Response(
            {
                "pending": True,
                "type": pending.get("type") or "",
                "reason": pending.get("reason") or "",
                "email": pending.get("email") or "",
            },
            status=status.HTTP_200_OK,
        )


class ResolvePendingAuth(APIView):
    def post(self, request, format=None):
        action = str(request.data.get("action") or "").strip().lower()
        result = resolve_pending_spotify_auth(request, action=action)
        if not result.get("ok"):
            return Response({"detail": result.get("reason") or "Impossible de traiter la demande."}, status=result.get("status") or 400)

        user = result.get("user")
        if user:
            login(request, user)
            touch_last_seen(user)
            response_data = {
                "result": result.get("type") or "merge_success",
                "current_user": build_current_user_payload(user),
            }
            response = Response(response_data, status=status.HTTP_200_OK)
            clear_guest_cookie(response)
            return response

        return Response({"result": result.get("type") or "cancelled"}, status=status.HTTP_200_OK)


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
                    "access_token": access_token,
                    "refresh_token": refresh_token,
                    "expires_in": expires_in,
                    "profile": profile,
                    "scopes": DEFAULT_SPOTIFY_SCOPES,
                },
            )
            return _frontend_result_redirect("merge_required", {"reason": "spotify_already_linked"})

        link_spotify_to_user(
            current_user,
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=expires_in,
            provider_user_id=provider_user_id,
            profile=profile,
            scopes=DEFAULT_SPOTIFY_SCOPES,
        )
        touch_last_seen(current_user)
        return _frontend_result_redirect("provider_linked")

    if getattr(current_user, "is_guest", False):
        if provider_owner and provider_owner.pk != current_user.pk:
            try:
                merge_guest_into_user(current_user, provider_owner)
            except Exception:
                return _frontend_result_redirect("merge_required", {"reason": "spotify_already_linked"})
            login(request, provider_owner)
            link_spotify_to_user(
                provider_owner,
                access_token=access_token,
                refresh_token=refresh_token,
                expires_in=expires_in,
                provider_user_id=provider_user_id,
                profile=profile,
                scopes=DEFAULT_SPOTIFY_SCOPES,
            )
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
        link_spotify_to_user(
            provider_owner,
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=expires_in,
            provider_user_id=provider_user_id,
            profile=profile,
            scopes=DEFAULT_SPOTIFY_SCOPES,
        )
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
