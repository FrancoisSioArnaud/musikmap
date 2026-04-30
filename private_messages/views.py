from datetime import timedelta

from django.core.cache import cache
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from box_management.provider_services import (
    get_or_create_song_from_track,
    normalize_track_payload,
    upsert_song_provider_link,
)
from la_boite_a_son.api_errors import api_error
from private_messages.models import ChatMessage, ChatThread
from private_messages.selectors.threads import get_thread_for_users, list_threads_for_user, sorted_pair
from private_messages.services.moderation import validate_message_text
from private_messages.services.payloads import build_summary_thread_payload, build_thread_payload
from private_messages.services.read_state import set_last_read_at_for_user
from users.utils import get_current_app_user, touch_last_seen

RATE_LIMIT_WINDOW_SECONDS = 10
RATE_LIMIT_MAX_MESSAGES = 5
REFUSAL_COOLDOWN_DAYS = 30


def _get_authenticated_non_guest_user(request):
    user = get_current_app_user(request)
    if not user:
        return None, api_error(status.HTTP_401_UNAUTHORIZED, "AUTH_REQUIRED", "Utilisateur non connecté.")
    if getattr(user, "is_guest", False):
        return None, api_error(status.HTTP_403_FORBIDDEN, "ACCOUNT_COMPLETION_REQUIRED", "Finalise d’abord ton compte.")
    touch_last_seen(user)
    return user, None


def _check_rate_limit(user_id):
    key = f"chat:rate:{user_id}"
    now = int(timezone.now().timestamp())
    entries = cache.get(key) or []
    valid_entries = [stamp for stamp in entries if now - stamp < RATE_LIMIT_WINDOW_SECONDS]
    if len(valid_entries) >= RATE_LIMIT_MAX_MESSAGES:
        return False
    valid_entries.append(now)
    cache.set(key, valid_entries, RATE_LIMIT_WINDOW_SECONDS)
    return True


def _thread_accessible_by_user(thread, user):
    return user.id in {thread.user_a_id, thread.user_b_id}


def _get_thread_for_user_or_404(thread_id, user):
    thread = get_object_or_404(ChatThread.objects.select_related("user_a", "user_b", "initiator"), pk=thread_id)
    if not _thread_accessible_by_user(thread, user):
        return None
    thread.ensure_not_expired()
    return thread


class MessageSummaryView(APIView):
    def get(self, request, format=None):
        user, error = _get_authenticated_non_guest_user(request)
        if error:
            return error

        received_requests = []
        conversations = []

        for thread in list_threads_for_user(user.id):
            payload = build_summary_thread_payload(thread, user)
            is_pending_received = thread.status == ChatThread.STATUS_PENDING and thread.initiator_id != user.id
            if is_pending_received:
                received_requests.append(payload)
            if thread.status == ChatThread.STATUS_ACCEPTED:
                conversations.append(payload)

        unread_conversations_count = sum(1 for item in conversations if item.get("has_unread"))
        pending_invitations_count = len(received_requests)

        return Response(
            {
                "received_requests": received_requests,
                "conversations": conversations,
                "unread_conversations_count": unread_conversations_count,
                "pending_invitations_count": pending_invitations_count,
            },
            status=status.HTTP_200_OK,
        )


class MessageThreadDetailView(APIView):
    def get(self, request, thread_id, format=None):
        user, error = _get_authenticated_non_guest_user(request)
        if error:
            return error

        thread = _get_thread_for_user_or_404(thread_id, user)
        if not thread:
            return api_error(status.HTTP_404_NOT_FOUND, "THREAD_NOT_FOUND", "Discussion introuvable.")

        set_last_read_at_for_user(thread, user, timezone.now())
        return Response(build_thread_payload(thread, user), status=status.HTTP_200_OK)


class MessageThreadByUsernameDetailView(APIView):
    def get(self, request, username, format=None):
        user, error = _get_authenticated_non_guest_user(request)
        if error:
            return error

        from users.models import CustomUser

        target = CustomUser.objects.filter(username__iexact=username, is_guest=False).first()
        if not target:
            return api_error(status.HTTP_404_NOT_FOUND, "USER_NOT_FOUND", "Utilisateur introuvable.")

        if target.id == user.id:
            return api_error(status.HTTP_400_BAD_REQUEST, "SELF_CHAT_FORBIDDEN", "Tu ne peux pas t’écrire à toi-même.")

        thread = get_thread_for_users(user.id, target.id)
        if thread:
            thread.ensure_not_expired()
            set_last_read_at_for_user(thread, user, timezone.now())
            return Response(build_thread_payload(thread, user), status=status.HTTP_200_OK)

        return Response(
            {
                "id": None,
                "status": "new",
                "other_user": {
                    "id": target.id,
                    "username": target.username,
                    "display_name": target.display_name,
                    "profile_picture_url": target.profile_picture.url if getattr(target, "profile_picture", None) else None,
                },
                "has_unread": False,
                "unread_count": 0,
                "updated_at": None,
                "server_time": timezone.now().isoformat(),
                "messages": [],
            },
            status=status.HTTP_200_OK,
        )


class MessageThreadStartView(APIView):
    def post(self, request, format=None):
        user, error = _get_authenticated_non_guest_user(request)
        if error:
            return error

        target_user_id = request.data.get("target_user_id")
        option = request.data.get("song") or {}
        text = request.data.get("text") or ""

        valid_text, normalized_text = validate_message_text(text)
        if not valid_text:
            return api_error(status.HTTP_400_BAD_REQUEST, "MESSAGE_TEXT_INVALID", normalized_text)

        try:
            target_user_id = int(target_user_id)
        except (TypeError, ValueError):
            return api_error(status.HTTP_400_BAD_REQUEST, "TARGET_USER_REQUIRED", "Destinataire invalide.")

        if target_user_id == user.id:
            return api_error(status.HTTP_400_BAD_REQUEST, "SELF_CHAT_FORBIDDEN", "Tu ne peux pas t’écrire à toi-même.")

        from users.models import CustomUser

        target = CustomUser.objects.filter(pk=target_user_id, is_guest=False).first()
        if not target:
            return api_error(status.HTTP_404_NOT_FOUND, "TARGET_USER_NOT_FOUND", "Utilisateur introuvable.")

        if not getattr(target, "allow_private_message_requests", True):
            return api_error(
                status.HTTP_403_FORBIDDEN, "PRIVATE_MESSAGES_DISABLED", "Ce profil n’accepte pas les demandes privées."
            )

        track = normalize_track_payload(option)
        if not track.get("title") or not (track.get("artists") or []):
            return api_error(
                status.HTTP_400_BAD_REQUEST, "SONG_REQUIRED", "La première demande doit contenir une chanson."
            )

        left_id, right_id = sorted_pair(user.id, target.id)
        now = timezone.now()

        with transaction.atomic():
            thread = (
                ChatThread.objects.select_for_update()
                .select_related("user_a", "user_b", "initiator")
                .filter(user_a_id=left_id, user_b_id=right_id)
                .first()
            )
            if thread:
                thread.ensure_not_expired()

            if thread and thread.status == ChatThread.STATUS_ACCEPTED:
                return Response(
                    {"thread_id": thread.id, "status": "accepted", "created": False}, status=status.HTTP_200_OK
                )

            if thread and thread.status == ChatThread.STATUS_PENDING:
                return Response(
                    {"thread_id": thread.id, "status": "pending", "created": False}, status=status.HTTP_200_OK
                )

            if thread and thread.status == ChatThread.STATUS_REFUSED and thread.refused_at:
                if thread.refused_at + timedelta(days=REFUSAL_COOLDOWN_DAYS) > now:
                    return api_error(
                        status.HTTP_409_CONFLICT,
                        "THREAD_COOLDOWN_ACTIVE",
                        "Cette demande n’a pas été acceptée. Réessaie plus tard.",
                    )

            song = get_or_create_song_from_track(track)
            upsert_song_provider_link(song, track)

            if not thread:
                thread = ChatThread.objects.create(
                    user_a_id=left_id,
                    user_b_id=right_id,
                    initiator_id=user.id,
                    status=ChatThread.STATUS_PENDING,
                    accepted_at=None,
                    refused_at=None,
                    expired_at=None,
                    user_a_last_read_at=now if left_id == user.id else None,
                    user_b_last_read_at=now if right_id == user.id else None,
                )
            else:
                thread.initiator_id = user.id
                thread.status = ChatThread.STATUS_PENDING
                thread.accepted_at = None
                thread.refused_at = None
                thread.expired_at = None
                thread.user_a_last_read_at = now if left_id == user.id else None
                thread.user_b_last_read_at = now if right_id == user.id else None
                thread.save(
                    update_fields=[
                        "initiator",
                        "status",
                        "accepted_at",
                        "refused_at",
                        "expired_at",
                        "user_a_last_read_at",
                        "user_b_last_read_at",
                        "updated_at",
                    ]
                )
                thread.messages.all().delete()

            ChatMessage.objects.create(
                thread=thread,
                sender=user,
                message_type=ChatMessage.TYPE_SONG,
                text=normalized_text,
                song=song,
            )
            set_last_read_at_for_user(thread, user, now)

        return Response(
            {"thread_id": thread.id, "status": thread.status, "created": True}, status=status.HTTP_201_CREATED
        )


class MessageThreadReplyView(APIView):
    def post(self, request, thread_id, format=None):
        user, error = _get_authenticated_non_guest_user(request)
        if error:
            return error

        if not _check_rate_limit(user.id):
            return api_error(status.HTTP_429_TOO_MANY_REQUESTS, "RATE_LIMITED", "Tu envoies des messages trop vite.")

        text = request.data.get("text") or ""
        option = request.data.get("song")

        valid_text, normalized_text = validate_message_text(text)
        if not valid_text:
            return api_error(status.HTTP_400_BAD_REQUEST, "MESSAGE_TEXT_INVALID", normalized_text)

        with transaction.atomic():
            thread = _get_thread_for_user_or_404(thread_id, user)
            if not thread:
                return api_error(status.HTTP_404_NOT_FOUND, "THREAD_NOT_FOUND", "Discussion introuvable.")

            if thread.status in {ChatThread.STATUS_REFUSED, ChatThread.STATUS_EXPIRED}:
                return api_error(status.HTTP_409_CONFLICT, "THREAD_CLOSED", "Cette discussion est clôturée.")

            if thread.status == ChatThread.STATUS_PENDING and thread.initiator_id == user.id:
                return api_error(
                    status.HTTP_409_CONFLICT,
                    "THREAD_PENDING_WAIT_REPLY",
                    "En attente de réponse du destinataire.",
                )

            message_type = None
            song = None
            if option:
                track = normalize_track_payload(option)
                if not track.get("title") or not (track.get("artists") or []):
                    return api_error(status.HTTP_400_BAD_REQUEST, "SONG_INVALID", "Chanson invalide.")
                song = get_or_create_song_from_track(track)
                upsert_song_provider_link(song, track)
                message_type = ChatMessage.TYPE_SONG
            elif normalized_text:
                message_type = ChatMessage.TYPE_TEXT
            else:
                return api_error(status.HTTP_400_BAD_REQUEST, "MESSAGE_EMPTY", "Le message ne peut pas être vide.")

            if thread.status == ChatThread.STATUS_PENDING and thread.initiator_id != user.id:
                thread.status = ChatThread.STATUS_ACCEPTED
                thread.accepted_at = timezone.now()
                thread.save(update_fields=["status", "accepted_at", "updated_at"])

            ChatMessage.objects.create(
                thread=thread,
                sender=user,
                message_type=message_type,
                text=normalized_text,
                song=song,
            )
            set_last_read_at_for_user(thread, user, timezone.now())

        return Response({"thread_id": thread.id, "status": thread.status}, status=status.HTTP_200_OK)


class MessageThreadRefuseView(APIView):
    def post(self, request, thread_id, format=None):
        user, error = _get_authenticated_non_guest_user(request)
        if error:
            return error

        with transaction.atomic():
            thread = _get_thread_for_user_or_404(thread_id, user)
            if not thread:
                return api_error(status.HTTP_404_NOT_FOUND, "THREAD_NOT_FOUND", "Discussion introuvable.")

            if thread.status != ChatThread.STATUS_PENDING:
                return api_error(status.HTTP_409_CONFLICT, "THREAD_NOT_PENDING", "La demande n’est plus en attente.")
            if thread.initiator_id == user.id:
                return api_error(status.HTTP_403_FORBIDDEN, "REFUSE_FORBIDDEN", "Seul le destinataire peut refuser.")

            thread.status = ChatThread.STATUS_REFUSED
            thread.refused_at = timezone.now()
            thread.save(update_fields=["status", "refused_at", "updated_at"])

        return Response({"thread_id": thread.id, "status": thread.status}, status=status.HTTP_200_OK)


class MessageSettingsView(APIView):
    def post(self, request, format=None):
        user, error = _get_authenticated_non_guest_user(request)
        if error:
            return error

        allow_private = bool(request.data.get("allow_private_message_requests"))
        user.allow_private_message_requests = allow_private
        user.save(update_fields=["allow_private_message_requests"])
        return Response({"allow_private_message_requests": allow_private}, status=status.HTTP_200_OK)


class MessageThreadStatusView(APIView):
    def get(self, request, username, format=None):
        user, error = _get_authenticated_non_guest_user(request)
        if error:
            return error

        from users.models import CustomUser

        target = CustomUser.objects.filter(username__iexact=username, is_guest=False).first()
        if not target:
            return api_error(status.HTTP_404_NOT_FOUND, "TARGET_USER_NOT_FOUND", "Utilisateur introuvable.")

        if target.id == user.id:
            return Response({"state": "self", "allow_private_message_requests": False}, status=status.HTTP_200_OK)

        thread = get_thread_for_users(user.id, target.id)
        if thread:
            thread.ensure_not_expired()

        state = "can_start"
        thread_id = None
        if thread:
            thread_id = thread.id
            if thread.status == ChatThread.STATUS_PENDING:
                state = "pending_sent" if thread.initiator_id == user.id else "pending_received"
            elif thread.status == ChatThread.STATUS_ACCEPTED:
                state = "accepted"
            elif thread.status in {ChatThread.STATUS_REFUSED, ChatThread.STATUS_EXPIRED}:
                state = "can_start"

        return Response(
            {
                "state": state,
                "thread_id": thread_id,
                "target_user": {"id": target.id, "username": target.username, "display_name": target.display_name},
                "allow_private_message_requests": bool(getattr(target, "allow_private_message_requests", True)),
            },
            status=status.HTTP_200_OK,
        )
