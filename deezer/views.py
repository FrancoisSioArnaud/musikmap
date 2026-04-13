import json
from urllib.parse import urlencode

import requests
from django.shortcuts import redirect
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .credentials import APP_ID, APP_SECRET
from .util import disconnect_user, execute_deezer_api_request, is_deezer_authenticated, update_or_create_user_tokens


def _absolute_callback_uri(request):
    callback_url = request.build_absolute_uri("/deezer/redirect")
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

        params = {
            "app_id": APP_ID,
            "redirect_uri": _absolute_callback_uri(request),
            "perms": "email,basic_access,offline_access,listening_history",
        }
        return Response(
            {"url": "https://connect.deezer.com/oauth/auth.php?" + urlencode(params)},
            status=status.HTTP_200_OK,
        )


class Disconnect(APIView):
    def get(self, request, format=None):
        if getattr(request.user, "is_authenticated", False):
            disconnect_user(request.user)
        return Response({"status": True}, status=status.HTTP_200_OK)

    def post(self, request, format=None):
        return self.get(request, format=format)


def deezer_callback(request, format=None):
    error = request.GET.get("error_reason") or request.GET.get("error")
    code = request.GET.get("code")
    if error or not code or not getattr(request.user, "is_authenticated", False):
        return redirect("/profile/settings?deezer=error")

    response = requests.get(
        url=(
            f"https://connect.deezer.com/oauth/access_token.php?app_id={APP_ID}"
            f"&secret={APP_SECRET}&code={code}&output=json"
        ),
        timeout=20,
    )
    payload = response.json() if response.content else {}
    access_token = payload.get("access_token")
    if not response.ok or not access_token:
        return redirect("/profile/settings?deezer=error")

    update_or_create_user_tokens(request.user, access_token)
    return redirect("/profile/settings?deezer=connected")


class IsAuthenticated(APIView):
    def get(self, request, format=None):
        return Response({"status": is_deezer_authenticated(self.request.user)}, status=status.HTTP_200_OK)


class GetRecentlyPlayedTracks(APIView):
    def get(self, request, format=None):
        response = execute_deezer_api_request(self.request.user, "/user/me/history", recent=True)
        if response is None or not response.ok:
            return Response([], status=status.HTTP_200_OK)

        results = response.json() if response.content else {}
        tracks = []
        for item in results.get("data", []):
            artist = item.get("artist") or {}
            album = item.get("album") or {}
            tracks.append(
                {
                    "id": item.get("id"),
                    "name": item.get("title"),
                    "artist": artist.get("name", ""),
                    "artists": [artist.get("name")] if artist.get("name") else [],
                    "album": album.get("title"),
                    "image_url": album.get("cover_medium"),
                    "image_url_small": album.get("cover_small") or album.get("cover_medium"),
                    "duration": item.get("duration") or 0,
                    "platform_id": 2,
                    "url": item.get("link"),
                }
            )
        return Response(tracks, status=status.HTTP_200_OK)


class Search(APIView):
    def post(self, request, format=None):
        search_query = request.data.get("search_query") or ""
        response = execute_deezer_api_request(self.request.user, f"search/track?q={search_query}&output=json")
        if response is None or not response.ok:
            return Response([], status=status.HTTP_200_OK)

        results = response.json() if response.content else {}
        tracks = []
        for item in results.get("data", []):
            artist = item.get("artist") or {}
            contributors = item.get("contributors") or []
            artists = [contributor.get("name") for contributor in contributors if contributor.get("name")]
            if not artists and artist.get("name"):
                artists = [artist.get("name")]
            album = item.get("album") or {}
            tracks.append(
                {
                    "id": item.get("id"),
                    "name": item.get("title"),
                    "artist": artist.get("name", ""),
                    "artists": artists,
                    "album": album.get("title"),
                    "image_url": album.get("cover_medium"),
                    "image_url_small": album.get("cover_small") or album.get("cover_medium"),
                    "duration": item.get("duration") or 0,
                    "platform_id": 2,
                    "url": item.get("link"),
                }
            )
        return Response(tracks, status=status.HTTP_200_OK)
