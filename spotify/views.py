import base64
from urllib.parse import urlencode

import requests
from django.shortcuts import redirect
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from spotify.spotipy_client import sp
from users.provider_connections import set_last_platform_for_user, upsert_provider_connection
from users.utils import build_current_user_payload

from .credentials import CLIENT_ID, CLIENT_SECRET
from .util import (
    disconnect_user,
    get_user_tokens,
    is_spotify_authenticated,
    refresh_spotify_token,
    update_or_create_user_tokens,
)


SPOTIFY_SCOPES = "user-read-recently-played"


def _absolute_callback_uri(request):
    callback_url = request.build_absolute_uri("/spotify/redirect")
    forwarded_proto = request.META.get("HTTP_X_FORWARDED_PROTO")
    if forwarded_proto == "https" and callback_url.startswith("http://"):
        return "https://" + callback_url[len("http://") :]
    if not request.get_host().startswith(("localhost", "127.0.0.1")) and callback_url.startswith("http://"):
        return "https://" + callback_url[len("http://") :]
    return callback_url


class AuthURL(APIView):
    def get(self, request, format=None):
        if not getattr(request.user, "is_authenticated", False):
            return Response({"detail": "Utilisateur non connecté."}, status=status.HTTP_401_UNAUTHORIZED)

        auth_headers = {
            "client_id": CLIENT_ID,
            "response_type": "code",
            "redirect_uri": _absolute_callback_uri(request),
            "scope": SPOTIFY_SCOPES,
            "show_dialog": "true",
        }
        return Response(
            {"url": "https://accounts.spotify.com/authorize?" + urlencode(auth_headers)},
            status=status.HTTP_200_OK,
        )


class Disconnect(APIView):
    def get(self, request, format=None):
        if getattr(request.user, "is_authenticated", False):
            disconnect_user(request.user)
        return Response({"status": True}, status=status.HTTP_200_OK)

    def post(self, request, format=None):
        return self.get(request, format=format)


def spotify_callback(request, format=None):
    error = request.GET.get("error")
    code = request.GET.get("code")
    if error or not code or not getattr(request.user, "is_authenticated", False):
        return redirect("/profile/settings?spotify=error")

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
        return redirect("/profile/settings?spotify=error")

    token_type = payload.get("token_type") or "Bearer"
    refresh_token = payload.get("refresh_token") or ""
    expires_in = payload.get("expires_in") or 3600
    update_or_create_user_tokens(
        request.user,
        access_token,
        token_type,
        expires_in,
        refresh_token,
    )
    try:
        upsert_provider_connection(
            user=request.user,
            provider_code="spotify",
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=expires_in,
            scopes=[value for value in SPOTIFY_SCOPES.split() if value],
            is_active=True,
        )
        set_last_platform_for_user(request.user, "spotify")
    except Exception:
        pass
    return redirect("/profile/settings?spotify=connected")


class IsAuthenticated(APIView):
    def get(self, request, format=None):
        return Response({"status": is_spotify_authenticated(self.request.user)}, status=status.HTTP_200_OK)


class RefreshAccessToken(APIView):
    def post(self, request, format=None):
        if not getattr(request.user, "is_authenticated", False):
            return Response({"detail": "Utilisateur non connecté."}, status=status.HTTP_401_UNAUTHORIZED)

        if not refresh_spotify_token(request.user):
            return Response({"detail": "Impossible de rafraîchir le token Spotify."}, status=status.HTTP_400_BAD_REQUEST)

        tokens = get_user_tokens(request.user)
        connection_payload = build_current_user_payload(request.user)
        return Response(
            {
                "access_token": tokens.access_token if tokens else None,
                "expires_at": tokens.expires_in.isoformat() if tokens and tokens.expires_in else None,
                "current_user": connection_payload,
            },
            status=status.HTTP_200_OK,
        )


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
