import base64
import requests
from django.shortcuts import redirect
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from box_management.provider_services import backend_search_tracks, normalize_spotify_track
from spotify.credentials import CLIENT_ID, CLIENT_SECRET, REDIRECT_URI
from spotify.util import (
    disconnect_user,
    execute_spotify_api_request,
    is_spotify_authenticated,
    update_or_create_user_tokens,
)
from users.utils import get_current_app_user


class AuthURL(APIView):
    def get(self, request, format=None):
        user = get_current_app_user(request)
        if not user or getattr(user, "is_guest", False) or not getattr(request.user, "is_authenticated", False):
            return Response({"detail": "Utilisateur non connecté."}, status=status.HTTP_401_UNAUTHORIZED)

        scopes = "user-read-recently-played"
        params = {
            "client_id": CLIENT_ID,
            "response_type": "code",
            "redirect_uri": REDIRECT_URI,
            "scope": scopes,
        }
        from urllib.parse import urlencode

        return Response({"url": "https://accounts.spotify.com/authorize?" + urlencode(params)}, status=status.HTTP_200_OK)


class Disconnect(APIView):
    def get(self, request, format=None):
        user = get_current_app_user(request)
        if user:
            disconnect_user(user)
        return Response({"status": True}, status=status.HTTP_200_OK)


def spotify_callback(request, format=None):
    code = request.GET.get("code")
    if not code or not getattr(request.user, "is_authenticated", False):
        return redirect("frontend:profile")

    encoded_credentials = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode("utf-8")
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
            "redirect_uri": REDIRECT_URI,
        },
        timeout=10,
    ).json()

    access_token = response.get("access_token")
    refresh_token = response.get("refresh_token")
    expires_in = response.get("expires_in")

    if access_token:
        update_or_create_user_tokens(
            request.user,
            access_token,
            token_type=response.get("token_type"),
            expires_in=expires_in,
            refresh_token=refresh_token,
        )

    return redirect("frontend:profile")


class IsAuthenticated(APIView):
    def get(self, request, format=None):
        return Response({"status": is_spotify_authenticated(get_current_app_user(request))}, status=status.HTTP_200_OK)


class GetRecentlyPlayedTracks(APIView):
    def get(self, request, format=None):
        user = get_current_app_user(request)
        if not user:
            return Response([], status=status.HTTP_401_UNAUTHORIZED)

        response = execute_spotify_api_request(user, "player/recently-played")
        items = response.get("items") or []
        seen_ids = set()
        tracks = []
        for item in items:
            track_item = item.get("track") or {}
            normalized = normalize_spotify_track(track_item)
            track_id = normalized.get("provider_track_id")
            if track_id and track_id in seen_ids:
                continue
            if track_id:
                seen_ids.add(track_id)
            tracks.append(normalized)
        return Response(tracks, status=status.HTTP_200_OK)


class Search(APIView):
    def post(self, request, format=None):
        search_query = request.data.get("search_query")
        return Response(backend_search_tracks("spotify", search_query), status=status.HTTP_200_OK)
