from django.shortcuts import get_object_or_404
from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.contrib import messages
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from .forms import RegisterUserForm
from social_django.models import UserSocialAuth
from .serializer import CustomUserSerializer
from .models import CustomUser
from box_management.models import Deposit


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
    """
    Changer sa photo de profil (auth requis).
    """
    def post(self, request, format=None):
        if not request.user.is_authenticated:
            return Response({'errors': ['Utilisateur non connecté.']}, status=status.HTTP_401_UNAUTHORIZED)

        if 'profile_picture' not in request.FILES:
            return Response({'errors': ['Aucune image de profil n’a été fournie.']}, status=status.HTTP_400_BAD_REQUEST)

        file = request.FILES['profile_picture']

        # petites gardes-fous (facultatif mais utile)
        if not (file.content_type or '').startswith('image/'):
            return Response({'errors': ['Le fichier doit être une image.']}, status=status.HTTP_400_BAD_REQUEST)
        if file.size > 5 * 1024 * 1024:  # 5 Mo
            return Response({'errors': ['Image trop volumineuse (max 5 Mo).']}, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        user.profile_picture = file
        user.save()

        # renvoyer l’URL directement (utile côté front)
        url = getattr(user.profile_picture, 'url', None)
        return Response(
            {'status': 'Image de profil mise à jour.', 'profile_picture_url': url},
            status=status.HTTP_200_OK
        )


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
        if request.user.is_authenticated:
            user = request.user
            username = user.username
            # first_name = user.first_name
            # last_name = user.last_name
            email = user.email
            preferred_platform = user.preferred_platform
            points = user.points

            # Checks if the user is authenticated with social-auth and if so gets the provider
            is_social_auth = UserSocialAuth.objects.filter(user=user).exists()

            if request.user.profile_picture:  # If profile picture, include its URL in the response.
                profile_picture_url = request.user.profile_picture.url
                response = {
                    'username': username,
                    # 'first_name': first_name,
                    # 'last_name': last_name,
                    'email': email,
                    'profile_picture_url': profile_picture_url,
                    'preferred_platform': preferred_platform,
                    'points': points,
                    'is_social_auth': is_social_auth
                }
            else:
                response = {
                    'username': username,
                    # 'first_name': first_name,
                    # 'last_name': last_name,
                    'email': email,
                    'preferred_platform': preferred_platform,
                    'points': points,
                    'is_social_auth': is_social_auth
                }

            return Response(response, status=status.HTTP_200_OK)
        else:
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
        if user_id is not None:
            user = get_object_or_404(CustomUser, id=user_id)
            serializer = CustomUserSerializer(user)
            total_deposits = Deposit.objects.filter(user=user).count()
            response = {}
            response = serializer.data
            response['total_deposits'] = total_deposits
            return Response(response, status=status.HTTP_200_OK)
        else:
            return Response({'Bad Request': 'User ID not found in request'}, status=status.HTTP_400_BAD_REQUEST)

class ChangeUsername(APIView):
    """
    Changer son nom d’utilisateur (username) en étant connecté.
    """
    def post(self, request, format=None):
        if not request.user.is_authenticated:
            return Response({'errors': ['Utilisateur non connecté.']}, status=status.HTTP_401_UNAUTHORIZED)

        new_username = request.data.get('username') or request.data.get('new_username')
        if not new_username:
            return Response({'errors': ['Veuillez fournir un nom d’utilisateur.']}, status=status.HTTP_400_BAD_REQUEST)

        # validations de base
        validator = UnicodeUsernameValidator()
        try:
            validator(new_username)
        except ValidationError as e:
            return Response({'errors': list(e.messages)}, status=status.HTTP_400_BAD_REQUEST)

        if len(new_username) < 3 or len(new_username) > 150:
            return Response({'errors': ['Le nom d’utilisateur doit contenir entre 3 et 150 caractères.']},
                            status=status.HTTP_400_BAD_REQUEST)

        # unicité (hors moi)
        if CustomUser.objects.filter(username__iexact=new_username).exclude(pk=request.user.pk).exists():
            return Response({'errors': ['Ce nom d’utilisateur est déjà pris.']}, status=status.HTTP_400_BAD_REQUEST)

        # OK, on met à jour
        user = request.user
        user.username = new_username
        user.save()

        return Response({'status': 'Nom d’utilisateur modifié avec succès.', 'username': new_username},
                        status=status.HTTP_200_OK)
