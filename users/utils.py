import json
import secrets
from pathlib import Path
from typing import Optional, Tuple

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from social_django.models import UserSocialAuth
from users.provider_connections import merge_provider_connections, serialize_provider_connections_for_user

from .models import CustomUser

GUEST_COOKIE_NAME = "mm_guest"
GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 5
GUEST_USERNAME_PREFIX = "guest_"


USER_STATUSES_PATH = Path(__file__).resolve().parent / "data" / "user_statuses.json"


def _get_user_total_deposits(user: Optional[CustomUser]) -> int:
    if not user or not getattr(user, "pk", None):
        return 0

    from box_management.models import Deposit

    return Deposit.objects.filter(user=user).exclude(deposit_type="favorite").count()


def _load_user_statuses() -> list[dict]:
    try:
        raw_statuses = json.loads(USER_STATUSES_PATH.read_text(encoding="utf-8"))
    except Exception:
        return []

    valid_statuses = []
    for item in raw_statuses if isinstance(raw_statuses, list) else []:
        if not isinstance(item, dict):
            continue

        name = str(item.get("name") or "").strip()
        try:
            min_deposits = int(item.get("min_deposits"))
        except (TypeError, ValueError):
            continue

        if not name or min_deposits < 0:
            continue

        valid_statuses.append({
            "name": name,
            "min_deposits": min_deposits,
        })

    valid_statuses.sort(key=lambda status: status["min_deposits"])
    return valid_statuses


def get_user_status(user: Optional[CustomUser]) -> Optional[dict]:
    total_deposits = _get_user_total_deposits(user)
    current_status = None

    for candidate in _load_user_statuses():
        if total_deposits >= candidate["min_deposits"]:
            current_status = candidate
        else:
            break

    return current_status



def build_favorite_deposit_payload(profile_user: Optional[CustomUser], viewer: Optional[CustomUser] = None):
    favorite_deposit_id = getattr(profile_user, "favorite_deposit_id", None)
    if not favorite_deposit_id:
        return None

    from box_management.models import Deposit
    from box_management.utils import _build_deposits_payload

    deposit = (
        Deposit.objects
        .select_related("song", "user")
        .filter(pk=favorite_deposit_id, deposit_type="favorite")
        .first()
    )
    if not deposit:
        return None

    payloads = _build_deposits_payload(
        [deposit],
        viewer=viewer,
        include_user=False,
        include_deposit_time=False,
        force_song_infos_for=[deposit.pk],
    )
    return payloads[0] if payloads else None


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
    user_status = get_user_status(user)
    total_deposits = _get_user_total_deposits(user)

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

    favorite_deposit = build_favorite_deposit_payload(user, viewer=user)
    provider_connections = serialize_provider_connections_for_user(user)

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
        "status": user_status,
        "total_deposits": total_deposits,
        "favorite_deposit": favorite_deposit,
        "provider_connections": provider_connections,
        "connected_providers": [
            provider_code
            for provider_code, payload in provider_connections.items()
            if payload.get("connected")
        ],
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


def apply_points_delta(user: CustomUser, delta: int, *, lock_user: bool = True):
    try:
        delta = int(delta)
    except (TypeError, ValueError):
        return False, {"errors": "Nombre de points invalide."}, 400

    with transaction.atomic():
        working_user = user

        if lock_user:
            working_user = CustomUser.objects.select_for_update().get(pk=user.pk)
        else:
            try:
                working_user.refresh_from_db(fields=["points", "last_seen_at"])
            except Exception:
                working_user.refresh_from_db()

        current = int(getattr(working_user, "points", 0) or 0)
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

        working_user.points = new_balance
        working_user.last_seen_at = _now()
        try:
            working_user.save(update_fields=["points", "last_seen_at"])
        except Exception:
            working_user.save()

        if working_user.pk == getattr(user, "pk", None):
            user.points = working_user.points
            user.last_seen_at = working_user.last_seen_at

        return True, {"status": "Points mis à jour avec succès.", "points_balance": working_user.points}, 200

def merge_guest_into_user(guest_user: CustomUser, target_user: CustomUser):
    if not guest_user or not target_user:
        return {"merged": False, "reason": "missing_user"}
    if guest_user.pk == target_user.pk:
        return {"merged": False, "reason": "same_user"}
    if not getattr(guest_user, "is_guest", False):
        return {"merged": False, "reason": "source_not_guest"}

    from box_management.models import (
        Article,
        Comment,
        CommentAttemptLog,
        CommentModerationDecision,
        CommentReport,
        CommentUserRestriction,
        Deposit,
        DiscoveredSong,
        EmojiRight,
        Reaction,
    )

    with transaction.atomic():
        guest = CustomUser.objects.select_for_update().get(pk=guest_user.pk)
        target = CustomUser.objects.select_for_update().get(pk=target_user.pk)

        if not guest.is_guest:
            return {"merged": False, "reason": "source_not_guest"}

        # -----------------------------
        # 1) Fusion des champs du user
        # -----------------------------
        points_added = int(guest.points or 0)
        target_update_fields = ["last_seen_at"]
        moved_profile_picture = False

        if points_added:
            target.points = int(target.points or 0) + points_added
            target_update_fields.append("points")

        if not target.preferred_platform and guest.preferred_platform:
            target.preferred_platform = guest.preferred_platform
            target_update_fields.append("preferred_platform")

        if not target.profile_picture and guest.profile_picture:
            target.profile_picture = guest.profile_picture
            target_update_fields.append("profile_picture")
            moved_profile_picture = True

        target.last_seen_at = _now()
        target.save(update_fields=target_update_fields)

        # Important :
        # si on a déplacé la profile picture du guest vers le target,
        # il faut vider le champ côté guest SANS passer par save(),
        # sinon les signaux supprimeront physiquement le fichier.
        if moved_profile_picture:
            CustomUser.objects.filter(pk=guest.pk).update(profile_picture=None)
            guest.profile_picture = None

        try:
            target_avatar_url = target.profile_picture.url if target.profile_picture else ""
        except Exception:
            target_avatar_url = ""

        # -----------------------------
        # 2) Dépôts
        # -----------------------------
        guest_deposit_ids = list(
            Deposit.objects.filter(user=guest).values_list("id", flat=True)
        )
        moved_deposits = Deposit.objects.filter(user=guest).update(user=target)

        # -----------------------------
        # 3) Emoji rights
        # -----------------------------
        emoji_rights_moved = 0
        emoji_rights_deleted = 0

        for right in list(EmojiRight.objects.filter(user=guest).select_related("emoji")):
            exists = EmojiRight.objects.filter(user=target, emoji_id=right.emoji_id).exists()
            if exists:
                right.delete()
                emoji_rights_deleted += 1
            else:
                right.user = target
                right.save(update_fields=["user"])
                emoji_rights_moved += 1

        # -----------------------------
        # 4) Discoveries
        # -----------------------------
        discoveries_moved = 0
        discoveries_merged = 0

        guest_discoveries = list(
            DiscoveredSong.objects.filter(user=guest)
            .select_related("deposit")
            .order_by("discovered_at", "id")
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
                discoveries_moved += 1
                continue

            update_fields = []
            if discovery.discovered_type == "main" and existing.discovered_type != "main":
                existing.discovered_type = "main"
                update_fields.append("discovered_type")
            if (
                discovery.discovered_at
                and existing.discovered_at
                and discovery.discovered_at < existing.discovered_at
            ):
                existing.discovered_at = discovery.discovered_at
                update_fields.append("discovered_at")
            if update_fields:
                existing.save(update_fields=update_fields)
            discovery.delete()
            discoveries_merged += 1

        # -----------------------------
        # 5) Reactions
        # -----------------------------
        reactions_moved = 0
        reactions_deleted = 0
        reactions_updated = 0

        latest_guest_reaction_by_deposit = {}
        guest_reactions = list(
            Reaction.objects.filter(user=guest)
            .select_related("emoji", "deposit")
            .order_by("-updated_at", "-created_at", "-id")
        )
        for reaction in guest_reactions:
            if reaction.deposit_id not in latest_guest_reaction_by_deposit:
                latest_guest_reaction_by_deposit[reaction.deposit_id] = reaction
            else:
                reaction.delete()
                reactions_deleted += 1

        for deposit_id, guest_reaction in latest_guest_reaction_by_deposit.items():
            target_reactions = list(
                Reaction.objects.filter(user=target, deposit_id=deposit_id)
                .order_by("-updated_at", "-created_at", "-id")
            )
            target_reaction = target_reactions[0] if target_reactions else None

            for duplicate in target_reactions[1:]:
                duplicate.delete()
                reactions_deleted += 1

            if not target_reaction:
                try:
                    guest_reaction.user = target
                    guest_reaction.save(update_fields=["user"])
                    reactions_moved += 1
                except IntegrityError:
                    Reaction.objects.filter(pk=guest_reaction.pk).delete()
                    reactions_deleted += 1
                continue

            guest_stamp = guest_reaction.updated_at or guest_reaction.created_at
            target_stamp = target_reaction.updated_at or target_reaction.created_at

            if guest_stamp and target_stamp and guest_stamp > target_stamp:
                if target_reaction.emoji_id != guest_reaction.emoji_id:
                    target_reaction.emoji_id = guest_reaction.emoji_id
                    target_reaction.save(update_fields=["emoji", "updated_at"])
                else:
                    target_reaction.save(update_fields=["updated_at"])
                reactions_updated += 1

            guest_reaction.delete()
            reactions_deleted += 1

        # -----------------------------
        # 6) Comments
        # -----------------------------
        # Règle en cas de collision :
        # si le target a déjà un commentaire sur le même dépôt,
        # on détache le commentaire guest (user=None) au lieu de le supprimer,
        # pour éviter de perdre le texte et l’historique de modération.
        comments_moved = 0
        comments_detached = 0

        guest_comments = list(
            Comment.objects.filter(user=guest)
            .select_related("deposit")
            .order_by("created_at", "id")
        )

        for guest_comment in guest_comments:
            target_comment = None
            if guest_comment.deposit_id is not None:
                target_comment = (
                    Comment.objects.filter(
                        user=target,
                        deposit_id=guest_comment.deposit_id,
                    )
                    .exclude(pk=guest_comment.pk)
                    .order_by("created_at", "id")
                    .first()
                )

            if target_comment:
                guest_comment.user = None
                guest_comment.save(update_fields=["user"])
                comments_detached += 1
                continue

            update_fields = ["user"]
            guest_comment.user = target

            new_author_username = target.username or guest_comment.author_username or ""
            new_author_display_name = (
                getattr(target, "display_name", None)
                or target.username
                or guest_comment.author_display_name
                or guest_comment.author_username
                or ""
            )
            new_author_email = target.email or guest_comment.author_email or ""

            if guest_comment.author_username != new_author_username:
                guest_comment.author_username = new_author_username
                update_fields.append("author_username")

            if guest_comment.author_display_name != new_author_display_name:
                guest_comment.author_display_name = new_author_display_name
                update_fields.append("author_display_name")

            if guest_comment.author_email != new_author_email:
                guest_comment.author_email = new_author_email
                update_fields.append("author_email")

            if target_avatar_url and guest_comment.author_avatar_url != target_avatar_url:
                guest_comment.author_avatar_url = target_avatar_url
                update_fields.append("author_avatar_url")

            guest_comment.save(update_fields=update_fields)
            comments_moved += 1

        # -----------------------------
        # 7) Comment reports
        # -----------------------------
        # Même logique :
        # si le target a déjà report le même commentaire,
        # on détache le report guest (reporter=None) au lieu de le supprimer.
        reports_moved = 0
        reports_detached = 0
        touched_report_comment_ids = set()

        guest_reports = list(
            CommentReport.objects.filter(reporter=guest)
            .select_related("comment")
            .order_by("created_at", "id")
        )

        for report in guest_reports:
            if report.comment_id:
                touched_report_comment_ids.add(report.comment_id)

            existing = None
            if report.comment_id is not None:
                existing = (
                    CommentReport.objects.filter(
                        comment_id=report.comment_id,
                        reporter=target,
                    )
                    .exclude(pk=report.pk)
                    .first()
                )

            if existing:
                report.reporter = None
                report.save(update_fields=["reporter"])
                reports_detached += 1
                continue

            update_fields = ["reporter"]
            report.reporter = target

            new_reporter_username = target.username or report.reporter_username or ""
            new_reporter_email = target.email or report.reporter_email or ""

            if report.reporter_username != new_reporter_username:
                report.reporter_username = new_reporter_username
                update_fields.append("reporter_username")

            if report.reporter_email != new_reporter_email:
                report.reporter_email = new_reporter_email
                update_fields.append("reporter_email")

            report.save(update_fields=update_fields)
            reports_moved += 1

        for comment_id in touched_report_comment_ids:
            reports_count = CommentReport.objects.filter(comment_id=comment_id).count()
            Comment.objects.filter(pk=comment_id).update(reports_count=reports_count)

        # -----------------------------
        # 8) Comment moderation decisions
        # -----------------------------
        moderation_actions_moved = CommentModerationDecision.objects.filter(
            acted_by=guest
        ).update(acted_by=target)

        # -----------------------------
        # 9) Comment restrictions
        # -----------------------------
        restrictions_moved = CommentUserRestriction.objects.filter(
            user=guest
        ).update(user=target)

        restrictions_created_by_moved = CommentUserRestriction.objects.filter(
            created_by=guest
        ).update(created_by=target)

        # -----------------------------
        # 10) Comment attempt logs
        # -----------------------------
        attempt_logs_moved = CommentAttemptLog.objects.filter(
            user=guest
        ).update(user=target)

        # -----------------------------
        # 11) Articles
        # -----------------------------
        articles_moved = Article.objects.filter(author=guest).update(author=target)

        # -----------------------------
        # 12) Provider connections
        # -----------------------------
        merge_provider_connections(guest, target)

        # -----------------------------
        # 13) Réécriture des snapshots historiques
        # -----------------------------
        comment_owner_snapshots_updated = Comment.objects.filter(
            Q(deposit_id__in=guest_deposit_ids) | Q(deposit_owner_user_id=guest.id)
        ).update(
            deposit_owner_user_id=target.id,
            deposit_owner_username=target.username or "",
        )

        attempt_owner_snapshots_updated = CommentAttemptLog.objects.filter(
            Q(deposit_id__in=guest_deposit_ids) | Q(target_owner_user_id=guest.id)
        ).update(
            target_owner_user_id=target.id,
            target_owner_username=target.username or "",
        )

        # -----------------------------
        # 14) Suppression du guest
        # -----------------------------
        guest.delete()

    return {
        "merged": True,
        "points_added": points_added,
        "moved_deposits": moved_deposits,
        "emoji_rights_moved": emoji_rights_moved,
        "emoji_rights_deleted": emoji_rights_deleted,
        "discoveries_moved": discoveries_moved,
        "discoveries_merged": discoveries_merged,
        "reactions_moved": reactions_moved,
        "reactions_updated": reactions_updated,
        "reactions_deleted": reactions_deleted,
        "comments_moved": comments_moved,
        "comments_detached": comments_detached,
        "reports_moved": reports_moved,
        "reports_detached": reports_detached,
        "moderation_actions_moved": moderation_actions_moved,
        "restrictions_moved": restrictions_moved,
        "restrictions_created_by_moved": restrictions_created_by_moved,
        "attempt_logs_moved": attempt_logs_moved,
        "articles_moved": articles_moved,
        "provider_connections_merged": True,
        "comment_owner_snapshots_updated": comment_owner_snapshots_updated,
        "attempt_owner_snapshots_updated": attempt_owner_snapshots_updated,
    }

