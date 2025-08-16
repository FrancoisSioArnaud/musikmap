from rest_framework.response import Response
from rest_framework import status
from rest_framework.views import APIView

import api_aggregation.util as ut
from box_management.models import Song
from box_management.models import Deposit
from box_management.serializers import SongSerializer
from box_management.util import normalize_string


class ApiAggregation(APIView):
    """
    This class is used to handle the requests to the API Aggregation service.

    Methods:
        def post(self, request): Handles the POST requests to the API Aggregation service.
    """

    def post(self, request):
        """
        Arguments:
            self    : The instance of the class.
            request : The request object.

        Returns:
            response: A response object containing the URL of the song on the streaming platform specified in the request.
        """
        # Extract the search query from the request data
        # song_id = request.data.get('song').get('id')
        # deposit = Deposit.objects.get(id=song_id)
        song = Song.objects.get(id=request.data.get('song').get('id'))

        # Extract the id of the streaming platform from the request data
        request_platform = request.data.get('platform')

        # Check if the streaming platform is Spotify or Deezer
        if request_platform == "spotify":
            # Check if the song has a Spotify ID
            general_url = "spotify://track/"
            if song.spotify_id:
                return Response(general_url + song.spotify_id, status=status.HTTP_200_OK)
            else:
                # Search for the song on Spotify
                search_query = normalize_string(song.title + ' ' + song.artist)
                final_song_id = ut.search_on_spotify(search_query, song)
                return Response("spotify://track/" + str(final_song_id), status=status.HTTP_200_OK)

        elif request_platform == "deezer":
            # Check if the song has a Deezer ID
            general_url = "https://www.deezer.com/track/"
            if song.deezer_id:
                return Response(general_url + song.deezer_id, status=status.HTTP_200_OK)
            else:
                # Search for the song on Deezer
                search_query = normalize_string(song.title + ' ' + song.artist)
                final_song_id = ut.search_on_deezer(search_query, song, self.request.session.session_key)
                return Response(general_url + str(final_song_id), status=status.HTTP_200_OK)

        else:
            # Return an error response if the platform is not supported
            return Response({'error': 'Invalid platform.'}, status=status.HTTP_400_BAD_REQUEST)

    def get_platform_ids(self, song, request):
        """
        Helper method to retrieve Spotify and Deezer IDs.
        """
        song = SongSerializer(song).data
        search_query = normalize_string(song['title'] + ' ' + song['artist'])

        # Search for the song on Spotify
        spotify_song = ut.search_on_spotify(search_query, song)
        spotify_id = spotify_song['id'] if spotify_song else None

        # Search for the song on Deezer
        deezer_song = ut.search_on_deezer(search_query, song, request.session.session_key)
        deezer_id = deezer_song['id'] if deezer_song else None

        return spotify_id, deezer_id
