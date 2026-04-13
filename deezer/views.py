import json
import requests
from django.shortcuts import redirect
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from box_management.provider_services import backend_search_tracks
from deezer.credentials import APP_ID, APP_SECRET, REDIRECT_URI
from deezer.util import disconnect_user, execute_deezer_api_request, is_deezer_authenticated, update_or_create_user_tokens
from users.utils import get_current_app_user


class AuthURL(APIView):
    def get(self, request, format=None):
        user = get_current_app_user(request)
        if not user or getattr(user, "is_guest", False) or not getattr(request.user, "is_authenticated", False):
            return Response({"detail": "Utilisateur non connecté."}, status=status.HTTP_401_UNAUTHORIZED)
        return Response(
            {
                "url": (
                    "https://connect.deezer.com/oauth/auth.php?"
                    f"app_id={APP_ID}&redirect_uri={REDIRECT_URI}&perms=email,basic_access,offline_access,listening_history"
                )
            },
            status=status.HTTP_200_OK,
        )


class Disconnect(APIView):
    def get(self, request, format=None):
        user = get_current_app_user(request)
        if user:
            disconnect_user(user)
        return Response({"status": True}, status=status.HTTP_200_OK)


def deezer_callback(request, format=None):
    code = request.GET.get("code")
    if not code or not getattr(request.user, "is_authenticated", False):
        return redirect("frontend:profile")
    response = requests.get(
        url=(
            f"https://connect.deezer.com/oauth/access_token.php?app_id={APP_ID}"
            f"&secret={APP_SECRET}&code={code}&output=json"
        ),
        timeout=10,
    ).content
    payload = json.loads(response.decode() or "{}")
    access_token = payload.get("access_token")
    if access_token:
        update_or_create_user_tokens(request.user, access_token)
    return redirect("frontend:profile")


class IsAuthenticated(APIView):
    def get(self, request, format=None):
        return Response({"status": is_deezer_authenticated(get_current_app_user(request))}, status=status.HTTP_200_OK)


class GetRecentlyPlayedTracks(APIView):
    def get(self, request, format=None):
        user = get_current_app_user(request)
        if not user:
            return Response([], status=status.HTTP_401_UNAUTHORIZED)
        response = execute_deezer_api_request(user, "/user/me/history", recent=True)
        results = response.json() if response.ok else {}
        from box_management.provider_services import normalize_deezer_track
        tracks = [normalize_deezer_track(item, include_isrc=False) for item in (results.get("data") or [])]
        return Response(tracks, status=status.HTTP_200_OK)


class Search(APIView):
    def post(self, request, format=None):
        search_query = request.data.get("search_query")
        return Response(backend_search_tracks("deezer", search_query), status=status.HTTP_200_OK)
