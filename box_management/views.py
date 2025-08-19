from django.contrib.auth.models import AnonymousUser
from django.middleware.csrf import get_token
from django.urls import reverse
from datetime import date, timedelta
from rest_framework.response import Response
from rest_framework import status
from rest_framework.views import APIView  # Generic API view
from .serializers import *
from .models import *
from .util import calculate_distance, normalize_string, calculate_distance
from utils import NB_POINTS_ADD_SONG, NB_POINTS_FIRST_DEPOSIT_USER_ON_BOX, NB_POINTS_FIRST_SONG_DEPOSIT_BOX, NB_POINTS_FIRST_SONG_DEPOSIT_GLOBAL, NB_POINTS_CONSECUTIVE_DAYS_BOX
from django.shortcuts import render, get_object_or_404
import json
import requests


def is_first_user_deposit(user, box):
    deposits = Deposit.objects.filter(user=user, box_id=box)
    return not deposits.exists()


def is_first_song_deposit_global(song):
    song_deposits = Deposit.objects.filter(song_id=song)
    return not song_deposits.exists()


def is_first_song_deposit(song, box):
    song_deposits = Deposit.objects.filter(song_id=song, box_id=box)
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
        if name is not None:
            box = Box.objects.filter(url=name)
            if box.exists() :
                data = BoxSerializer(box[0]).data  # Gets in json the data from the database corresponding to the Box
                deposit_count = Deposit.objects.filter(box_id=data.get('id')).count()
                # Get all deposits of the box
                #box_deposits = Deposit.objects.filter(box_id=data.get('id')).order_by('-deposited_at')
                # Get the names of the songs corresponding to the deposits
                #songs = Song.objects.filter(id__in=box_deposits.values('song_id')).order_by('-id')
                # Serialize the objects
                #songs = SongSerializer(songs, many=True).data
                #box_deposits = DepositSerializer(box_deposits, many=True).data

                resp = {}
                #resp['last_deposits'] = box_deposits
                #resp['last_deposits_songs'] = songs
                resp['deposit_count'] = deposit_count
                resp['box'] = data
                return Response(resp, status=status.HTTP_200_OK)
            else:
                return Response({'Bad Request': 'Invalid Box Name'}, status=status.HTTP_404_NOT_FOUND)
        else:
            return Response({'Bad Request': 'Name of the box not found in request'}, status=status.HTTP_400_BAD_REQUEST)

    def post(self, request, format=None):
        """
        Crée un nouveau dépôt (Deposit) puis renvoie:
        - successes : la liste des succès débloqués (en tableau)
        - deposits  : les 10 avant-derniers dépôts DE LA MÊME BOX (donc sans le dépôt qu'on vient de créer),
                      chacun avec date du dépôt, song et user liés.

        Format JSON:
        {
          "successes": [ {...}, {...} ],
          "deposits": [
            {
              "deposit_date": "2025-08-18T01:23:45+02:00",
              "song": {
                "title": "...",
                "artist": "...",
                "url": "...",
                "platform_id": "...",
                "img_url": "..."
              },
              "user": {
                "id": "...",
                "name": "...",
                "profile_pic_url": "..."
              }
            },
            ...
          ]
        }
        """
        # Récupération des données d'entrée (avec valeurs par défaut prudentes)
        option = request.data.get('option') or {}
        song_id = option.get('id')

        song_name = option.get('name')
        song_author = option.get('artist')
        song_platform_id = option.get('platform_id')
        box_name = request.data.get('boxName')

        # 1) Charger la Box ciblée
        #    NB: .get() lève DoesNotExist si introuvable -> comportement actuel conservé
        box = Box.objects.filter(url=box_name).get()

        # 2) Capturer les 10 dépôts PRÉCÉDENTS de la box AVANT de créer le nouveau
        #    => évite d'avoir à exclure le dépôt qu'on va créer.
        #    On optimise avec select_related sur les FK 'song_id' et 'user' pour éviter le N+1.
        #    On trie par date décroissante et on ajoute '-id' comme "tie-breaker" si deux timestamps sont identiques.
        previous_deposits_qs = (
            Deposit.objects
            .filter(box_id=box)
            .select_related('song_id', 'user')
            .order_by('-deposited_at', '-id')[:10]
        )

        # 3) (Ré)utiliser la chanson si elle existe déjà, sinon la créer
        try:
            song = Song.objects.filter(title=song_name, artist=song_author).get()
            song.n_deposits = (song.n_deposits or 0) + 1
            song.save()
        except Song.DoesNotExist:
            song = Song(
                song_id=song_id,
                title=song_name,
                artist=song_author,
                url=option.get('url'),
                image_url=option.get('image_url'),
                duration=option.get('duration'),
                platform_id=song_platform_id,
                n_deposits=1
            )
            song.save()

        # 4) Créer le NOUVEAU dépôt
        user = request.user if not isinstance(request.user, AnonymousUser) else None
        new_deposit = Deposit(song_id=song, box_id=box, user=user)

        # 5) Calcul des succès / points (logique conservée)
        successes: dict = {}
        points_to_add = NB_POINTS_ADD_SONG  # points de base

        successes['default_deposit'] = {
            'name': "Pépite",
            'desc': "Tu as partagé une chanson",
            'points': NB_POINTS_ADD_SONG
        }

        # Premier dépôt de cet utilisateur dans cette box ?
        if is_first_user_deposit(user, box):
            points_to_add += NB_POINTS_FIRST_DEPOSIT_USER_ON_BOX
            successes['first_user_deposit_box'] = {
                'name': "Conquérant",
                'desc': "Tu n'as jamais déposé ici",
                'points': NB_POINTS_FIRST_DEPOSIT_USER_ON_BOX
            }

        # Première fois que CE son est déposé dans CETTE box ?
        if is_first_song_deposit(song, box):
            points_to_add += NB_POINTS_FIRST_SONG_DEPOSIT_BOX
            successes['first_song_deposit'] = {
                'name': "Far West",
                'desc': "Ce son n'a jamais été déposé ici",
                'points': NB_POINTS_FIRST_SONG_DEPOSIT_BOX
            }
            # Première fois sur tout le réseau ?
            if is_first_song_deposit_global(song):
                points_to_add += NB_POINTS_FIRST_SONG_DEPOSIT_GLOBAL
                successes['first_song_deposit_global'] = {
                    'name': "Far West",
                    'desc': "Ce son n'a jamais été déposé sur notre réseau",
                    'points': NB_POINTS_FIRST_SONG_DEPOSIT_GLOBAL
                }

        # Jours consécutifs ?
        nb_consecutive_days: int = get_consecutive_deposit_days(user, box)
        if nb_consecutive_days:
            consecutive_days_points = nb_consecutive_days * NB_POINTS_CONSECUTIVE_DAYS_BOX
            points_to_add += consecutive_days_points
            nb_consecutive_days += 1  # +1 pour l'affichage (ex: 3 jours si 2*points)
            successes['consecutive_days'] = {
                'name': "L'amour fou",
                'desc': f"{nb_consecutive_days} jours consécutifs avec cette boite",
                'points': consecutive_days_points
            }

        # 🔽 Ajoute un résumé du total de points dans la liste des succès
        successes['points_total'] = {
            'points': points_to_add,   # <= le total calculé
        }
        
        # 6) Appel "add-points" (on ignore les erreurs réseau pour ne pas casser la création)
        cookies = request.COOKIES
        csrf_token = get_token(request)
        add_points_url = request.build_absolute_uri(reverse('add-points'))
        headers = {"Content-Type": "application/json", "X-CSRFToken": csrf_token}
        try:
            requests.post(
                add_points_url, cookies=cookies, headers=headers,
                data=json.dumps({"points": points_to_add}), timeout=3
            )
        except Exception:
            pass

        # 7) Sauvegarder le nouveau dépôt (après calcul des succès/points)
        new_deposit.save()

        # 8) Construire le payload "deposits" demandé à partir des 10 dépôts précédents
        deposits_payload = []
        for d in previous_deposits_qs:
            s = d.song_id  # FK vers Song
            u = d.user     # FK vers User (peut être None)

            song_payload = {
                "title": getattr(s, "title", None),
                "artist": getattr(s, "artist", None),
                "url": getattr(s, "url", None),
                "platform_id": getattr(s, "platform_id", None),
                # On expose "img_url" côté API, mappée depuis le champ modèle "image_url"
                "img_url": getattr(s, "image_url", None),
            }

                    # User : si None/Anonymous, on renvoie null ; sinon on inclut aussi l'ID
            if u and not isinstance(u, AnonymousUser):
                full_name = u.get_full_name() if hasattr(u, "get_full_name") else ""
                display_name = full_name or getattr(u, "name", None) or getattr(u, "username", None)
                profile_pic = (
                    getattr(u, "profile_pic_url", None)
                    or getattr(u, "avatar_url", None)
                    or getattr(getattr(u, "profile", None), "picture_url", None)
                )
                user_payload = {
                    "id": getattr(u, "id", None),              # 👈 ajoute l'ID utilisateur
                    "name": display_name,
                    "profile_pic_url": profile_pic
                }
            else:
                user_payload = None  # pas d'utilisateur attaché au dépôt


            deposits_payload.append({
                # Date ISO 8601 (avec timezone) pour faciliter le parsing côté front
                "deposit_date": (d.deposited_at.isoformat() if getattr(d, "deposited_at", None) else None),
                "song": song_payload,
                "user": user_payload,
            })

        # 9) Réponse finale : successes en LISTE (pas dict) + les 10 dépôts précédents
        response = {
            "successes": list(successes.values()),
            "deposits": deposits_payload,
        }
        return Response(response, status=status.HTTP_200_OK)


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
            song_id = request.data.get('visible_deposit').get('id')
            # Get the song linked to the id
            song_id = Song.objects.filter(id=song_id).get()
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
            discovered_deposits = DiscoveredSong.objects.filter(user_id=user).order_by('-deposit_id__deposited_at')
            discovered_songs = []
            # Get the songs from the discovered deposits
            for deposit in discovered_deposits:
                deposit_id = deposit.deposit_id
                song = Song.objects.filter(deposit=deposit_id).get()
                discovered_songs.append(song)

        # Serialize the discovered songs
        serializer = SongSerializer(discovered_songs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


















