from django.contrib import messages
from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.validators import UnicodeUsernameValidator
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from box_management.models import Deposit
from box_management.utils import create_song_deposit
from la_boite_a_son.api_errors import api_error
from spotify.util import apply_pending_spotify_auth_to_user

from .forms import RegisterUserForm
from .models import CustomUser
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


def _normalize_field_errors(errors):
    if not errors:
        return {}

    if isinstance(errors, ValidationError):
        return {"global": [str(message) for message in errors.messages if str(message)]}

    if hasattr(errors, "items"):
        normalized = {}
        for key, value in errors.items():
            field_key = "global" if str(key) in {"__all__", "non_field_errors"} else str(key)
            if isinstance(value, (list, tuple)):
                messages = [str(item) for item in value if str(item)]
            else:
                messages = [str(value)] if str(value) else []
            if messages:
                normalized[field_key] = messages
        return normalized

    if isinstance(errors, (list, tuple)):
        messages = [str(item) for item in errors if str(item)]
        return {"global": messages} if messages else {}

    text = str(errors).strip()
    return {"global": [text]} if text else {}


class LoginUser(APIView):
    def post(self, request, format=None):
        username = request.data.get("username")
        password = request.data.get("password")
        merge_guest = _is_truthy(request.data.get("merge_guest"))
        guest_user = get_guest_user_from_request(request)

        user = authenticate(request, username=username, password=password)
        if user is None:
            return api_error(status.HTTP_401_UNAUTHORIZED, "AUTH_INVALID", "Informations d'identification non valides.")

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

        pending_spotify_result = apply_pending_spotify_auth_to_user(request, user)

        response = Response(
            {
                "status": True,
                "guest_merged": guest_merged,
                "merge_attempted": merge_attempted,
                "merge_error": merge_error,
                "auth_result": pending_spotify_result.get("type") if pending_spotify_result else None,
                "auth_redirect_to": f"/auth/return?result={pending_spotify_result.get('type')}" if pending_spotify_result else None,
            },
            status=status.HTTP_200_OK,
        )
        if guest_merged or pending_spotify_result:
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
            return api_error(
                status.HTTP_400_BAD_REQUEST,
                "VALIDATION_ERROR",
                "Le formulaire contient des erreurs.",
                field_errors=_normalize_field_errors(form.errors),
            )

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
            return api_error(status.HTTP_401_UNAUTHORIZED, "AUTH_REQUIRED", "Utilisateur non connecté.")
        if getattr(request.user, "is_guest", False):
            return api_error(status.HTTP_403_FORBIDDEN, "ACCOUNT_COMPLETION_REQUIRED", "Finalise d’abord ton compte.")

        user = request.user
        new_password1 = request.data.get("new_password1")
        new_password2 = request.data.get("new_password2")

        if new_password1 != new_password2:
            return api_error(
                status.HTTP_400_BAD_REQUEST,
                "PASSWORD_MISMATCH",
                "Les mots de passe ne correspondent pas.",
                field_errors={"new_password2": ["Les mots de passe ne correspondent pas."]},
            )

        old_password = request.data.get("old_password")
        if not user.check_password(old_password):
            return api_error(
                status.HTTP_400_BAD_REQUEST,
                "CURRENT_PASSWORD_INVALID",
                "Ancien mot de passe invalide.",
                field_errors={"old_password": ["Ancien mot de passe invalide."]},
            )

        try:
            validate_password(new_password1, user=user)
        except ValidationError as exc:
            messages_list = [str(message) for message in exc.messages if str(message)]
            return api_error(
                status.HTTP_400_BAD_REQUEST,
                "PASSWORD_VALIDATION_FAILED",
                "Le nouveau mot de passe est invalide.",
                field_errors={"new_password1": messages_list},
            )

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
            return api_error(status.HTTP_401_UNAUTHORIZED, "AUTH_REQUIRED", "Utilisateur non connecté.")
        if getattr(user, "is_guest", False):
            return api_error(status.HTTP_403_FORBIDDEN, "ACCOUNT_COMPLETION_REQUIRED", "Finalise d’abord ton compte.")

        rl_key = f"avatar:rate:{user.id}"
        if cache.get(rl_key):
            return api_error(status.HTTP_429_TOO_MANY_REQUESTS, "RATE_LIMITED", "Trop d'essais. Réessaie dans quelques secondes.")
        cache.set(rl_key, 1, RATE_LIMIT_SECONDS)

        if "profile_picture" not in request.FILES:
            return api_error(
                status.HTTP_400_BAD_REQUEST,
                "PROFILE_PICTURE_REQUIRED",
                "Aucune image fournie.",
                field_errors={"profile_picture": ["Aucune image fournie."]},
            )

        uploaded_file = request.FILES["profile_picture"]
        if not (uploaded_file.content_type or "").lower().startswith("image/"):
            return api_error(
                status.HTTP_400_BAD_REQUEST,
                "INVALID_IMAGE_TYPE",
                "Le fichier doit être une image.",
                field_errors={"profile_picture": ["Le fichier doit être une image."]},
            )

        if uploaded_file.size > MAX_SIZE_BYTES:
            return api_error(
                status.HTTP_400_BAD_REQUEST,
                "IMAGE_TOO_LARGE",
                "Image trop volumineuse (max 2 Mo).",
                field_errors={"profile_picture": ["Image trop volumineuse (max 2 Mo)."]},
            )

        try:
            img = Image.open(uploaded_file)

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
                return api_error(
                    status.HTTP_400_BAD_REQUEST,
                    "PROCESSED_IMAGE_TOO_LARGE",
                    "Image finale trop lourde (> 2 Mo).",
                    field_errors={"profile_picture": ["Image finale trop lourde (> 2 Mo)."]},
                )

            base_name = "avatar_" + timezone.now().strftime("%Y%m%d_%H%M%S")
            main_name = f"{base_name}.jpg"

            user.profile_picture.save(main_name, ContentFile(data), save=True)
            user.last_seen_at = timezone.now()
            user.save(update_fields=["profile_picture", "last_seen_at"])

            dir_name = os.path.dirname(user.profile_picture.name)
            base_stem = os.path.splitext(os.path.basename(user.profile_picture.name))[0]
            urls = {"main": getattr(user.profile_picture, "url", None), "variants": {}}

            for size in VARIANTS:
                variant_image = img.copy()
                variant_image.thumbnail((size, size), Image.LANCZOS)
                variant_buffer = io.BytesIO()
                variant_image.save(variant_buffer, format="JPEG", quality=80, optimize=True)
                variant_data = variant_buffer.getvalue()
                variant_name = os.path.join(dir_name, f"{base_stem}_{size}.jpg")
                if default_storage.exists(variant_name):
                    default_storage.delete(variant_name)
                default_storage.save(variant_name, ContentFile(variant_data))
                try:
                    urls["variants"][str(size)] = default_storage.url(variant_name)
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
        except Exception:
            return api_error(status.HTTP_500_INTERNAL_SERVER_ERROR, "PROFILE_PICTURE_UPLOAD_FAILED", "Échec de l’envoi de l’image.")


class CheckAuthentication(APIView):
    def get(self, request, format=None):
        user = get_current_app_user(request)
        if not user:
            return api_error(status.HTTP_401_UNAUTHORIZED, "AUTH_REQUIRED", "Utilisateur non connecté.")

        touch_last_seen(user)
        return Response(_build_authenticated_user_payload(user), status=status.HTTP_200_OK)


class GetUserPoints(APIView):
    def get(self, request, format=None):
        user = get_current_app_user(request)
        if not user:
            return api_error(status.HTTP_401_UNAUTHORIZED, "AUTH_REQUIRED", "Utilisateur non connecté.")

        touch_last_seen(user)
        return Response({"points": user.points}, status=status.HTTP_200_OK)


class GetUserInfo(APIView):
    def get(self, request, format=None):
        username = (request.GET.get("username") or "").strip()
        user_id = (request.GET.get("userID") or request.GET.get("userId") or "").strip()

        if not username and not user_id:
            return api_error(status.HTTP_400_BAD_REQUEST, "USER_LOOKUP_REQUIRED", "username or userID query param is required")

        lookup = {"is_guest": False}
        if username:
            lookup["username"] = username
        else:
            try:
                lookup["pk"] = int(user_id)
            except (TypeError, ValueError):
                return api_error(status.HTTP_400_BAD_REQUEST, "USER_ID_INVALID", "userID query param is invalid")

        user = CustomUser.objects.filter(**lookup).first()
        if not user:
            return api_error(status.HTTP_404_NOT_FOUND, "USER_NOT_FOUND", "Utilisateur introuvable.")

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
            return api_error(status.HTTP_401_UNAUTHORIZED, "AUTH_REQUIRED", "Utilisateur non connecté.")
        if getattr(current_user, "is_guest", False):
            return api_error(status.HTTP_403_FORBIDDEN, "ACCOUNT_COMPLETION_REQUIRED", "Finalise d’abord ton compte.")
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
            return api_error(status.HTTP_400_BAD_REQUEST, "FAVORITE_SONG_INVALID", str(exc) or "Impossible d’enregistrer cette chanson de cœur.")
        except Exception:
            return api_error(status.HTTP_500_INTERNAL_SERVER_ERROR, "FAVORITE_SONG_SAVE_FAILED", "Impossible d’enregistrer cette chanson de cœur.")

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
            return api_error(status.HTTP_401_UNAUTHORIZED, "AUTH_REQUIRED", "Utilisateur non connecté.")
        if getattr(current_user, "is_guest", False):
            return api_error(status.HTTP_403_FORBIDDEN, "ACCOUNT_COMPLETION_REQUIRED", "Finalise d’abord ton compte.")
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
            return api_error(status.HTTP_401_UNAUTHORIZED, "AUTH_REQUIRED", "Utilisateur non connecté.")
        if getattr(request.user, "is_guest", False):
            return api_error(status.HTTP_403_FORBIDDEN, "ACCOUNT_COMPLETION_REQUIRED", "Finalise d’abord ton compte.")

        new_username = request.data.get("username") or request.data.get("new_username")
        if not new_username:
            return api_error(
                status.HTTP_400_BAD_REQUEST,
                "USERNAME_REQUIRED",
                "Veuillez fournir un nom d’utilisateur.",
                field_errors={"username": ["Veuillez fournir un nom d’utilisateur."]},
            )

        validator = UnicodeUsernameValidator()
        try:
            validator(new_username)
        except ValidationError as exc:
            return api_error(
                status.HTTP_400_BAD_REQUEST,
                "USERNAME_INVALID",
                "Le nom d’utilisateur est invalide.",
                field_errors={"username": [str(message) for message in exc.messages if str(message)]},
            )

        if len(new_username) < 3 or len(new_username) > 30:
            return api_error(
                status.HTTP_400_BAD_REQUEST,
                "USERNAME_LENGTH_INVALID",
                "Le nom d’utilisateur doit contenir entre 3 et 30 caractères.",
                field_errors={"username": ["Le nom d’utilisateur doit contenir entre 3 et 30 caractères."]},
            )

        if CustomUser.objects.filter(username__iexact=new_username).exclude(pk=request.user.pk).exists():
            return api_error(
                status.HTTP_409_CONFLICT,
                "USERNAME_ALREADY_TAKEN",
                "Ce nom d’utilisateur est déjà pris.",
                field_errors={"username": ["Ce nom d’utilisateur est déjà pris."]},
            )

        try:
            with transaction.atomic():
                user = request.user
                user.username = new_username
                user.last_seen_at = timezone.now()
                user.save(update_fields=["username", "last_seen_at"])
        except IntegrityError:
            return api_error(
                status.HTTP_409_CONFLICT,
                "USERNAME_CONFLICT",
                "Conflit d’unicité sur le nom d’utilisateur.",
                field_errors={"username": ["Conflit d’unicité sur le nom d’utilisateur."]},
            )
        except Exception:
            return api_error(status.HTTP_500_INTERNAL_SERVER_ERROR, "USERNAME_UPDATE_FAILED", "Impossible de modifier le nom d’utilisateur.")

        return Response({"status": "Nom d’utilisateur modifié avec succès.", "username": new_username}, status=status.HTTP_200_OK)
