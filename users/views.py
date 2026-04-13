from django.contrib import messages
from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.validators import UnicodeUsernameValidator
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from box_management.models import Deposit
from box_management.utils import create_song_deposit

from .forms import RegisterUserForm
from .models import CustomUser
from .serializer import CustomUserSerializer
from .utils import (
    build_current_user_payload,
    build_favorite_deposit_payload,
    get_user_status,
    clear_guest_cookie,
    get_current_app_user,
    get_guest_user_from_request,
    merge_guest_into_user,
    touch_last_seen,
)

from PIL import Image
import io
import os

MAX_SIZE_BYTES = 2 * 1024 * 1024  # 2 Mo
OUT_SIZE = 512
VARIANTS = [256, 64]
RATE_LIMIT_SECONDS = 10  # simple anti-abus: 1 upload toutes les 10s par user


def _build_authenticated_user_payload(user):
    return build_current_user_payload(user)


def _is_truthy(value):
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


class LoginUser(APIView):
    def post(self, request, format=None):
        username = request.data.get("username")
        password = request.data.get("password")
        merge_guest = _is_truthy(request.data.get("merge_guest"))
        guest_user = get_guest_user_from_request(request)

        user = authenticate(request, username=username, password=password)
        if user is None:
            return Response({"status": False}, status=status.HTTP_401_UNAUTHORIZED)

        guest_merged = False
        merge_error = None
        merge_attempted = bool(merge_guest and guest_user)

        if merge_attempted and guest_user and guest_user.pk != user.pk:
            try:
                merge_result = merge_guest_into_user(guest_user, user)
                guest_merged = bool(merge_result.get("merged"))
            except Exception:
                merge_error = "Connexion réussie, mais la fusion des partages de cet appareil a échoué."

        login(request, user)
        touch_last_seen(user)

        response = Response(
            {
                "status": True,
                "guest_merged": guest_merged,
                "merge_attempted": merge_attempted,
                "merge_error": merge_error,
            },
            status=status.HTTP_200_OK,
        )
        if guest_merged:
            clear_guest_cookie(response)
        return response


class LogoutUser(APIView):
    def get(self, request, format=None):
        if request.user.is_authenticated:
            logout(request)
        return Response({"status": True}, status=status.HTTP_200_OK)

    def post(self, request, format=None):
        return self.get(request, format=format)


class RegisterUser(APIView):
    def post(self, request, format=None):
        guest_user = None
        if not request.user.is_authenticated:
            guest_user = get_guest_user_from_request(request)

        form = RegisterUserForm(
            request.data,
            request.FILES,
            instance=guest_user if guest_user else None,
        )
        if not form.is_valid():
            return Response({"errors": form.errors}, status=status.HTTP_400_BAD_REQUEST)

        user = form.save(commit=False)
        user.set_password(form.cleaned_data["password1"])

        if "profile_picture" in request.FILES:
            user.profile_picture = request.FILES["profile_picture"]

        if guest_user:
            user.is_guest = False
            user.guest_device_token = None
            user.converted_at = timezone.now()
            user.last_seen_at = timezone.now()

        user.save()
        username = form.cleaned_data["username"]
        password = form.cleaned_data["password1"]

        user = authenticate(request, username=username, password=password)
        login(request, user)
        touch_last_seen(user)
        messages.success(request, "Inscription réussie!")

        response = Response({"status": True}, status=status.HTTP_200_OK)
        clear_guest_cookie(response)
        return response


class ChangePasswordUser(APIView):
    def post(self, request, format=None):
        if not request.user.is_authenticated:
            return Response({"errors": ["Utilisateur non connecté."]}, status=status.HTTP_401_UNAUTHORIZED)
        if getattr(request.user, "is_guest", False):
            return Response({"errors": ["Finalise d’abord ton compte."]}, status=status.HTTP_403_FORBIDDEN)

        user = request.user
        new_password1 = request.data.get("new_password1")
        new_password2 = request.data.get("new_password2")

        if new_password1 != new_password2:
            return Response({"errors": ["Les mots de passe ne correspondent pas."]}, status=status.HTTP_401_UNAUTHORIZED)

        old_password = request.data.get("old_password")
        if not user.check_password(old_password):
            return Response({"errors": ["Ancien mot de passe invalide."]}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            validate_password(new_password1, user=user)
        except ValidationError as e:
            return Response({"errors": list(e.messages)}, status=status.HTTP_401_UNAUTHORIZED)

        user.set_password(new_password1)
        user.last_seen_at = timezone.now()
        user.save()
        update_session_auth_hash(request, user)

        return Response({"status": "Le mot de passe a été modifié avec succès."}, status=status.HTTP_200_OK)


class ChangeProfilePicture(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, format=None):
        user = request.user
        if not user.is_authenticated:
            return Response({"errors": ["Utilisateur non connecté."]}, status=status.HTTP_401_UNAUTHORIZED)
        if getattr(user, "is_guest", False):
            return Response({"errors": ["Finalise d’abord ton compte."]}, status=status.HTTP_403_FORBIDDEN)

        rl_key = f"avatar:rate:{user.id}"
        if cache.get(rl_key):
            return Response({"errors": ["Trop d'essais. Réessaie dans quelques secondes."]}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        cache.set(rl_key, 1, RATE_LIMIT_SECONDS)

        if "profile_picture" not in request.FILES:
            return Response({"errors": ["Aucune image fournie."]}, status=status.HTTP_400_BAD_REQUEST)

        f = request.FILES["profile_picture"]
        if not (f.content_type or "").lower().startswith("image/"):
            return Response({"errors": ["Le fichier doit être une image."]}, status=status.HTTP_400_BAD_REQUEST)

        if f.size > MAX_SIZE_BYTES:
            return Response({"errors": ["Image trop volumineuse (max 2 Mo)."]}, status=status.HTTP_400_BAD_REQUEST)

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
                return Response({"errors": ["Image finale trop lourde (> 2 Mo)."]}, status=status.HTTP_400_BAD_REQUEST)

            base_name = "avatar_" + timezone.now().strftime("%Y%m%d_%H%M%S")
            main_name = f"{base_name}.jpg"

            user.profile_picture.save(main_name, ContentFile(data), save=True)
            user.last_seen_at = timezone.now()
            user.save(update_fields=["profile_picture", "last_seen_at"])

            dir_name = os.path.dirname(user.profile_picture.name)
            base_stem = os.path.splitext(os.path.basename(user.profile_picture.name))[0]
            urls = {"main": getattr(user.profile_picture, "url", None), "variants": {}}

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
            return Response({"errors": [str(e)]}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ChangePreferredPlatform(APIView):
    def post(self, request, format=None):
        if not request.user.is_authenticated:
            return Response({"errors": "Utilisateur non connecté."}, status=status.HTTP_401_UNAUTHORIZED)
        if getattr(request.user, "is_guest", False):
            return Response({"errors": "Finalise d’abord ton compte."}, status=status.HTTP_403_FORBIDDEN)

        preferred_platform = request.data.get("preferred_platform")
        if preferred_platform not in ["spotify", "deezer"]:
            return Response({"errors": "Plateforme préférée invalide."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            request.user.preferred_platform = preferred_platform
            request.user.last_seen_at = timezone.now()
            request.user.save(update_fields=["preferred_platform", "last_seen_at"])
            return Response({"status": "La plateforme préférée a été modifiée avec succès."}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"errors": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class CheckAuthentication(APIView):
    def get(self, request, format=None):
        user = get_current_app_user(request)
        if not user:
            return Response({}, status=status.HTTP_401_UNAUTHORIZED)

        touch_last_seen(user)
        return Response(_build_authenticated_user_payload(user), status=status.HTTP_200_OK)


class GetUserPoints(APIView):
    def get(self, request, format=None):
        user = get_current_app_user(request)
        if not user:
            return Response({"errors": "Utilisateur non connecté."}, status=status.HTTP_401_UNAUTHORIZED)

        touch_last_seen(user)
        return Response({"points": user.points}, status=status.HTTP_200_OK)


class GetUserInfo(APIView):
    def get(self, request, format=None):
        username = (request.GET.get("username") or "").strip()
        if not username:
            return Response({"errors": ["username query param is required"]}, status=status.HTTP_400_BAD_REQUEST)

        user = get_object_or_404(CustomUser, username=username, is_guest=False)

        profile_picture_url = None
        try:
            if user.profile_picture:
                profile_picture_url = user.profile_picture.url
        except Exception:
            profile_picture_url = None

        viewer = get_current_app_user(request)
        total_deposits = Deposit.objects.filter(user=user).exclude(deposit_type="favorite").count()
        data = {
            "username": user.username,
            "display_name": user.display_name,
            "profile_picture_url": profile_picture_url,
            "total_deposits": total_deposits,
            "status": get_user_status(user),
            "favorite_deposit": build_favorite_deposit_payload(user, viewer=viewer),
        }
        return Response(data, status=status.HTTP_200_OK)


class SetFavoriteSong(APIView):
    def post(self, request, format=None):
        current_user = get_current_app_user(request)
        if not current_user:
            return Response({"errors": ["Utilisateur non connecté."]}, status=status.HTTP_401_UNAUTHORIZED)
        if getattr(current_user, "is_guest", False):
            return Response({"errors": ["Finalise d’abord ton compte."]}, status=status.HTTP_403_FORBIDDEN)
        touch_last_seen(current_user)

        option = request.data.get("option") or {}

        try:
            with transaction.atomic():
                user = CustomUser.objects.select_for_update().get(pk=current_user.pk)
                deposit, _song = create_song_deposit(
                    request=request,
                    user=user,
                    option=option,
                    deposit_type="favorite",
                )
                user.favorite_deposit = deposit
                user.save(update_fields=["favorite_deposit"])
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        refreshed_user = CustomUser.objects.filter(pk=current_user.pk).first() or current_user
        return Response(
            {
                "favorite_deposit": build_favorite_deposit_payload(refreshed_user, viewer=refreshed_user),
                "current_user": build_current_user_payload(refreshed_user),
            },
            status=status.HTTP_200_OK,
        )


class RemoveFavoriteSong(APIView):
    def post(self, request, format=None):
        current_user = get_current_app_user(request)
        if not current_user:
            return Response({"errors": ["Utilisateur non connecté."]}, status=status.HTTP_401_UNAUTHORIZED)
        if getattr(current_user, "is_guest", False):
            return Response({"errors": ["Finalise d’abord ton compte."]}, status=status.HTTP_403_FORBIDDEN)
        touch_last_seen(current_user)

        with transaction.atomic():
            user = CustomUser.objects.select_for_update().get(pk=current_user.pk)
            user.favorite_deposit = None
            user.save(update_fields=["favorite_deposit"])

        refreshed_user = CustomUser.objects.filter(pk=current_user.pk).first() or current_user
        return Response(
            {
                "favorite_deposit": None,
                "current_user": build_current_user_payload(refreshed_user),
            },
            status=status.HTTP_200_OK,
        )


class ChangeUsername(APIView):
    def post(self, request, format=None):
        if not request.user.is_authenticated:
            return Response({"errors": ["Utilisateur non connecté."]}, status=status.HTTP_401_UNAUTHORIZED)
        if getattr(request.user, "is_guest", False):
            return Response({"errors": ["Finalise d’abord ton compte."]}, status=status.HTTP_403_FORBIDDEN)

        new_username = request.data.get("username") or request.data.get("new_username")
        if not new_username:
            return Response({"errors": ["Veuillez fournir un nom d’utilisateur."]}, status=status.HTTP_400_BAD_REQUEST)

        validator = UnicodeUsernameValidator()
        try:
            validator(new_username)
        except ValidationError as e:
            return Response({"errors": list(e.messages)}, status=status.HTTP_400_BAD_REQUEST)

        if len(new_username) < 3 or len(new_username) > 30:
            return Response({"errors": ["Le nom d’utilisateur doit contenir entre 3 et 30 caractères."]}, status=status.HTTP_400_BAD_REQUEST)

        if CustomUser.objects.filter(username__iexact=new_username).exclude(pk=request.user.pk).exists():
            return Response({"errors": ["Ce nom d’utilisateur est déjà pris."]}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                user = request.user
                user.username = new_username
                user.last_seen_at = timezone.now()
                user.save(update_fields=["username", "last_seen_at"])
        except IntegrityError:
            return Response({"errors": ["Conflit d’unicité sur le nom d’utilisateur."]}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"errors": [f"Erreur serveur: {str(e)}"]}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({"status": "Nom d’utilisateur modifié avec succès.", "username": new_username}, status=status.HTTP_200_OK)
