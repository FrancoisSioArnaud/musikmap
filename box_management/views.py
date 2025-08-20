# stdlib
import json
import threading
import requests
from datetime import date, timedelta
from typing import Optional

# Django
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.middleware.csrf import get_token
from django.urls import reverse
from django.utils.timezone import localtime
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
    """Aucun dépôt n'existe globalement pour (title, artist) ?"""
    return not Deposit.objects.filter(song_id__title=title, song_id__artist=artist).exists()


def is_first_song_deposit_in_box_by_title_artist(title: str, artist: str, box) -> bool:
    """Aucun dépôt n'existe dans cette box pour (title, artist) ?"""
    return not Deposit.objects.filter(
        box_id=box, song_id__title=title, song_id__artist=artist
    ).exists()


def get_consecutive_deposit_days(user, box) -> int:
    """Nombre de jours consécutifs (en remontant à partir de hier) avec au moins 1 dépôt dans la box."""
    deposits = Deposit.objects.filter(user=user, box_id=box).order_by('-deposited_at')
    current_date = date.today()
    previous_date = current_date - timedelta(days=1)

    consecutive_days = 0
    for deposit in deposits:
        if deposit.deposited_at.date() == previous_date:
            consecutive_days += 1
            previous_date -= timedelta(days=1)

    return consecutive_days


def _infer_platform_id_from_url(url: Optional[str]) -> Optional[int]:
    """Renvoie 1 (spotify) / 2 (deezer) / None en se basant sur l'URL."""
    if not url:
        return None
    u = url.lower()
    if "spotify" in u:
        return 1
    if "deezer" in u:
        return 2
    return None


def _infer_platform_id_from_song(song: Song) -> Optional[int]:
    """Infère un platform_id pour l'API front sans champ en BDD."""
    # Priorité : url "principale", sinon on se base sur spotify_url/deezer_url
    pid = _infer_platform_id_from_url(song.url)
    if pid:
        return pid
    if song.spotify_url:
        return 1
    if song.deezer_url:
        return 2
    return None


# -----------------------
# Tâche de fond
# -----------------------

def _bg_save_song_and_deposit(
    song_data: dict,
    box_id: int,
    user_id: Optional[int],
    aggreg_url: str,
    cookies: dict,
    headers: dict,
) -> None:
    """
    Tâche de fond :
      - upsert Song (sans platform_id)
      - renseigne spotify_url / deezer_url
      - appelle ./api_agg/aggreg pour récupérer l'URL de l'autre plateforme
      - crée le Deposit
    """
    from .models import Song, Deposit, Box  # import local pour éviter les cycles

    # Box + User
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

    # Upsert Song (clé simple : title + artist)
    title = song_data["title"]
    artist = song_data["artist"]
    try:
        song = Song.objects.get(title=title, artist=artist)
        song.n_deposits = (song.n_deposits or 0) + 1
    except Song.DoesNotExist:
        song = Song(
            song_id=song_data.get("song_id"),
            title=title,
            artist=artist,
            url=song_data.get("url"),
            image_url=song_data.get("image_url"),
            duration=song_data.get("duration"),
            n_deposits=1,
        )

    # Déterminer plateforme courante (transiente, NON sauvegardée)
    current_platform = song_data.get("current_platform")
    if not current_platform:
        current_platform = {1: "spotify", 2: "deezer"}.get(
            _infer_platform_id_from_url(song_data.get("url"))
        )

    # Renseigner l’URL de la plateforme courante
    if current_platform == "spotify":
        song.spotify_url = song_data.get("url")
    elif current_platform == "deezer":
        song.deezer_url = song_data.get("url")

    # Appeler l’AUTRE plateforme via /api_agg/aggreg
    other_platform = "deezer" if current_platform == "spotify" else "spotify"
    if current_platform in ("spotify", "deezer"):
        payload = {
            "song": {
                "title": title,
                "artist": artist,
                "duration": song_data.get("duration"),
            },
            "platform": other_platform,
        }
        try:
            r = requests.post(
                aggreg_url, cookies=cookies, headers=headers, data=json.dumps(payload), timeout=6
            )
            if r.ok:
                other_url = r.json()  # "spotify://track/..." ou "deezer://www.deezer.com/track/..."
                if isinstance(other_url, str):
                    if other_platform == "deezer":
                        song.deezer_url = other_url
                    else:
                        song.spotify_url = other_url
        except Exception:
            pass

    # Sauvegarde + création du dépôt
    try:
        song.save()
        Deposit.objects.create(song_id=song, box_id=box, user=user)
    except Exception:
        pass


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
        Crée un nouveau dépôt en tâche de fond et renvoie immédiatement :
        - successes : liste des succès
        - deposits  : 10 dépôts précédents (sans le nouveau)
            * le plus récent (idx=0) avec TOUTES LES INFOS
            * les 9 suivants : format allégé (img_url, id, cost)
        """
        # --- Entrée ---
        option = request.data.get('option') or {}
        song_id = option.get('id')
        song_name = option.get('name')
        song_author = option.get('artist')
        # peut encore être fourni par le front ; on ne le stocke plus en BDD
        song_platform_id = option.get('platform_id')
        box_name = request.data.get('boxName')

        # 1) Box
        box = Box.objects.filter(url=box_name).get()

        # 2) User courant
        user = request.user if not isinstance(request.user, AnonymousUser) else None
        user_id = getattr(user, "id", None)

        # 3) Succès AVANT l'écriture (rapide)
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

        # "First song" basé sur title/artist (pas sur un Song non sauvé)
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

        # Jours consécutifs
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

        # 4) Lancer la tâche de fond (song + autre plateforme + deposit)
        csrf_token = get_token(request)
        aggreg_url = request.build_absolute_uri("./api_agg/aggreg")
        headers_bg = {"Content-Type": "application/json", "X-CSRFToken": csrf_token}

        # déduire une plateforme courante transiente (pour enrichir spotify_url/deezer_url)
        current_platform = None
        if song_platform_id in (1, 2):
            current_platform = {1: "spotify", 2: "deezer"}[song_platform_id]
        elif option.get('url'):
            current_platform = {1: "spotify", 2: "deezer"}.get(
                _infer_platform_id_from_url(option.get('url'))
            )

        song_data = {
            "song_id":   song_id,
            "title":     song_name,
            "artist":    song_author,
            "url":       option.get('url'),
            "image_url": option.get('image_url'),
            "duration":  option.get('duration'),
            "current_platform": current_platform,  # transiente
        }

        threading.Thread(
            target=_bg_save_song_and_deposit,
            args=(song_data, box.id, user_id, aggreg_url, request.COOKIES, headers_bg),
            daemon=True
        ).start()

        # 5) Créditer les points (best-effort)
        try:
            add_points_url = request.build_absolute_uri(reverse('add-points'))
            requests.post(
                add_points_url,
                cookies=request.COOKIES,
                headers=headers_bg,
                data=json.dumps({"points": points_to_add}),
                timeout=3
            )
        except Exception:
            pass

        # 6) Récupérer les 10 dépôts précédents (sans le nouveau, qui sera créé en tâche de fond)
        previous_deposits = list(
            Deposit.objects
            .filter(box_id=box)
            .select_related('song_id', 'user')
            .order_by('-deposited_at', '-id')[:10]
        )

        # 7) Construire la réponse (top 10 : 1 complet + 9 allégés)
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
                song_payload = {
                    "title": getattr(s, "title", None),
                    "artist": getattr(s, "artist", None),
                    "url": getattr(s, "url", None),
                    "platform_id": _infer_platform_id_from_song(s),  # inféré (compat front)
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

        # Points de la box
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
            return Response({'error': 'Vous devez être connecté pour effectuer cette action.'},
                            status=status.HTTP_401_UNAUTHORIZED)

        song_id = request.data.get('visible_deposit').get('id')
        song_obj = Song.objects.filter(id=song_id).get()

        # Déjà découverte ?
        if DiscoveredSong.objects.filter(
            user_id=user,
            deposit_id__song_id__artist=song_obj.artist,
            deposit_id__song_id__title=song_obj.title
        ).exists():
            return Response({'error': 'Cette chanson est déjà liée à un autre dépôt.'},
                            status=status.HTTP_400_BAD_REQUEST)

        deposit = Deposit.objects.filter(song_id=song_obj).last()
        DiscoveredSong(user_id=user, deposit_id=deposit).save()
        return Response({'success': True}, status=status.HTTP_200_OK)

    def get(self, request):
        user = request.user
        if not user.is_authenticated:
            return Response({'error': 'Vous devez être connecté pour effectuer cette action.'},
                            status=status.HTTP_401_UNAUTHORIZED)

        discovered_deposits = DiscoveredSong.objects.filter(user_id=user).order_by('-deposit_id__deposited_at')
        discovered_songs = [Song.objects.filter(deposit=dep.deposit_id).get() for dep in discovered_deposits]
        serializer = SongSerializer(discovered_songs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class RevealSong(APIView):
    """
    GET /box-management/revealSong?cost=...&song_id=...
    Renvoie les infos minimales d'un Song (title, artist, url, platform_id inféré).
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

        # TODO: utiliser 'cost' pour débiter des points si besoin

        # URL principale à renvoyer (préférence pour song.url, sinon une des URLs connues)
        url_to_return = song.url or song.spotify_url or song.deezer_url
        data = {
            "song": {
                "title": song.title,
                "artist": song.artist,
                "url": url_to_return,
                "platform_id": _infer_platform_id_from_url(url_to_return),  # inféré (compat front)
            }
        }
        return Response(data, status=status.HTTP_200_OK)

