from django.contrib.auth.models import AnonymousUser
from django.middleware.csrf import get_token
from django.urls import reverse
from datetime import date, timedelta
from rest_framework.response import Response
from rest_framework.decorators import api_view
from rest_framework import status
from rest_framework.views import APIView  # Generic API view
from .serializers import *
from .models import *
from .util import calculate_distance, normalize_string, calculate_distance
from utils import NB_POINTS_ADD_SONG, NB_POINTS_FIRST_DEPOSIT_USER_ON_BOX, NB_POINTS_FIRST_SONG_DEPOSIT_BOX, NB_POINTS_FIRST_SONG_DEPOSIT_GLOBAL, NB_POINTS_CONSECUTIVE_DAYS_BOX
from django.shortcuts import render, get_object_or_404, redirect
import json
import requests
from api_aggregation.views import ApiAggregation


def cardboard_redirect(request, unique_url):
    """
    View goal: Redirects to the associated box URL based on the cardboard's unique URL.
    """
    cardboard = get_object_or_404(Cardboard, unique_url=unique_url)
    return redirect(f'/box/{cardboard.box.url}')


def is_first_user_deposit(user, box):
    deposits = Deposit.objects.filter(user=user, box_id=box)
    return not deposits.exists()


def is_first_song_deposit_global(song):
    song_deposits = Deposit.objects.filter(song=song)
    return not song_deposits.exists()


def is_first_song_deposit(song, box):
    song_deposits = Deposit.objects.filter(song=song, box_id=box)
    return not song_deposits.exists()


def get_consecutive_deposit_days(user, box):
    # Retrieve all deposits made by the user on the box, ordered by deposited_at in descending order
    deposits = Deposit.objects.filter(user=user, box_id=box).order_by('-deposited_at')

    # Get the current date
    current_date = date.today()

    # Calculate the previous date
    previous_date = current_date - timedelta(days=1)

    consecutive_days = 0
    for deposit in deposits:
        if deposit.deposited_at.date() == previous_date:
            consecutive_days += 1
            previous_date -= timedelta(days=1)

    return consecutive_days

@api_view(['POST'])
def create_deposit_and_get_last(request):
    # Extract data from the request
    option = request.data.get('option')
    song_name = option.get('name')
    song_author = option.get('artist')
    song_platform_id = option.get('platform_id')
    note = option.get('note')
    box_id = request.data.get('box_id')

    # Verify if the song already exists
    try:
        song = Song.objects.filter(title=song_name, artist=song_author).get()
    except Song.DoesNotExist:
        # Create a new song
        song_url = option.get('url')
        song_image = option.get('image_url')
        song_duration = option.get('duration')
        song = Song(title=song_name, artist=song_author, url=song_url, image_url=song_image,
                    duration=song_duration, platform_id=song_platform_id)

    if not song.spotify_id or not song.deezer_id:
        try:
            song.spotify_id, song.deezer_id = ApiAggregation().get_platform_ids(song, request)
        except Exception as e:
            pass

    song.save()
    box = Box.objects.filter(id=box_id).get()

    # Find the last visible deposit before creating a new one
    last_deposit = Deposit.objects.filter(box_id=box, is_visible=True).order_by('-deposited_at').first()

    # Create a new deposit and set it as visible
    user = request.user if not isinstance(request.user, AnonymousUser) else None
    new_deposit = Deposit(song_id=song.id, box_id=box_id, user=user, note=note, is_visible=True)
    new_deposit.save()

    # Achievements check and points calculation
    successes: dict = {}
    points_to_add = NB_POINTS_ADD_SONG  # Default minimum points gained by deposit
    default_deposit = {
        'name': "Pépite",
        'desc': "Tu as partagé une chanson",
        'points': NB_POINTS_ADD_SONG
    }
    successes['default_deposit'] = default_deposit

    points_to_add = NB_POINTS_ADD_SONG

    if is_first_user_deposit(user, box):
        points_to_add += NB_POINTS_FIRST_DEPOSIT_USER_ON_BOX
        successes['first_user_deposit_box'] = {
            'name': "Conquérant",
            'desc': "Tu n'as jamais déposé ici",
            'points': NB_POINTS_FIRST_DEPOSIT_USER_ON_BOX
        }

        if is_first_song_deposit(song, box):
            points_to_add += NB_POINTS_FIRST_SONG_DEPOSIT_BOX
            successes['first_song_deposit'] = {
                'name': "Far West",
                'desc': "Ce son n'a jamais été déposé ici",
                'points': NB_POINTS_FIRST_SONG_DEPOSIT_BOX
            }
            if is_first_song_deposit_global(song):
                points_to_add += NB_POINTS_FIRST_SONG_DEPOSIT_GLOBAL
                successes['first_song_deposit_global'] = {
                    'name': "Far West",
                    'desc': "Ce son n'a jamais été déposé sur notre réseau",
                    'points': NB_POINTS_FIRST_SONG_DEPOSIT_GLOBAL
                }

        nb_consecutive_days = get_consecutive_deposit_days(user, box)
        if nb_consecutive_days:
            consecutive_days_points = nb_consecutive_days * NB_POINTS_CONSECUTIVE_DAYS_BOX
            points_to_add += consecutive_days_points
            nb_consecutive_days += 1
            successes['consecutive_days'] = {
                'name': "L'amour fou",
                'desc': f"{nb_consecutive_days} jours consécutifs avec cette boite",
                'points': consecutive_days_points
            }

    if user is not None:
        user.points += points_to_add
        user.save()

        if not DiscoveredSong.objects.filter(user=user, deposit__song__artist=song_author,
                                             deposit__song__title=song_name).exists():
            DiscoveredSong(user=user, deposit=new_deposit).save()

    new_deposit_data = DepositSerializer(new_deposit).data
    last_deposit_data = DepositSerializer(last_deposit).data if last_deposit else None
    song_data = SongSerializer(last_deposit.song).data if last_deposit else None

    response = {
        'new_deposit': new_deposit_data,
        'last_deposit': last_deposit_data,
        'song': song_data,
        'achievements': successes
    }
    return Response(response, status=status.HTTP_200_OK)


class GetBox(APIView):
    lookup_url_kwarg = 'name'
    serializer_class = BoxSerializer

    def get(self, request, format=None):
        """
        Retrieves information about a box and its associated deposits and songs.

        Parameters:
        - request: The HTTP request object.
        - format (str): The format of the response data (default: None).

        Returns:
        - Response: The HTTP response containing the box information, deposits, and songs.

        Raises:
        - HTTP 404 Not Found: If the box name is invalid or not found.
        - HTTP 400 Bad Request: If the name of the box is not found in the request.
        """
        name = request.GET.get(self.lookup_url_kwarg)
        if name is None:
            return Response({'Bad Request': 'Name of the box not found in request'}, status=status.HTTP_400_BAD_REQUEST)

        box = Box.objects.filter(url=name).first()
        if not box:
            return Response({'Bad Request': 'Invalid Box Name'}, status=status.HTTP_404_NOT_FOUND)

        data = BoxSerializer(box).data

        last_deposit = Deposit.objects.filter(
            box_id=box,
            is_visible=True
        ).order_by('-deposited_at').first()

        if last_deposit:
            user = last_deposit.user
            deposit_data = {
                'id': last_deposit.id,
                'note': last_deposit.note,
                'image_url': Song.objects.get(pk=last_deposit.song.id).image_url,
                'user_id': user.id if user else None,
                'profile_picture': user.profile_picture.url if user and user.profile_picture else ""
            }
            last_deposits_data = [deposit_data]
        else:
            last_deposits_data = []

        data['last_deposits'] = last_deposits_data
        deposit_count = 1 if last_deposit else 0

        resp = {
            'box': data,
            'deposit_count': deposit_count,
        }

        return Response(resp, status=status.HTTP_200_OK)

class ReplaceVisibleDeposits(APIView):
    """
    Class goal: Replace the visible deposits disclosed by the user
    """

    def post(self, request):
        """
        Function goal: Replace the visible deposits disclosed by the user

        Args:
            request: the request sent by the user

        Returns:
            Response: the response containing the new visible deposits or an error message
        """

        # Get the box, the visible deposit disclosed by the user and the search deposit
        box_id = request.data.get('search_deposit').get('box_id')
        visible_deposit_id = request.data.get('visible_deposit').get('id')
        search_deposit_id = request.data.get('search_deposit').get('id')
        # Delete the visible deposit disclosed by the user
        VisibleDeposit.objects.filter(deposit_id=visible_deposit_id).delete()

        # Get the most recent deposit that is not in the visible deposits
        i = 0
        while search_deposit_id in VisibleDeposit.objects.filter(deposit_id__box_id=box_id).values('deposit_id'):
            i += 1
            search_deposit_id = Deposit.objects.filter(box_id=box_id).order_by('-deposited_at')[i].id

        # Create a new visible deposit with the search deposit
        search_deposit = Deposit.objects.filter(id=search_deposit_id).get()
        # Check if the search deposit is not already visible
        if len(VisibleDeposit.objects.filter(deposit_id__song_id=search_deposit.song_id)) == 0:
            VisibleDeposit(deposit_id=search_deposit).save()
            return Response({'success': True}, status=status.HTTP_200_OK)
        else:
            return Response({'error': 'The search deposit is already visible'}, status=status.HTTP_400_BAD_REQUEST)


class Location(APIView):
    """
    Class goal: Get the location of the user and check if they are at the box
    """

    def post(self, request):
        """
        Function goal: Get the location of the user and check if they are at the box

        Args:
            request: the request sent by the user

        Returns:
            Response: the response containing the location of the user or an error message

        """
        latitude = float(request.data.get('latitude'))
        longitude = float(request.data.get('longitude'))
        box = request.data.get('box')
        box = Box.objects.filter(id=box.get('id')).get()
        # Get all location points of the box
        points = LocationPoint.objects.filter(box_id=box)
        is_valid_location = False
        if len(points) == 0:
            # No location points for this box, return an error in the response
            return Response({'error': 'No location points for this box'}, status=status.HTTP_404_NOT_FOUND)
        for point in points:
            # Get the coordinates of the point
            max_dist = point.dist_location
            target_latitude = point.latitude
            target_longitude = point.longitude
            # Calculate distance between the two points
            distance = calculate_distance(latitude, longitude, target_latitude, target_longitude)
            # Compare the coordinates with the desired location
            if distance <= max_dist:
                is_valid_location = True

        if is_valid_location:
            # Location is valid
            return Response({'valid': True}, status=status.HTTP_200_OK)
        else:
            # Location is not valid
            return Response({'valid': False, 'lat': latitude, 'long': longitude}, status=status.HTTP_403_FORBIDDEN)


class CurrentBoxManagement(APIView):
    """
    API view for managing the current box name.
    """

    def get(self, request, format=None):
        """
        Retrieves the current box name from the user's session.
        Returns:
            - 200 OK with the current box name if it exists.
            - 400 BAD REQUEST if the current box name key does not exist in the session.
        """
        try:
            current_box_name = request.session['current_box_name']
            return Response({'current_box_name': current_box_name}, status=status.HTTP_200_OK)
        except KeyError:
            # The 'current_box_name' key does not exist in request.session
            return Response({'error': 'La clé current_box_name n\'existe pas'}, status=status.HTTP_400_BAD_REQUEST)

    def post(self, request, format=None):
        """
        Updates the current box name in the user's session.
        Expects:
            - 'current_box_name' field in the request data.
        Returns:
            - 200 OK with a success message if the current box name is updated.
            - 401 UNAUTHORIZED if 'current_box_name' field is missing in the request data.
            - 500 INTERNAL SERVER ERROR if an exception occurs during the update.
        """

        # Guard clause that checks if user is logged in
        if 'current_box_name' not in request.data:
            return Response({'errors': 'Aucun nom de boîte n\'a été fournie.'}, status=status.HTTP_401_UNAUTHORIZED)

        current_box_name = request.data.get('current_box_name')

        try:
            # Update the current box name in the user's session
            request.session['current_box_name'] = current_box_name
            request.session.modified = True

            return Response({'status': 'Le nom de la boîte actuelle a été modifié avec succès.'},
                            status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'errors': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# class UpdateVisibleDeposits(APIView):
#     """
#     Class goal: Update the visible deposits of a box when the user discloses a deposit after depositing a song
#     """
#
#     def post(self, request):
#         """
#         Function goal: Update the visible deposits of a box
#         Args:
#             request: the request sent by the user
#
#         Returns:
#             Response: the response containing the new visible deposits or an error message
#         """
#         box_name = request.data.get('boxName')
#         box = Box.objects.filter(url=box_name).get()
#
#         # Get the maximum number of deposits to display
#         max_deposits = box.max_deposits
#         # Get the visible deposits of the box
#         visible_deposits = Deposit.objects.filter(deposit_id__box_id=box, is_visible=True).order_by('-deposited_at')
#         # Get the number of visible deposits
#         n_visible_deposits = len(visible_deposits)
#
#         # If the number of visible deposits is more than the maximum number of deposits to display
#         if n_visible_deposits > max_deposits:
#             # Delete the oldest visible deposits
#             for i in range(max_deposits, n_visible_deposits):
#                 visible_deposits[i].delete()
#         # If the number of visible deposits is less than the maximum number of deposits to display
#         elif n_visible_deposits < max_deposits:
#             # Get the number of deposits to add
#             n_deposits_to_add = max_deposits - n_visible_deposits
#             # Get the last n_deposits_to_add deposits of the box that are not visible
#             deposits_to_add = Deposit.objects.filter(box_id=box).exclude(
#                 song_id__in=visible_deposits.values('deposit_id__song_id')).order_by('-deposited_at')[:n_deposits_to_add]
#             # Add the deposits to the visible deposits
#             for deposit in deposits_to_add:
#                 # check if the song is already linked to a visible deposit
#                 if not VisibleDeposit.objects.filter(deposit_id__song_id=deposit.song_id).exists():
#                     VisibleDeposit(deposit_id=deposit).save()
#         return Response({'success': True}, status=status.HTTP_200_OK)


class ManageDiscoveredSongs(APIView):
    """
    Class used to update and get the discovered songs of the user

    Methods:
        get: Get the discovered songs of the user
        post: Add a deposit to the discovered songs of the user
    """
    '''Class goal : manage the discovered songs of the user'''

    def post(self, request):
        """
        Method goal : Add a deposit to the discovered songs of the user

            Args:
                request: The request sent by the user

            Returns:
                A response with the status of the request
        """
        # Get the user
        user = request.user

        # Check if the user is authenticated
        if not user.is_authenticated:
            return Response({'error': 'Vous devez être connecté pour effectuer cette action.'},
                            status=status.HTTP_401_UNAUTHORIZED)
        else:
            # Add the deposit to the user's discovered songs
            deposit_id = request.data.get('visible_deposit').get('id')
            deposit = Deposit.objects.get(id=deposit_id)
            # Get the song linked to the id
            song_id = Song.objects.get(id=deposit.song.id)
            # Check if the song is linked to another deposit
            if DiscoveredSong.objects.filter(user_id=user, deposit_id__song_id__artist=song_id.artist,
                                             deposit_id__song_id__title=song_id.title).exists():
                # The song is already linked to another deposit
                return Response({'error': 'Cette chanson est déjà liée à un autre dépôt.'},
                                status=status.HTTP_400_BAD_REQUEST)
            else:
                # Get the deposit
                deposit = Deposit.objects.filter(song_id=song_id).last()
                # Create a new discovered song linked to the user
                DiscoveredSong(user_id=user, deposit_id=deposit).save()
                return Response({'success': True}, status=status.HTTP_200_OK)

    def get(self, request):
        """ Get the discovered songs of the user

            Args:
                request: The request sent by the user

            Returns:
                A response with the discovered songs of the user
        """
        # Get the user
        user = request.user
        # Check if the user is authenticated
        if not user.is_authenticated:
            return Response({'error': 'Vous devez être connecté pour effectuer cette action.'},
                            status=status.HTTP_401_UNAUTHORIZED)
        else:
            # Get the discovered songs of the user
            discovered_songs = DiscoveredSong.objects.filter(user=user).order_by('-deposit__deposited_at')
            discovered_list = []
            # Get the songs from the discovered deposits
            for discovered_song in discovered_songs:
                song = discovered_song.deposit.song
                discovered_list.append(song)

        # Serialize the discovered songs
        serializer = SongSerializer(discovered_list, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class AddDepositNote(APIView):
    '''
    Class goal : add a note to a deposit
    '''

    def post(self, request, format=None):
        note = request.data.get('note')

        # A note is optional
        if not note:
            return Response({'status': 'Pas de note choisie'}, status=status.HTTP_200_OK)

        try:
            deposit_id = request.data.get('deposit_id')
            deposit = Deposit.objects.get(id=deposit_id)

            # Guard clause that checks if the note is a valid choice
            if note not in dict(deposit.NOTE_CHOICES):
                return Response({'status': 'Cette note n\'existe pas'}, status=status.HTTP_400_BAD_REQUEST)

            deposit.note = note
            deposit.save()

            return Response({'status': 'Note ajoutée avec succès'}, status=status.HTTP_200_OK)

        except Deposit.DoesNotExist:
            return Response({'status': 'Dépôt introuvable'}, status=status.HTTP_401_UNAUTHORIZED)
