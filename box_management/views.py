# stdlib
import json
import requests
from datetime import date, timedelta

# Django
from django.contrib.auth.models import AnonymousUser
from django.middleware.csrf import get_token
from django.urls import reverse
from django.utils.timezone import localtime, now
from django.contrib.humanize.templatetags.humanize import naturaltime

# DRF
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

# Projet
from .models import Box, Deposit, Song, LocationPoint, DiscoveredSong
from .serializers import BoxSerializer, SongSerializer
from .util import calculate_distance
from utils import (
    NB_POINTS_ADD_SONG,
    NB_POINTS_FIRST_DEPOSIT_USER_ON_BOX,
    NB_POINTS_FIRST_SONG_DEPOSIT_BOX,
    NB_POINTS_FIRST_SONG_DEPOSIT_GLOBAL,
    NB_POINTS_CONSECUTIVE_DAYS_BOX,
)


# -----------------------
# Helpers "business"
# -----------------------

def is_first_user_deposit(user, box) -> bool:
    deposits = Deposit.objects.filter(user=user, box_id=box)
    return not deposits.exists()


def is_first_song_deposit_global_by_title_artist(title: str, artist: str) -> bool:
    """Aucun dépôt global pour (title, artist) ?"""
    return not Deposit.objects.filter(song_id__title=title, song_id__artist=artist).exists()


def is_first_song_deposit_in_box_by_title_artist(title: str, artist: str, box) -> bool:
    """Aucun dépôt de cette box pour (title, artist) ?"""
    return not Deposit.objects.filter(
        box_id=box, song_id__title=title, song_id__artist=artist
    ).exists()


def get_consecutive_deposit_days(user, box) -> int:
    """Nombre de jours consécutifs (en remontant à partir de hier) avec ≥1 dépôt dans la box."""
    deposits = Deposit.objects.filter(user=user, box_id=box).order_by('-deposited_at')
    current_date = date.today()
    previous_date = current_date - timedelta(days=1)

    consecutive_days = 0
    for deposit in deposits:
        if deposit.deposited_at.date() == previous_date:
            consecutive_days += 1
            previous_date -= timedelta(days=1)
    return consecutive_days


# -----------------------
# Vues
# -----------------------

class GetBox(APIView):
    lookup_url_kwarg = 'name'
    serializer_class = BoxSerializer

    def get(self, request, format=None):
        """
        Infos sur une box + compteur de dépôts.
        """
        name = request.GET.get(self.lookup_url_kwarg)
        if name is None:
            return Response({'Bad Request': 'Name of the box not found in request'}, status=status.HTTP_400_BAD_REQUEST)

        box_qs = Box.objects.filter(url=name)
        if not box_qs.exists():
            return Response({'Bad Request': 'Invalid Box Name'}, status=status.HTTP_404_NOT_FOUND)

        box = box_qs[0]
        data = BoxSerializer(box).data
        deposit_count = Deposit.objects.filter(box_id=box.id).count()

        resp = {
            'deposit_count': deposit_count,
            'box': data,
        }
        return Response(resp, status=status.HTTP_200_OK)

    def post(self, request, format=None):
        """
        Crée le Song (ou le met à jour), crée le Deposit (synchrone), puis renvoie :
        - successes : liste des succès
        - deposits  : 10 dépôts précédents (sans le nouveau)
            * le plus récent (idx=0) : TOUTES LES INFOS (et on renvoie spotify_url / deezer_url)
            * les 9 suivants : format allégé (img_url, id, cost)
        """
        # --- Entrée ---
        option = request.data.get('option') or {}
        song_id = option.get('id')
        song_name = option.get('name')
        song_author = option.get('artist')
        song_platform_id = option.get('platform_id')  # 1 = Spotify, 2 = Deezer
        box_name = request.data.get('boxName')

        # 1) Box
        box = Box.objects.filter(url=box_name).get()

        # 2) User courant
        user = request.user if not isinstance(request.user, AnonymousUser) else None

        # 3) Succès AVANT l'écriture
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

        if is_first_song_deposit_in_box_by_title_artist(song_name, song_author, box):
            points_to_add += NB_POINTS_FIRST_SONG_DEPOSIT_BOX
            successes['first_song_deposit'] = {
                'name': "Far West",
                'desc': "Ce son n'a jamais été déposé ici",
                'points': NB_POINTS_FIRST_SONG_DEPOSIT_BOX
            }
            if is_first_song_deposit_global_by_title_artist(song_name, song_author):
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

        # 4) Upsert Song (clé = title + artist) + URL selon platform_id (sans toucher l’autre champ, et sans remplir url)
        try:
            song = Song.objects.get(
                title__iexact=song_name,
                artist__iexact=song_author,
            )  # case-insensitive
            song.n_deposits = (song.n_deposits or 0) + 1
        except Song.DoesNotExist:
            song = Song(
                song_id=song_id,
                title=song_name,
                artist=song_author,
                image_url=option.get('image_url') or "",
                duration=option.get('duration') or 0,
                platform_id=song_platform_id or 1,
                # url laissé tel quel (déprécié)
            )

        # Remplir UNIQUEMENT le champ correspondant à platform_id
        incoming_url = option.get('url')
        if song_platform_id == 1:           # Spotify
            if incoming_url:
                song.spotify_url = incoming_url
        elif song_platform_id == 2:         # Deezer
            if incoming_url:
                song.deezer_url = incoming_url

        song.save()

        # 5) Créer le nouveau dépôt maintenant (synchrone)
        new_deposit = Deposit.objects.create(song_id=song, box_id=box, user=user)

        # 6) Créditer les points (best-effort)
        try:
            csrf_token = get_token(request)
            add_points_url = request.build_absolute_uri(reverse('add-points'))
            headers_bg = {"Content-Type": "application/json", "X-CSRFToken": csrf_token}
            requests.post(
                add_points_url,
                cookies=request.COOKIES,
                headers=headers_bg,
                data=json.dumps({"points": points_to_add}),
                timeout=3
            )
        except Exception:
            pass

        # 7) Récupérer les 10 dépôts PRÉCÉDENTS (sans le nouveau)
        previous_deposits = list(
            Deposit.objects
            .filter(box_id=box)
            .exclude(pk=new_deposit.pk)
            .select_related('song_id', 'user')
            .order_by('-deposited_at', '-id')[:10]
        )

        # 8) Construire la réponse (top 10 : 1 complet + 9 allégés)
        cost_series = [500 - 50 * i for i in range(9)]  # 500 → 100
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
                user_payload = {
                    "id": getattr(u, "id", None),
                    "name": display_name,
                    "profile_pic_url": profile_pic
                }
            else:
                user_payload = None

            if idx == 0:
                # Premier "previous" : toutes les infos + spotify_url / deezer_url
                song_payload = {
                    "title": getattr(s, "title", None),
                    "artist": getattr(s, "artist", None),
                    "url": getattr(s, "url", None),  # restera vide si non utilisé
                    "spotify_url": getattr(s, "spotify_url", None),
                    "deezer_url": getattr(s, "deezer_url", None),
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
    Vérifie si l'utilisateur est bien dans la zone d'une box (géolocalisation).
    """

    def post(self, request):
        latitude = float(request.data.get('latitude'))
        longitude = float(request.data.get('longitude'))
        box = request.data.get('box')
        box = Box.objects.filter(id=box.get('id')).get()

        points = LocationPoint.objects.filter(box_id=box)
        if not points.exists():
            return Response({'error': 'No location points for this box'}, status=status.HTTP_404_NOT_FOUND)

        is_valid_location = False
        for point in points:
            max_dist = point.dist_location
            target_latitude = point.latitude
            target_longitude = point.longitude
            distance = calculate_distance(latitude, longitude, target_latitude, target_longitude)
            if distance <= max_dist:
                is_valid_location = True
                break

        if is_valid_location:
            return Response({'valid': True}, status=status.HTTP_200_OK)
        else:
            return Response({'valid': False, 'lat': latitude, 'long': longitude}, status=status.HTTP_403_FORBIDDEN)


class CurrentBoxManagement(APIView):
    """
    Get/Set du nom de box courant en session.
    """

    def get(self, request, format=None):
        try:
            current_box_name = request.session['current_box_name']
            return Response({'current_box_name': current_box_name}, status=status.HTTP_200_OK)
        except KeyError:
            return Response({'error': "La clé current_box_name n'existe pas"}, status=status.HTTP_400_BAD_REQUEST)

    def post(self, request, format=None):
        if 'current_box_name' not in request.data:
            return Response({'errors': "Aucun nom de boîte n'a été fournie."}, status=status.HTTP_401_UNAUTHORIZED)

        current_box_name = request.data.get('current_box_name')
        try:
            request.session['current_box_name'] = current_box_name
            request.session.modified = True
            return Response({'status': 'Le nom de la boîte actuelle a été modifié avec succès.'},
                            status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'errors': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ManageDiscoveredSongs(APIView):
    """
    Mettre à jour et récupérer les chansons "découvertes" d'un utilisateur.
    """

    def post(self, request):
        user = request.user
        if not user.is_authenticated:
            return Response(
                {'error': 'Vous devez être connecté pour effectuer cette action.'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        song_id = request.data.get('visible_deposit', {}).get('id')
        if not song_id:
            return Response({'error': "Identifiant de chanson manquant."},
                            status=status.HTTP_400_BAD_REQUEST)

        try:
            song_obj = Song.objects.get(id=song_id)
        except Song.DoesNotExist:
            return Response({'error': 'Chanson introuvable.'},
                            status=status.HTTP_404_NOT_FOUND)

        # Déjà découverte par cet utilisateur (même titre/artiste) ?
        if DiscoveredSong.objects.filter(
            user_id=user,
            deposit_id__song_id__artist=song_obj.artist,
            deposit_id__song_id__title=song_obj.title
        ).exists():
            return Response({'error': 'Cette chanson est déjà liée à un autre dépôt.'},
                            status=status.HTTP_400_BAD_REQUEST)

        deposit = Deposit.objects.filter(song_id=song_obj).order_by('-deposited_at').first()
        if not deposit:
            return Response({'error': "Aucun dépôt trouvé pour cette chanson."},
                            status=status.HTTP_404_NOT_FOUND)

        # Enregistre la découverte avec l'heure locale
        DiscoveredSong(
            user_id=user,
            deposit_id=deposit,
            discovered_at=localtime(now())
        ).save()

        return Response({'success': True}, status=status.HTTP_200_OK)

    def get(self, request):
        user = request.user
        if not user.is_authenticated:
            return Response(
                {'error': 'Vous devez être connecté pour effectuer cette action.'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        discovered_deposits = DiscoveredSong.objects.filter(user_id=user) \
            .order_by('-deposit_id__deposited_at')
        discovered_songs = [
            Song.objects.filter(deposit=dep.deposit_id).get()
            for dep in discovered_deposits
        ]
        serializer = SongSerializer(discovered_songs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class RevealSong(APIView):
    """
    GET /box-management/revealSong?cost=...&song_id=...
    Renvoie les infos minimales d'un Song :
      { song: { title, artist, spotify_url, deezer_url } }
    """
    def get(self, request, format=None):
        cost = request.GET.get("cost")  # TODO: débiter des points si besoin
        song_id = request.GET.get("song_id")

        if not song_id:
            return Response({"detail": "song_id manquant"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            song = Song.objects.get(pk=song_id)
        except Song.DoesNotExist:
            return Response({"detail": "Song introuvable"}, status=status.HTTP_404_NOT_FOUND)

        data = {
            "song": {
                "title": song.title,
                "artist": song.artist,
                "spotify_url": song.spotify_url,  # peut être None
                "deezer_url": song.deezer_url,    # peut être None
            }
        }
        return Response(data, status=status.HTTP_200_OK)

