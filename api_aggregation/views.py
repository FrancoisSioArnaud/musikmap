from rest_framework.response import Response
from rest_framework import status
from rest_framework.views import APIView

import api_aggregation.util as ut
from box_management.models import Song
from box_management.utils import normalize_string


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
        song = request.data.get('song')

        # Extract the id of the streaming platform from the request data
        request_platform = request.data.get('platform')

        # Check if the streaming platform is Spotify or Deezer (1 for Spotify, 2 for Deezer)
        # and subject to change in the future if more platforms are added
        if request_platform == "spotify":
            platform_req_id = 1
            # The general URL for Spotify is "spotify://track/" and for Deezer is "deezer://www.deezer.com/track/"
            # used to open the song in the app
            general_url = "spotify://track/"
        else:
            platform_req_id = 2
            general_url = "deezer://www.deezer.com/track/"

        try:  # The song already exists in the database
            final_song = Song.objects.filter(title=song['title'], artist=song['artist'],
                                             platform_id=platform_req_id).get()
            return Response(general_url + final_song.song_id, status=status.HTTP_200_OK)

        except Song.DoesNotExist:  # The song does not exist in the database
            # Normalize the search query
            search_query = normalize_string(song['title'] + ' ' + song['artist'])

            if platform_req_id == 1:  # The streaming platform is Spotify
                # Search for the song on Spotify
                final_song = ut.search_on_spotify(search_query, song)
                return Response(general_url + str(final_song['id']), status=status.HTTP_200_OK)

            elif platform_req_id == 2:  # The streaming platform is Deezer
                # Search for the song on Deezer
                final_song = ut.search_on_deezer(search_query, song, self.request.session.session_key)
                return Response(general_url + str(final_song['id']), status=status.HTTP_200_OK)

            else:
                # Return an error response if the platform ID is invalid
                return Response({'error': 'Invalid platform ID.'}, status=status.HTTP_400_BAD_REQUEST)

