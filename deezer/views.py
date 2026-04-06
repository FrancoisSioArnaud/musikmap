import json
from django.shortcuts import redirect
from .credentials import REDIRECT_URI, APP_ID, APP_SECRET
from rest_framework.views import APIView
from rest_framework import status
from rest_framework.response import Response
from .util import *
import requests


# Create your views here.
class AuthURL(APIView):
    """
    Class goal:
    This class represents an API view for generating an authentication URL for Deezer.

    Methods:
    def get(self, request, format=None):
        Retrieves the authentication URL.

    """

    def get(self, request, format=None):
        """
        Method goal:
        Retrieves the authentication URL for Deezer.

        Arguments:
        self    : The instance of the class.
        request : The request object.
        format  : The desired format of the response. Defaults to None.

        Returns:
        response: A response object containing the authentication URL.
        """
        return Response({
            'url': "https://connect.deezer.com/oauth/auth.php?app_id=" + APP_ID + "&redirect_uri=" + REDIRECT_URI + "&perms=email,basic_access,offline_access,listening_history"},
            status=status.HTTP_200_OK)


class Disconnect(APIView):
    def get(self, request, format=None):
        """
        Method goal:
        Disconnects the user from Deezer.

        Arguments:
        self    : The instance of the class.
        request : The request object.
        format  : The desired format of the response. Defaults to None.

        Returns:
        response: A response object confirming the disconnection.

        """
        # Get the username of the user
        user = request.user.username
        # Disconnect the user from Deezer if the user is authenticated
        if user:
            disconnect_user(user)
        return Response(status=status.HTTP_200_OK)


def deezer_callback(request, format=None):
    """
    Callback function for handling the Deezer authorization code flow.
    This function exchanges the authorization code received from Deezer for access tokens,
    and stores the user tokens in the database.

    Args:
        request: The HTTP request object containing the callback parameters.
        format: Optional format parameter for specifying the response format.

    Returns:
        A redirect response to the profile page of the user.
    """

    # Extract the authorization code and error from the callback parameters
    code = request.GET.get('code')
    error = request.GET.get('error_reason')

    # If the user denied access, redirect back to the home page
    response = requests.get(url=f'https://connect.deezer.com/oauth/access_token.php?app_id={APP_ID}'
                                f'&secret={APP_SECRET}&code={code}&output=json').content
    response = response.decode()
    response = json.loads(response)
    # Extract the fields from the response
    access_token = response['access_token']
    # Check if the user has an active session
    user = request.user

    # If the user has an active session, update the user tokens in the database
    if user:
        update_or_create_user_tokens(user, access_token)
    # If the user doesn't have an active session, create a new session and store the user tokens in the database
    else:
        update_or_create_user_tokens(user, access_token)

    # Update or create the user tokens in the database
    # Redirect back to the profile page
    # If we want to redirect to the register page for example we should write frontend:register
    return redirect('frontend:profile')


class IsAuthenticated(APIView):
    """
    API view class for checking if the user is authenticated with Deezer.

    Methods:
        get(request, format=None): Retrieves the authentication status of the user.
    """

    def get(self, request, format=None):
        """
        Retrieves the authentication status (true if authentifcated, false if not) of the user.

        Args:
            request: The HTTP request object.
            format: Optional format parameter for specifying the response format.

        Returns:
            A Response object containing the authentication status of the user.

        Raises:
            None
        """

        # Check if the user is authenticated with Deezer
        is_authenticated = is_deezer_authenticated(
            self.request.user)

        # Return the authentication status in the response
        return Response({'status': is_authenticated},
                        status=status.HTTP_200_OK)


class GetRecentlyPlayedTracks(APIView):
    """
    API view class for retrieving the recently played tracks of the user from Deezer.

    Methods:
        get(request, format=None): Retrieves the recently played tracks of the user.
    """

    def get(self, request, format=None):
        """
        Retrieves the recently played tracks of the user from Deezer.

        Args:
            request: The HTTP request object.
            format: Optional format parameter for specifying the response format.

        Returns:
            A Response object containing the recently played tracks of the user.
        """

        # Execute the Deezer API request to retrieve the recently played tracks
        response = execute_deezer_api_request(
            self.request.user,
            '/user/me/history', recent=True)
        results = response.json()

        # Parse and filter the response to extract relevant track information
        tracks = []
        for item in results['data']:
            track = {
                'id': item['id'],
                'name': item['title'],
                'artist': item['artist']['name'],
                'album': item['album']['title'],
                'image_url': item['album']['cover_medium'],
                'image_url_small': item['album'].get('cover_small') or item['album']['cover_medium'],
                'duration': item['duration'],
                'platform_id': 2,
                'url': item['link'],
            }
            tracks.append(track)
        # Return the list of recently played tracks in the response
        return Response(tracks, status=status.HTTP_200_OK)


class Search(APIView):
    """
    API view class for searching tracks using the Deezer API.

    Methods:
        post(request, format=None): Searches for tracks based on the provided search query.
    """

    def post(self, request, format=None):
        """
        Searches for tracks based on the provided search query.

        Args:
            request: The HTTP request object.
            format: Optional format parameter for specifying the response format.

        Returns:
            A Response object containing the search results as a list of tracks.
        """

        # Extract the search query from the request data
        search_query = request.data.get('search_query')
        # Search for tracks
        results = execute_deezer_api_request(
            self.request.user,
            'search/track?q=' + search_query + '&output=json')
        results = results.json()
        # Extract the track data from the results and create a list of tracks
        tracks = []
        for item in results['data']:
            track = {
                'id': item['id'],
                'name': item['title'],
                'artist': item['artist']['name'],
                'album': item['album']['title'],
                'image_url': item['album']['cover_medium'],
                'image_url_small': item['album'].get('cover_small') or item['album']['cover_medium'],
                'duration': item['duration'],
                'platform_id': 2,
                'url': item['link'],
            }
            tracks.append(track)

        # Return the list of tracks as a response
        return Response(tracks, status=status.HTTP_200_OK)
