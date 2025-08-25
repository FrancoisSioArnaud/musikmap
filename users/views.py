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
from django.contrib.auth.validators import UnicodeUsernameValidator
from django.db import IntegrityError, transaction
from rest_framework.parsers import MultiPartParser, FormParser
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.utils import timezone
from django.core.cache import cache

from PIL import Image
import io, os

MAX_SIZE_BYTES = 2 * 1024 * 1024  # 2 Mo
OUT_SIZE = 512
VARIANTS = [256, 64]
RATE_LIMIT_SECONDS = 10  # simple anti-abus: 1 upload toutes les 10s par user



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
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, format=None):
        user = request.user
        if not user.is_authenticated:
            return Response({'errors': ['Utilisateur non connecté.']}, status=status.HTTP_401_UNAUTHORIZED)

        # anti-abus simple
        rl_key = f"avatar:rate:{user.id}"
        if cache.get(rl_key):
            return Response({'errors': ["Trop d'essais. Réessaie dans quelques secondes."]}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        cache.set(rl_key, 1, RATE_LIMIT_SECONDS)

        if 'profile_picture' not in request.FILES:
            return Response({'errors': ['Aucune image fournie.']}, status=status.HTTP_400_BAD_REQUEST)

        f = request.FILES['profile_picture']
        if not (f.content_type or '').lower().startswith('image/'):
            return Response({'errors': ['Le fichier doit être une image.']}, status=status.HTTP_400_BAD_REQUEST)

        if f.size > MAX_SIZE_BYTES:
            return Response({'errors': ['Image trop volumineuse (max 2 Mo).']}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # 1) Ouvre PIL
            img = Image.open(f)
            # normalise (supprime alpha, convertit en RGB)
            if img.mode not in ('RGB', 'RGBA'):
                img = img.convert('RGB')
            if img.mode == 'RGBA':
                # fond blanc
                bg = Image.new('RGB', img.size, (255, 255, 255))
                bg.paste(img, mask=img.split()[3])
                img = bg

            # 2) Sécurité : borne max 512x512 (au cas où)
            img = img.copy()
            img.thumbnail((OUT_SIZE, OUT_SIZE), Image.LANCZOS)

            # 3) Encode JPEG qualité 80
            buf = io.BytesIO()
            img.save(buf, format='JPEG', quality=80, optimize=True)
            data = buf.getvalue()

            if len(data) > MAX_SIZE_BYTES:
                return Response({'errors': ['Image finale trop lourde (> 2 Mo).']}, status=status.HTTP_400_BAD_REQUEST)

            # 4) Sauvegarde principale via FileField
            base_name = "avatar_" + timezone.now().strftime("%Y%m%d_%H%M%S")
            main_name = f"{base_name}.jpg"

            # affecter le ContentFile au champ pour bénéficier de ta logique de suppression auto
            user.profile_picture.save(main_name, ContentFile(data), save=True)

            # 5) Génère et sauvegarde variantes 256 / 64 (fichiers à côté)
            dir_name = os.path.dirname(user.profile_picture.name)  # ex: 'users/avatars/123/'
            base_stem = os.path.splitext(os.path.basename(user.profile_picture.name))[0]  # avatar_2025...
            urls = {
                "main": getattr(user.profile_picture, 'url', None),
                "variants": {}
            }

            for size in VARIANTS:
                v = img.copy()
                v.thumbnail((size, size), Image.LANCZOS)
                vbuf = io.BytesIO()
                v.save(vbuf, format='JPEG', quality=80, optimize=True)
                vdata = vbuf.getvalue()
                vname = os.path.join(dir_name, f"{base_stem}_{size}.jpg")
                # Sauvegarde via storage (pas lié au FileField principal)
                if default_storage.exists(vname):
                    default_storage.delete(vname)
                default_storage.save(vname, ContentFile(vdata))
                try:
                    urls["variants"][str(size)] = default_storage.url(vname)
                except Exception:
                    urls["variants"][str(size)] = None

            return Response(
                {
                    'status': 'Image de profil mise à jour.',
                    'profile_picture_url': urls["main"],
                    'variants': urls["variants"],
                },
                status=status.HTTP_200_OK
            )

        except Exception as e:
            return Response({'errors': [str(e)]}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

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
    Retourne toujours du JSON, y compris en cas d’erreur.
    """
    def post(self, request, format=None):
        if not request.user.is_authenticated:
            return Response({'errors': ['Utilisateur non connecté.']}, status=status.HTTP_401_UNAUTHORIZED)

        new_username = request.data.get('username') or request.data.get('new_username')
        if not new_username:
            return Response({'errors': ['Veuillez fournir un nom d’utilisateur.']}, status=status.HTTP_400_BAD_REQUEST)

        # Validation syntaxique
        validator = UnicodeUsernameValidator()
        try:
            validator(new_username)
        except ValidationError as e:
            return Response({'errors': list(e.messages)}, status=status.HTTP_400_BAD_REQUEST)

        if len(new_username) < 3 or len(new_username) > 150:
            return Response({'errors': ['Le nom d’utilisateur doit contenir entre 3 et 150 caractères.']},
                            status=status.HTTP_400_BAD_REQUEST)

        # Unicité (hors moi)
        if CustomUser.objects.filter(username__iexact=new_username).exclude(pk=request.user.pk).exists():
            return Response({'errors': ['Ce nom d’utilisateur est déjà pris.']}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                user = request.user
                user.username = new_username
                user.save()
        except IntegrityError:
            return Response({'errors': ['Conflit d’unicité sur le nom d’utilisateur.']}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            # Attraper tout le reste pour éviter un 500 HTML
            return Response({'errors': [f'Erreur serveur: {str(e)}']}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({'status': 'Nom d’utilisateur modifié avec succès.', 'username': new_username},
                        status=status.HTTP_200_OK)


