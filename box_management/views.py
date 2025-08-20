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
from django.utils.timezone import localtime
from django.contrib.humanize.templatetags.humanize import naturaltime
import json
import requests
import threading






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


def _bg_save_song_and_deposit(song_data: dict, box_id: int, user_id: int | None,
                              aggreg_url: str, cookies: dict, headers: dict) -> None:
    """
    Tâche de fond :
      - upsert du Song (et maj spotify_url/deezer_url)
      - appel à /api_agg/aggreg pour récupérer l'URL de l'autre plateforme
      - création du Deposit
    On isole les imports locaux pour éviter les cycles à l'import.
    """
    from box_management.models import Song, Deposit, Box

    # Récupérer Box + User (si possible)
    try:
        box = Box.objects.get(pk=box_id)
    except Box.DoesNotExist:
        return
    user = None
    if user_id:
        User = get_user_model()
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            user = None

    # Upsert Song: (title, artist) comme clé de dédup basique
    try:
        song = Song.objects.get(title=song_data["title"], artist=song_data["artist"])
        song.n_deposits = (song.n_deposits or 0) + 1
    except Song.DoesNotExist:
        song = Song(
            song_id     = song_data.get("song_id"),
            title       = song_data["title"],
            artist      = song_data["artist"],
            url         = song_data.get("url"),
            image_url   = song_data.get("image_url"),
            duration    = song_data.get("duration"),
            platform_id = song_data.get("platform_id"),
            n_deposits  = 1,
        )

    # Enregistrer l'URL de la plateforme courante
    if song_data.get("platform_id") == 1:
        song.spotify_url = song_data.get("url")
    elif song_data.get("platform_id") == 2:
        song.deezer_url = song_data.get("url")

    # Demander l'AUTRE plateforme à /api_agg/aggreg
    other_platform = "deezer" if song_data.get("platform_id") == 1 else "spotify"
    payload = {
        "song": {
            "title":    song_data["title"],
            "artist":   song_data["artist"],
            "duration": song_data.get("duration"),
        },
        "platform": other_platform,
    }
    try:
        r = requests.post(aggreg_url, cookies=cookies, headers=headers,
                          data=json.dumps(payload), timeout=6)
        if r.ok:
            # L'API renvoie une "JSON string" (ex: "spotify://track/xxx")
            other_url = r.json()
            if isinstance(other_url, str):
                if other_platform == "deezer":
                    song.deezer_url = other_url
                else:
                    song.spotify_url = other_url
    except Exception:
        # On ignore en silence pour ne pas planter le thread
        pass

    # Sauvegarde Song puis création du Deposit
    try:
        song.save()
        Deposit.objects.create(song_id=song, box_id=box, user=user)
    except Exception:
        pass


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
        # --- Entrée ---
        option = request.data.get('option') or {}
        song_id = option.get('id')
        song_name = option.get('name')
        song_author = option.get('artist')
        song_platform_id = option.get('platform_id')
        box_name = request.data.get('boxName')
    
        # 1) Box
        box = Box.objects.filter(url=box_name).get()
    
        # 2) User courant
        user = request.user if not isinstance(request.user, AnonymousUser) else None
        user_id = getattr(user, "id", None)
    
        # 3) Succès AVANT l'écriture (vue synchro et rapide)
        successes: dict = {}
        points_to_add = NB_POINTS_ADD_SONG
    
        successes['default_deposit'] = {
            'name': "Pépite",
            'desc': "Tu as partagé une chanson",
            'points': NB_POINTS_ADD_SONG
        }
    
        if is_first_user_deposit(user, box):
            points_to_add += NB_POINTS_FIRST_DEPOSIT_USER_ON_BOX
            successes['first_user_deposit_box'] = {
                'name': "Conquérant",
                'desc': "Tu n'as jamais déposé ici",
                'points': NB_POINTS_FIRST_DEPOSIT_USER_ON_BOX
            }
    
        # NB: le "first_song_deposit" est évalué ici avec l'état actuel de la DB (sans le nouveau)
        # Il sera sauvegardé plus tard en tâche de fond.
        # Pour la dédup Song on se base sur (title, artist)
        try:
            _existing_song = Song.objects.get(title=song_name, artist=song_author)
            # rien à faire ici pour le succès "Far West" si la chanson existe déjà dans la box
        except Song.DoesNotExist:
            # Si la chanson n'a jamais existé, on appliquera le succès box/global ici
            if is_first_song_deposit_global_temp := is_first_song_deposit_global(Song(title=song_name, artist=song_author)):
                # On ne peut pas tester proprement "dans la box" sans Song lié ; garde ta logique initiale si nécessaire.
                pass
    
        if is_first_song_deposit(Song(title=song_name, artist=song_author), box):
            points_to_add += NB_POINTS_FIRST_SONG_DEPOSIT_BOX
            successes['first_song_deposit'] = {
                'name': "Far West",
                'desc': "Ce son n'a jamais été déposé ici",
                'points': NB_POINTS_FIRST_SONG_DEPOSIT_BOX
            }
            if is_first_song_deposit_global(Song(title=song_name, artist=song_author)):
                points_to_add += NB_POINTS_FIRST_SONG_DEPOSIT_GLOBAL
                successes['first_song_deposit_global'] = {
                    'name': "Far West",
                    'desc': "Ce son n'a jamais été déposé sur notre réseau",
                    'points': NB_POINTS_FIRST_SONG_DEPOSIT_GLOBAL
                }
    
        nb_consecutive_days: int = get_consecutive_deposit_days(user, box)
        if nb_consecutive_days:
            consecutive_days_points = nb_consecutive_days * NB_POINTS_CONSECUTIVE_DAYS_BOX
            points_to_add += consecutive_days_points
            nb_consecutive_days += 1
            successes['consecutive_days'] = {
                'name': "L'amour fou",
                'desc': f"{nb_consecutive_days} jours consécutifs avec cette boite",
                'points': consecutive_days_points
            }
    
        successes['points_total'] = {
            'name': "Total",
            'desc': "Points gagnés pour ce dépôt",
            'points': points_to_add,
        }
    
        # 4) Lancer la TÂCHE DE FOND (song + autre plateforme + deposit)
        csrf_token = get_token(request)
        aggreg_url = request.build_absolute_uri("/api_agg/aggreg")  # ou reverse(...) si tu as nommé la route
        headers_bg = {"Content-Type": "application/json", "X-CSRFToken": csrf_token}
        song_data = {
            "song_id":     song_id,
            "title":       song_name,
            "artist":      song_author,
            "url":         option.get('url'),
            "image_url":   option.get('image_url'),
            "duration":    option.get('duration'),
            "platform_id": song_platform_id,
        }
        threading.Thread(
            target=_bg_save_song_and_deposit,
            args=(song_data, box.id, user_id, aggreg_url, request.COOKIES, headers_bg),
            daemon=True
        ).start()
    
        # 5) Appel add-points (best-effort) — on peut le faire ici pour retour rapide
        try:
            add_points_url = request.build_absolute_uri(reverse('add-points'))
            requests.post(add_points_url, cookies=request.COOKIES, headers=headers_bg,
                          data=json.dumps({"points": points_to_add}), timeout=3)
        except Exception:
            pass
    
        # 6) Récupérer les 10 DÉPÔTS PRÉCÉDENTS (sans le nouveau, qui sera créé en tâche de fond)
        previous_deposits = list(
            Deposit.objects
            .filter(box_id=box)
            .select_related('song_id', 'user')
            .order_by('-deposited_at', '-id')[:10]
        )
    
        # 7) Construire la réponse (comme avant)
        cost_series = [500 - 50 * i for i in range(9)]
        deposits_payload = []
        for idx, d in enumerate(previous_deposits):
            s = d.song_id
            u = d.user
    
            if u and not isinstance(u, AnonymousUser):
                full_name = u.get_full_name() if hasattr(u, "get_full_name") else ""
                display_name = full_name or getattr(u, "name", None) or getattr(u, "username", None)
                profile_pic = (
                    getattr(u, "profile_pic_url", None)
                    or getattr(u, "avatar_url", None)
                    or getattr(getattr(u, "profile", None), "picture_url", None)
                )
                user_payload = {"id": getattr(u, "id", None),
                                "name": display_name,
                                "profile_pic_url": profile_pic}
            else:
                user_payload = None
    
            if idx == 0:
                song_payload = {
                    "title": getattr(s, "title", None),
                    "artist": getattr(s, "artist", None),
                    "url": getattr(s, "url", None),
                    "platform_id": getattr(s, "platform_id", None),
                    "img_url": getattr(s, "image_url", None),
                }
            else:
                cost_value = cost_series[idx - 1] if (idx - 1) < len(cost_series) else 100
                song_payload = {
                    "img_url": getattr(s, "image_url", None),
                    "id": getattr(s, "id", None),
                    "cost": cost_value,
                }
    
            deposits_payload.append({
                "deposit_date": (
                    naturaltime(localtime(d.deposited_at))
                    if getattr(d, "deposited_at", None) else None
                ),
                "song": song_payload,
                "user": user_payload,
            })
    
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

class RevealSong(APIView):
    """
    GET /box-management/revealSong?cost=...&song_id=...
    Renvoie les infos minimales d'un Song (title, artist, url, platform_id).
    """
    def get(self, request, format=None):
        cost = request.GET.get("cost")
        song_id = request.GET.get("song_id")

        if not song_id:
            return Response({"detail": "song_id manquant"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            song = Song.objects.get(pk=song_id)
        except Song.DoesNotExist:
            return Response({"detail": "Song introuvable"}, status=status.HTTP_404_NOT_FOUND)

        # TODO: utiliser 'cost' pour débiter des points à l'utilisateur si besoin
        data = {
            "song": {
                "title": song.title,
                "artist": song.artist,
                "url": song.url,
                "platform_id": song.platform_id,
            }
        }
        return Response(data, status=status.HTTP_200_OK)








