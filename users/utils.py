import secrets
from typing import Optional, Tuple

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone
from social_django.models import UserSocialAuth

from .models import CustomUser

GUEST_COOKIE_NAME = "mm_guest"
GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 5
GUEST_USERNAME_PREFIX = "guest_"


def _now():
    return timezone.now()


def generate_guest_device_token() -> str:
    return secrets.token_urlsafe(32)


def generate_guest_username() -> str:
    while True:
        candidate = f"{GUEST_USERNAME_PREFIX}{secrets.token_hex(4)}"
        if not CustomUser.objects.filter(username__iexact=candidate).exists():
            return candidate


def get_guest_user_from_request(request) -> Optional[CustomUser]:
    token = (request.COOKIES.get(GUEST_COOKIE_NAME) or "").strip()
    if not token:
        return None

    return (
        CustomUser.objects.select_related("client")
        .filter(is_guest=True, guest_device_token=token, is_active=True)
        .first()
    )


def get_current_app_user(request) -> Optional[CustomUser]:
    if getattr(request, "user", None) is not None and getattr(request.user, "is_authenticated", False):
        return (
            CustomUser.objects.select_related("client")
            .filter(pk=request.user.pk)
            .first()
        ) or request.user

    return get_guest_user_from_request(request)


def touch_last_seen(user: Optional[CustomUser]) -> Optional[CustomUser]:
    if not user:
        return user

    now = _now()
    user.last_seen_at = now
    try:
        user.save(update_fields=["last_seen_at"])
    except Exception:
        user.save()
    return user


def build_current_user_payload(user: CustomUser):
    profile_picture_url = None
    if getattr(user, "profile_picture", None):
        try:
            profile_picture_url = user.profile_picture.url
        except Exception:
            profile_picture_url = None

    is_social_auth = False
    if not getattr(user, "is_guest", False):
        is_social_auth = UserSocialAuth.objects.filter(user=user).exists()

    client = getattr(user, "client", None)
    client_id = getattr(user, "client_id", None)

    return {
        "id": user.id,
        "username": user.username,
        "display_name": getattr(user, "display_name", None) or ("Invité" if user.is_guest else user.username),
        "email": user.email,
        "preferred_platform": user.preferred_platform,
        "points": user.points,
        "is_social_auth": is_social_auth,
        "profile_picture_url": profile_picture_url,
        "is_guest": bool(getattr(user, "is_guest", False)),
        "last_seen_at": user.last_seen_at.isoformat() if getattr(user, "last_seen_at", None) else None,
        "client_id": client_id,
        "client_name": client.name if client else None,
        "client_slug": client.slug if client else None,
        "client_role": getattr(user, "client_role", ""),
        "portal_status": getattr(user, "portal_status", None),
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


def create_guest_user() -> Tuple[CustomUser, str]:
    token = generate_guest_device_token()
    user = CustomUser(
        username=generate_guest_username(),
        email="",
        is_guest=True,
        guest_device_token=token,
        last_seen_at=_now(),
    )
    user.set_unusable_password()
    user.save()
    return user, token


def ensure_guest_user_for_request(request) -> Tuple[CustomUser, bool]:
    current = get_current_app_user(request)
    if current:
        return current, False

    guest, _token = create_guest_user()
    return guest, True


def attach_guest_cookie(response, token: str):
    secure_default = bool(getattr(settings, "SESSION_COOKIE_SECURE", False))
    response.set_cookie(
        GUEST_COOKIE_NAME,
        token,
        max_age=GUEST_COOKIE_MAX_AGE,
        httponly=True,
        samesite="Lax",
        secure=secure_default,
        path="/",
    )
    return response


def clear_guest_cookie(response):
    response.delete_cookie(GUEST_COOKIE_NAME, path="/", samesite="Lax")
    return response


def apply_points_delta(user: CustomUser, delta: int):
    try:
        delta = int(delta)
    except (TypeError, ValueError):
        return False, {"errors": "Nombre de points invalide."}, 400

    try:
        user.refresh_from_db(fields=["points"])
    except Exception:
        user.refresh_from_db()

    current = getattr(user, "points", 0)
    new_balance = current + delta
    if new_balance < 0:
        return (
            False,
            {
                "error": "insufficient_funds",
                "message": "Pas assez de points pour effectuer cette action.",
                "points_balance": current,
            },
            400,
        )

    user.points = new_balance
    user.last_seen_at = _now()
    try:
        user.save(update_fields=["points", "last_seen_at"])
    except Exception:
        user.save()

    return True, {"status": "Points mis à jour avec succès.", "points_balance": user.points}, 200


def merge_guest_into_user(guest_user: CustomUser, target_user: CustomUser):
    if not guest_user or not target_user:
        return {"merged": False, "reason": "missing_user"}
    if guest_user.pk == target_user.pk:
        return {"merged": False, "reason": "same_user"}
    if not getattr(guest_user, "is_guest", False):
        return {"merged": False, "reason": "source_not_guest"}

    from box_management.models import Deposit, DiscoveredSong, EmojiRight, Reaction

    with transaction.atomic():
        guest = CustomUser.objects.select_for_update().get(pk=guest_user.pk)
        target = CustomUser.objects.select_for_update().get(pk=target_user.pk)

        if not guest.is_guest:
            return {"merged": False, "reason": "source_not_guest"}

        points_added = int(guest.points or 0)
        if points_added:
            target.points = int(target.points or 0) + points_added

        target.last_seen_at = _now()
        target.save(update_fields=["points", "last_seen_at"])

        moved_deposits = Deposit.objects.filter(user=guest).update(user=target)

        for right in list(EmojiRight.objects.filter(user=guest).select_related("emoji")):
            exists = EmojiRight.objects.filter(user=target, emoji_id=right.emoji_id).exists()
            if exists:
                right.delete()
            else:
                right.user = target
                right.save(update_fields=["user"])

        guest_discoveries = list(
            DiscoveredSong.objects.filter(user=guest).select_related("deposit").order_by("discovered_at", "id")
        )
        for discovery in guest_discoveries:
            existing = (
                DiscoveredSong.objects.filter(user=target, deposit_id=discovery.deposit_id)
                .order_by("discovered_at", "id")
                .first()
            )
            if not existing:
                discovery.user = target
                discovery.save(update_fields=["user"])
                continue

            update_fields = []
            if discovery.discovered_type == "main" and existing.discovered_type != "main":
                existing.discovered_type = "main"
                update_fields.append("discovered_type")
            if discovery.discovered_at and existing.discovered_at and discovery.discovered_at < existing.discovered_at:
                existing.discovered_at = discovery.discovered_at
                update_fields.append("discovered_at")
            if update_fields:
                existing.save(update_fields=update_fields)
            discovery.delete()

        latest_guest_reaction_by_deposit = {}
        guest_reactions = list(
            Reaction.objects.filter(user=guest).select_related("emoji", "deposit").order_by("-updated_at", "-created_at", "-id")
        )
        for reaction in guest_reactions:
            if reaction.deposit_id not in latest_guest_reaction_by_deposit:
                latest_guest_reaction_by_deposit[reaction.deposit_id] = reaction
            else:
                reaction.delete()

        for deposit_id, guest_reaction in latest_guest_reaction_by_deposit.items():
            target_reactions = list(
                Reaction.objects.filter(user=target, deposit_id=deposit_id).order_by("-updated_at", "-created_at", "-id")
            )
            target_reaction = target_reactions[0] if target_reactions else None
            for duplicate in target_reactions[1:]:
                duplicate.delete()

            if not target_reaction:
                try:
                    guest_reaction.user = target
                    guest_reaction.save(update_fields=["user"])
                except IntegrityError:
                    Reaction.objects.filter(pk=guest_reaction.pk).delete()
                continue

            guest_stamp = guest_reaction.updated_at or guest_reaction.created_at
            target_stamp = target_reaction.updated_at or target_reaction.created_at
            if guest_stamp and target_stamp and guest_stamp > target_stamp:
                if target_reaction.emoji_id != guest_reaction.emoji_id:
                    target_reaction.emoji_id = guest_reaction.emoji_id
                    target_reaction.save(update_fields=["emoji", "updated_at"])
                else:
                    target_reaction.save(update_fields=["updated_at"])
            guest_reaction.delete()

        guest.delete()

    return {
        "merged": True,
        "points_added": points_added,
        "moved_deposits": moved_deposits,
    }
