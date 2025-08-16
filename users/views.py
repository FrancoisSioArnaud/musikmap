from django.shortcuts import get_object_or_404
from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.contrib.auth.models import AnonymousUser
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.contrib import messages
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from .forms import RegisterUserForm
from social_django.models import UserSocialAuth
from .serializer import CustomUserSerializer, SongSerializer
from .models import CustomUser, FavoriteSongDiscovery
from box_management.models import Deposit, Song
from utils import NB_POINTS_FAVORITE_SONG_DISCOVERY

class LoginUser(APIView):
    '''
    Class goal:
    This class represents an API view for logging an user in.

    Methods:
    def post(self, request, format=None):
        Checks credentials and if match found, connect the user.

    Doc used : https://docs.djangoproject.com/en/4.2/topics/auth/default/
    '''

    def post(self, request, format=None):
        username = request.data.get('username')
        password = request.data.get('password')
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            # Return the authentication status in the response
            is_authenticated = True
            return Response({'status': is_authenticated},
                            status=status.HTTP_200_OK)
        else:
            is_authenticated = False
            return Response({'status': is_authenticated},
                            status=status.HTTP_401_UNAUTHORIZED)


class LogoutUser(APIView):
    '''
    Class goal:
    This class represents an API view for logging an user out.

    Methods:
    def get(self, request, format=None):
        Checks if user is logged in, if so logs him out.

    Doc used : https://docs.djangoproject.com/en/4.2/topics/auth/default/
    '''

    def get(self, request, format=None):
        if request.user.is_authenticated:  # if user is connected
            logout(request)
            is_logged_out = True
            return Response({'status': is_logged_out},
                            status=status.HTTP_200_OK)
        else:
            is_logged_out = False
            return Response({'status': is_logged_out},
                            status=status.HTTP_401_UNAUTHORIZED)


class RegisterUser(APIView):
    '''
    Class goal:
    This class represents an API view for registering an user.

    Methods:
    def post(self, request, format=None):
        Registers an user.

    Doc used : https://docs.djangoproject.com/en/4.2/topics/auth/default/
    '''

    def post(self, request, format=None):

        form = RegisterUserForm(request.data, request.FILES)
        if form.is_valid():
            user = form.save(commit=False)
            user.set_password(form.cleaned_data['password1'])

            # Handle profile picture
            if 'profile_picture' in request.FILES:
                user.profile_picture = request.FILES['profile_picture']

            user.save()
            username = form.cleaned_data['username']
            password = form.cleaned_data['password1']  # Because 2 pwd fields when you register

            # When someone creates an account, it logs them in at the same time
            user = authenticate(username=username, password=password)
            login(request, user)
            messages.success(request, ("Inscription réussie!"))
            return Response({'status': True},
                            status=status.HTTP_200_OK)
        else:
            errors = form.errors
            return Response({'errors': errors}, status=status.HTTP_400_BAD_REQUEST)


class ChangePasswordUser(APIView):
    '''
    Class goal:
    While logged in, change your password by typing your old one first.
    '''

    def post(self, request, format=None):

        if not request.user.is_authenticated:
            return Response({'errors': ['Utilisateur non connecté.']}, status=status.HTTP_401_UNAUTHORIZED)

        user = request.user
        new_password1 = request.data.get('new_password1')
        new_password2 = request.data.get('new_password2')

        if new_password1 != new_password2:
            return Response({'errors': ['Les mots de passe ne correspondent pas.']}, status=status.HTTP_401_UNAUTHORIZED)

        old_password = request.data.get('old_password')

        # Check if the provided old password is correct
        if user.check_password(old_password):
            # Validate the new password against the password policy
            try:
                validate_password(new_password1, user=user)
            except ValidationError as e:
                error_messages = list(e.messages)
                print(error_messages)
                return Response({'errors': error_messages}, status=status.HTTP_401_UNAUTHORIZED)
            # Set the new password and save the user
            user.set_password(new_password1)
            user.save()

            # Update the user's authentication session with the new password
            update_session_auth_hash(request, user)

            # Return success response
            return Response({'status': 'Le mot de passe a été modifié avec succès.'}, status=status.HTTP_200_OK)
        else:
            # Return error response if the old password is incorrect
            return Response({'errors': ['Ancien mot de passe invalide.']}, status=status.HTTP_401_UNAUTHORIZED)


class ChangeProfilePicture(APIView):
    '''
    Class goal :
    While logged in, change your profile picture (will erase the old one from the DB)
    '''
    def post(self, request, format=None):
        # Guard clause that checks if user is logged in
        if not request.user.is_authenticated:
            return Response({'errors': 'Utilisateur non connecté.'}, status=status.HTTP_401_UNAUTHORIZED)

        # Get connected user
        user = request.user

        # Guard clause that checks if the profile_picture field exists in the request.FILES
        if 'profile_picture' not in request.FILES:
            return Response({'errors': 'Aucune image de profil n\'a été fournie.'}, status=status.HTTP_400_BAD_REQUEST)

        # Get the new profile picture from the request.FILES
        new_profile_picture = request.FILES['profile_picture']

        try:
            # Update the user's profile picture
            user.profile_picture = new_profile_picture
            user.save()

            return Response({'status': 'L\'image de profil a été modifiée avec succès.'}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'errors': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ChangePreferredPlatform(APIView):
    '''
    Class goal : In your profile section, select your preferred platform (eg. Deezer or Spotify)
    '''
    def post(self, request, format=None):
        # Guard clause that checks if user is logged in
        if not request.user.is_authenticated:
            return Response({'errors': 'Utilisateur non connecté.'}, status=status.HTTP_401_UNAUTHORIZED)

        # Get connected user
        user = request.user

        # Get the preferred platform from the request data
        preferred_platform = request.data.get('preferred_platform')

        # Validate the preferred platform value
        if preferred_platform not in ['spotify', 'deezer']:
            return Response({'errors': 'Plateforme préférée invalide.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Update the user's preferred platform
            user.preferred_platform = preferred_platform
            user.save()

            return Response({'status': 'La plateforme préférée a été modifiée avec succès.'}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'errors': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class CheckAuthentication(APIView):
    '''
    Class goal : check if the user is authenticated
    '''
    def get(self, request, format=None):
        # Check if the user is authenticated
        if request.user.is_authenticated:
            user = request.user
            serializer = CustomUserSerializer(user)  # Serialize the user object
            response = serializer.data  # Get serialized data
            return Response(response, status=status.HTTP_200_OK)
        else:
            # Return an empty dictionary with an unauthorized status code if the user is not authenticated
            return Response({}, status=status.HTTP_401_UNAUTHORIZED)

class AddUserPoints(APIView):
    '''
    Class goal : add (or delete) points to the user connected
    '''
    def post(self, request, format=None):
        # Guard clause that checks if user is logged in
        if not request.user.is_authenticated:
            return Response({'errors': 'Utilisateur non connecté.'}, status=status.HTTP_401_UNAUTHORIZED)

        user = request.user
        points = request.data.get('points')

        if not points:
            return Response({'errors': 'Veuillez fournir un nombre de points valide.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            points = int(points)
            user.points += points
            user.save()

            return Response({'status': 'Points mis à jour avec succès.'}, status=status.HTTP_200_OK)
        except ValueError:
            return Response({'errors': 'Veuillez fournir un nombre de points valide.'}, status=status.HTTP_400_BAD_REQUEST)


class GetUserPoints(APIView):
    '''
    Class goal : retrieve number of points of the user connected
    '''
    def get(self, request, format=None):
        # Guard clause that checks if user is logged in
        if not request.user.is_authenticated:
            return Response({'errors': 'Utilisateur non connecté.'}, status=status.HTTP_401_UNAUTHORIZED)

        user = request.user
        points = user.points

        return Response({'points': points}, status=status.HTTP_200_OK)


class GetUserInfo(APIView):
    '''
    Class goal : get users info
    '''
    lookup_url_kwarg = 'userID'
    serializer_class = CustomUserSerializer

    def get(self, request, format=None):
        user_id = request.GET.get(self.lookup_url_kwarg)
        if user_id is not None and user_id != 'null':
            user = get_object_or_404(CustomUser, id=user_id)
            serializer = CustomUserSerializer(user)
            total_deposits = Deposit.objects.filter(user=user).count()
            response = {}
            response = serializer.data
            response['total_deposits'] = total_deposits
            response['has_favorite_song'] = user.favorite_song is not None

            if response['has_favorite_song']:
                current_user = request.user
                if current_user.is_authenticated:
                    is_discovered = current_user.has_discovered_user_favsong(user)
                    response['is_discovered'] = is_discovered
                    if is_discovered or current_user.id == user.id:
                        response['favorite_song'] = SongSerializer(user.favorite_song).data
                    else:
                        response['favorite_song'] = None
                else:
                    response['is_discovered'] = False
                    response['favorite_song'] = None

            return Response(response, status=status.HTTP_200_OK)
        else:
            return Response({'Bad Request': 'User ID not found in request'}, status=status.HTTP_400_BAD_REQUEST)

class SetFavoriteSong(APIView):
    def post(self, request, format=None):
        user = request.user if not isinstance(request.user, AnonymousUser) else None
        if not user:
            return Response({"error": "User not authenticated"}, status=status.HTTP_401_UNAUTHORIZED)

        search_song = request.data.get('option')
        if not search_song:
            return Response({"error": "No song provided"}, status=status.HTTP_400_BAD_REQUEST)

        song_name = search_song.get('name')
        song_author = search_song.get('artist')
        song_platform_id = search_song.get('platform_id')

        try:
            song = Song.objects.get(title=song_name, artist=song_author)
        except Song.DoesNotExist:
            song_url = search_song.get('url')
            song_image = search_song.get('image_url')
            song_duration = search_song.get('duration')

            song = Song(
                title=song_name,
                artist=song_author,
                url=song_url,
                image_url=song_image,
                duration=song_duration,
                platform_id=song_platform_id
            )
            song.save()

        user.favorite_song = song
        user.save()

        response = {
            'user': CustomUserSerializer(user).data,
        }
        return Response(response, status=status.HTTP_200_OK)

class DiscoverFavoriteSong(APIView):
    # permission_classes = [IsAuthenticated]

    def post(self, request, format=None):
        current_user = request.user
        user_id = request.data.get('user_id')
        target_user = get_object_or_404(CustomUser, id=user_id)

        # Check if user has enough points
        if current_user.points < 10:  # Assuming it costs 10 points to discover a favorite song
            return Response({"error": "Not enough points"}, status=status.HTTP_400_BAD_REQUEST)

        # Check if the favorite song has already been discovered by this user
        if current_user.has_discovered_user_favsong(target_user):
            return Response({"error": "Favorite song already discovered"}, status=status.HTTP_400_BAD_REQUEST)

        # Deduct points from the current user
        current_user.points += NB_POINTS_FAVORITE_SONG_DISCOVERY
        current_user.save()

        # Create a new discovery record
        FavoriteSongDiscovery.objects.create(
            discovered_by=current_user,
            discovered_user=target_user,
            discovered_song=target_user.favorite_song
        )

        # Serialize the favorite song data
        favorite_song_data = SongSerializer(target_user.favorite_song).data

        return Response({
            "status": "Favorite song discovered",
            "favorite_song": favorite_song_data
        }, status=status.HTTP_200_OK)
