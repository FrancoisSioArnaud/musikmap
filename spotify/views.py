from django.shortcuts import render, redirect
from .credentials import REDIRECT_URI, CLIENT_ID, CLIENT_SECRET
from rest_framework.views import APIView
from rest_framework import status
from rest_framework.response import Response
from spotify.spotipy_client import sp
from .util import *
import base64
from urllib.parse import urlencode
import requests


class AuthURL(APIView):
    """
    Class goal:
    This class represents an API view for generating an authentication URL for Spotify.

    Methods:
    def get(self, request, format=None):
        Retrieves the authentication URL.

    """

    def get(self, request, format=None):
        """
        Method goal:
        Retrieves the authentication URL for Spotify.

        Arguments:
        self    : The instance of the class.
        request : The request object.
        format  : The desired format of the response. Defaults to None.

        Returns:
        dict: A dictionary containing the authentication URL.

        """
        scopes = 'user-read-recently-played'

        auth_headers = {
            "client_id": CLIENT_ID,
            "response_type": "code",
            "redirect_uri": REDIRECT_URI,
            "scope": scopes
        }
        return Response({'url': "https://accounts.spotify.com/authorize?" + urlencode(auth_headers)},
                        status=status.HTTP_200_OK)


class Disconnect(APIView):
    def get(self, request, format=None):
        """
        Method goal:
        Disconnects the user from Spotify.

        Arguments:
        self    : The instance of the class.
        request : The request object.
        format  : The desired format of the response. Defaults to None.

        Returns:
        dict: A dictionary containing the authentication URL.

        """
        user = request.user
        if user:
            disconnect_user(user)
        return Response(status=status.HTTP_200_OK)


def spotify_callback(request, format=None):
    """
    Callback function for handling the Spotify authorization code flow.
    This function exchanges the authorization code received from Spotify for access and refresh tokens,
    and stores the user tokens in the database.

    Args:
        request: The HTTP request object containing the callback parameters.
        format: Optional format parameter for specifying the response format.

    Returns:
        A redirect response to the home page.
    """

    # Extract the authorization code and error from the callback parameters
    code = request.GET.get('code')
    error = request.GET.get('error')

    # Encode client credentials to be sent in the request header
    encoded_credentials = base64.b64encode(CLIENT_ID.encode() + b':' + CLIENT_SECRET.encode()).decode("utf-8")

    # Set the request headers
    headers = {
        "Authorization": "Basic " + encoded_credentials,
        "Content-Type": "application/x-www-form-urlencoded"
    }

    # Send a POST request to Spotify's token endpoint to exchange the authorization code for tokens
    response = requests.post('https://accounts.spotify.com/api/token', headers=headers, data={
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': REDIRECT_URI
    }).json()

    # Extract the fields from the response
    access_token = response.get('access_token')
    token_type = response.get('token_type')
    refresh_token = response.get('refresh_token')
    expires_in = response.get('expires_in')
    error = response.get('error')

    user = request.user
    # Update or create the user tokens in the database
    update_or_create_user_tokens(
        user,
        access_token,
        token_type,
        expires_in,
        refresh_token)

    # Redirect back to the profile page
    return redirect('frontend:profile')


class IsAuthenticated(APIView):
    """
    API view class for checking if the user is authenticated with Spotify.

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

        # Check if the user is authenticated with Spotify
        is_authenticated = is_spotify_authenticated(
            self.request.user)

        # Return the authentication status in the response
        return Response({'status': is_authenticated},
                        status=status.HTTP_200_OK)


class GetRecentlyPlayedTracks(APIView):
    """
    API view class for retrieving the recently played tracks of the user from Spotify.

    Methods:
        get(request, format=None): Retrieves the recently played tracks of the user.

    Attributes:
        None
    """

    def get(self, request, format=None):
        """
        Retrieves the recently played tracks of the user from Spotify.

        Args:
            request: The HTTP request object.
            format: Optional format parameter for specifying the response format.

        Returns:
            A Response object containing the recently played tracks of the user.
        """

        # Execute the Spotify API request to retrieve the recently played tracks
        response = execute_spotify_api_request(
            self.request.user,
            'player/recently-played')

        # Check if there is an error in the response or if the 'items' key is missing
        if 'error' in response or 'items' not in response:
            return Response({}, status=status.HTTP_204_NO_CONTENT)

        # Parse and filter the response to extract relevant track information
        tracks = []
        for item in response.get('items'):

            # Check if the list doesn't already contain the song
            if not any(existing_track['id'] == item['track']['id'] for existing_track in tracks):
                track = {
                    'id': item['track']['id'],
                    'name': item['track']['name'],
                    'artist': item['track']['artists'][0]['name'],
                    'album': item['track']['album']['name'],
                    'image_url': item['track']['album']['images'][0]['url'],
                    'duration': item['track']['duration_ms'] // 1000,
                    'platform_id': 1,
                    'url': item['track']['external_urls']['spotify'],
                }
                tracks.append(track)

        # Return the list of recently played tracks in the response
        return Response(tracks, status=status.HTTP_200_OK)


class Search(APIView):
    """
    API view class for searching tracks using the Spotify API.

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

        # Search for tracks using the Spotipy client, limit = nombre de songs requested
        results = sp.search(q=search_query, type='track', limit=15)

        # Extract the track data from the results and create a list of tracks
        tracks = []
        for item in results['tracks']['items']:
            track = {
                'id': item['id'],
                'name': item['name'],
                'artist': item['artists'][0]['name'],
                'album': item['album']['name'],
                'image_url': item['album']['images'][0]['url'],
                'duration': item['duration_ms'] // 1000,
                'platform_id': 1,
                'url': item['external_urls']['spotify'],
            }
            tracks.append(track)
        # Return the list of tracks as a response
        return Response(tracks, status=status.HTTP_200_OK)


