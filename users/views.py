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
import io
import os

MAX_SIZE_BYTES = 2 * 1024 * 1024  # 2 Mo
OUT_SIZE = 512
VARIANTS = [256, 64]
RATE_LIMIT_SECONDS = 10  # simple anti-abus: 1 upload toutes les 10s par user


def _build_authenticated_user_payload(user):
    profile_picture_url = None
    if user.profile_picture:
        try:
            profile_picture_url = user.profile_picture.url
        except Exception:
            profile_picture_url = None

    is_social_auth = UserSocialAuth.objects.filter(user=user).exists()

    client = getattr(user, "client", None)
    client_id = getattr(user, "client_id", None)

    payload = {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "preferred_platform": user.preferred_platform,
        "points": user.points,
        "is_social_auth": is_social_auth,
        "profile_picture_url": profile_picture_url,
        # portail client
        "client_id": client_id,
        "client_name": client.name if client else None,
        "client_slug": client.slug if client else None,
        "client_role": getattr(user, "client_role", ""),
        "portal_status": getattr(user, "portal_status", None),
        # compatibilité pratique côté front
        "client": (
            {
                "id": client.id,
                "name": client.name,
                "slug": client.slug,
            }
            if client
            else None
        ),
    }

    return payload


class LoginUser(APIView):
    """
    Class goal:
    This class represents an API view for logging an user in.

    Methods:
    def post(self, request, format=None):
        Checks credentials and if match found, connect the user.

    Doc used : https://docs.djangoproject.com/en/4.2/topics/auth/default/
    """

    def post(self, request, format=None):
        username = request.data.get("username")
        password = request.data.get("password")
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            is_authenticated = True
            return Response({"status": is_authenticated}, status=status.HTTP_200_OK)
        else:
            is_authenticated = False
            return Response({"status": is_authenticated}, status=status.HTTP_401_UNAUTHORIZED)


class LogoutUser(APIView):
    """
    Class goal:
    This class represents an API view for logging an user out.

    Methods:
    def get(self, request, format=None):
        Checks if user is logged in, if so logs him out.

    Doc used : https://docs.djangoproject.com/en/4.2/topics/auth/default/
    """

    def get(self, request, format=None):
        if request.user.is_authenticated:
            logout(request)
            is_logged_out = True
            return Response({"status": is_logged_out}, status=status.HTTP_200_OK)
        else:
            is_logged_out = False
            return Response({"status": is_logged_out}, status=status.HTTP_401_UNAUTHORIZED)


class RegisterUser(APIView):
    """
    Class goal:
    This class represents an API view for registering an user.

    Methods:
    def post(self, request, format=None):
        Registers an user.

    Doc used : https://docs.djangoproject.com/en/4.2/topics/auth/default/
    """

    def post(self, request, format=None):
        form = RegisterUserForm(request.data, request.FILES)
        if form.is_valid():
            user = form.save(commit=False)
            user.set_password(form.cleaned_data["password1"])

            if "profile_picture" in request.FILES:
                user.profile_picture = request.FILES["profile_picture"]

            user.save()
            username = form.cleaned_data["username"]
            password = form.cleaned_data["password1"]

            user = authenticate(username=username, password=password)
            login(request, user)
            messages.success(request, ("Inscription réussie!"))
            return Response({"status": True}, status=status.HTTP_200_OK)
        else:
            errors = form.errors
            return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)


class ChangePasswordUser(APIView):
    """
    Class goal:
    While logged in, change your password by typing your old one first.
    """

    def post(self, request, format=None):
        if not request.user.is_authenticated:
            return Response(
                {"errors": ["Utilisateur non connecté."]},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        user = request.user
        new_password1 = request.data.get("new_password1")
        new_password2 = request.data.get("new_password2")

        if new_password1 != new_password2:
            return Response(
                {"errors": ["Les mots de passe ne correspondent pas."]},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        old_password = request.data.get("old_password")

        if user.check_password(old_password):
            try:
                validate_password(new_password1, user=user)
            except ValidationError as e:
                error_messages = list(e.messages)
                return Response(
                    {"errors": error_messages},
                    status=status.HTTP_401_UNAUTHORIZED,
                )

            user.set_password(new_password1)
            user.save()
            update_session_auth_hash(request, user)

            return Response(
                {"status": "Le mot de passe a été modifié avec succès."},
                status=status.HTTP_200_OK,
            )
        else:
            return Response(
                {"errors": ["Ancien mot de passe invalide."]},
                status=status.HTTP_401_UNAUTHORIZED,
            )


class ChangeProfilePicture(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, format=None):
        user = request.user
        if not user.is_authenticated:
            return Response(
                {"errors": ["Utilisateur non connecté."]},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        rl_key = f"avatar:rate:{user.id}"
        if cache.get(rl_key):
            return Response(
                {"errors": ["Trop d'essais. Réessaie dans quelques secondes."]},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        cache.set(rl_key, 1, RATE_LIMIT_SECONDS)

        if "profile_picture" not in request.FILES:
            return Response(
                {"errors": ["Aucune image fournie."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        f = request.FILES["profile_picture"]
        if not (f.content_type or "").lower().startswith("image/"):
            return Response(
                {"errors": ["Le fichier doit être une image."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if f.size > MAX_SIZE_BYTES:
            return Response(
                {"errors": ["Image trop volumineuse (max 2 Mo)."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            img = Image.open(f)

            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGB")
            if img.mode == "RGBA":
                bg = Image.new("RGB", img.size, (255, 255, 255))
                bg.paste(img, mask=img.split()[3])
                img = bg

            img = img.copy()
            img.thumbnail((OUT_SIZE, OUT_SIZE), Image.LANCZOS)

            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=80, optimize=True)
            data = buf.getvalue()

            if len(data) > MAX_SIZE_BYTES:
                return Response(
                    {"errors": ["Image finale trop lourde (> 2 Mo)."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            base_name = "avatar_" + timezone.now().strftime("%Y%m%d_%H%M%S")
            main_name = f"{base_name}.jpg"

            user.profile_picture.save(main_name, ContentFile(data), save=True)

            dir_name = os.path.dirname(user.profile_picture.name)
            base_stem = os.path.splitext(os.path.basename(user.profile_picture.name))[0]
            urls = {
                "main": getattr(user.profile_picture, "url", None),
                "variants": {},
            }

            for size in VARIANTS:
                v = img.copy()
                v.thumbnail((size, size), Image.LANCZOS)
                vbuf = io.BytesIO()
                v.save(vbuf, format="JPEG", quality=80, optimize=True)
                vdata = vbuf.getvalue()
                vname = os.path.join(dir_name, f"{base_stem}_{size}.jpg")
                if default_storage.exists(vname):
                    default_storage.delete(vname)
                default_storage.save(vname, ContentFile(vdata))
                try:
                    urls["variants"][str(size)] = default_storage.url(vname)
                except Exception:
                    urls["variants"][str(size)] = None

            return Response(
                {
                    "status": "Image de profil mise à jour.",
                    "profile_picture_url": urls["main"],
                    "variants": urls["variants"],
                },
                status=status.HTTP_200_OK,
            )

        except Exception as e:
            return Response(
                {"errors": [str(e)]},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class ChangePreferredPlatform(APIView):
    """
    Class goal : In your profile section, select your preferred platform (eg. Deezer or Spotify)
    """

    def post(self, request, format=None):
        if not request.user.is_authenticated:
            return Response(
                {"errors": "Utilisateur non connecté."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        user = request.user
        preferred_platform = request.data.get("preferred_platform")

        if preferred_platform not in ["spotify", "deezer"]:
            return Response(
                {"errors": "Plateforme préférée invalide."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user.preferred_platform = preferred_platform
            user.save()

            return Response(
                {"status": "La plateforme préférée a été modifiée avec succès."},
                status=status.HTTP_200_OK,
            )
        except Exception as e:
            return Response(
                {"errors": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class CheckAuthentication(APIView):
    """
    Class goal : check if the user is authenticated
    """

    def get(self, request, format=None):
        if request.user.is_authenticated:
            user = (
                CustomUser.objects.select_related("client")
                .filter(pk=request.user.pk)
                .first()
            ) or request.user

            response = _build_authenticated_user_payload(user)
            return Response(response, status=status.HTTP_200_OK)

        return Response({}, status=status.HTTP_401_UNAUTHORIZED)


class AddUserPoints(APIView):
    """
    Class goal : add (or delete) points to the connected user.
    """

    def post(self, request, format=None):
        if not request.user.is_authenticated:
            return Response(
                {"errors": "Utilisateur non connecté."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        user = request.user
        points = request.data.get("points")

        if points is None:
            return Response(
                {"errors": "Nombre de points invalide."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            points = int(points)
        except (TypeError, ValueError):
            return Response(
                {"errors": "Nombre de points invalide."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user.refresh_from_db(fields=["points"])
        except Exception:
            user.refresh_from_db()

        current = getattr(user, "points", 0)
        new_balance = current + points

        if new_balance < 0:
            return Response(
                {
                    "error": "insufficient_funds",
                    "message": "Pas assez de points pour effectuer cette action.",
                    "points_balance": current,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.points = new_balance
        user.save(update_fields=["points"])

        return Response(
            {
                "status": "Points mis à jour avec succès.",
                "points_balance": user.points,
            },
            status=status.HTTP_200_OK,
        )


class GetUserPoints(APIView):
    """
    Class goal : retrieve number of points of the user connected
    """

    def get(self, request, format=None):
        if not request.user.is_authenticated:
            return Response(
                {"errors": "Utilisateur non connecté."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        user = request.user
        points = user.points

        return Response({"points": points}, status=status.HTTP_200_OK)


class GetUserInfo(APIView):
    """
    GET /users/get-user-info?username=<str>
    Retourne les infos publiques + total_deposits

    Payload:
    {
      "username": "...",
      "profile_picture_url": "..." | null,
      "total_deposits": <int>
    }
    """

    def get(self, request, format=None):
        username = (request.GET.get("username") or "").strip()
        if not username:
            return Response(
                {"errors": ["username query param is required"]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = get_object_or_404(CustomUser, username=username)

        profile_picture_url = None
        try:
            if user.profile_picture:
                profile_picture_url = user.profile_picture.url
        except Exception:
            profile_picture_url = None

        total_deposits = Deposit.objects.filter(user=user).count()

        data = {
            "username": user.username,
            "profile_picture_url": profile_picture_url,
            "total_deposits": total_deposits,
        }
        return Response(data, status=status.HTTP_200_OK)


class ChangeUsername(APIView):
    """
    Changer son nom d’utilisateur (username) en étant connecté.
    Retourne toujours du JSON, y compris en cas d’erreur.
    """

    def post(self, request, format=None):
        if not request.user.is_authenticated:
            return Response(
                {"errors": ["Utilisateur non connecté."]},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        new_username = request.data.get("username") or request.data.get("new_username")
        if not new_username:
            return Response(
                {"errors": ["Veuillez fournir un nom d’utilisateur."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        validator = UnicodeUsernameValidator()
        try:
            validator(new_username)
        except ValidationError as e:
            return Response(
                {"errors": list(e.messages)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(new_username) < 3 or len(new_username) > 150:
            return Response(
                {"errors": ["Le nom d’utilisateur doit contenir entre 3 et 150 caractères."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if CustomUser.objects.filter(username__iexact=new_username).exclude(pk=request.user.pk).exists():
            return Response(
                {"errors": ["Ce nom d’utilisateur est déjà pris."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                user = request.user
                user.username = new_username
                user.save()
        except IntegrityError:
            return Response(
                {"errors": ["Conflit d’unicité sur le nom d’utilisateur."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as e:
            return Response(
                {"errors": [f"Erreur serveur: {str(e)}"]},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(
            {
                "status": "Nom d’utilisateur modifié avec succès.",
                "username": new_username,
            },
            status=status.HTTP_200_OK,
        )
