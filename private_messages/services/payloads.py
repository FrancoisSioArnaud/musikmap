from django.utils import timezone

from private_messages.models import ChatThread
from private_messages.services.read_state import thread_has_unread_for_user


def _build_user_payload(user):
    picture_url = None
    if getattr(user, "profile_picture", None):
        try:
            picture_url = user.profile_picture.url
        except Exception:
            picture_url = None
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "profile_picture_url": picture_url,
    }


def _build_song_payload(song):
    if not song:
        return None
    return {
        "id": song.id,
        "public_key": song.public_key,
        "title": song.title,
        "artist": song.artist,
        "image_url_small": song.image_url_small,
    }


def _build_thread_message_payload(message):
    return {
        "id": message.id,
        "message_type": message.message_type,
        "text": message.text,
        "song": _build_song_payload(message.song),
        "sender_id": message.sender_id,
        "created_at": message.created_at.isoformat() if message.created_at else None,
    }


def _build_last_message_payload(message):
    return {
        "id": message.id,
        "message_type": message.message_type,
        "text_preview": message.text if message.message_type == "text" else None,
        "song": _build_song_payload(message.song),
        "sender_id": message.sender_id,
        "created_at": message.created_at.isoformat() if message.created_at else None,
    }


def build_thread_payload(thread, current_user):
    thread.ensure_not_expired()
    other = thread.other_user(current_user)
    messages = list(thread.messages.select_related("sender", "song").all())
    last_message = messages[-1] if messages else None

    return {
        "id": thread.id,
        "status": thread.status,
        "other_user": _build_user_payload(other),
        "updated_at": thread.updated_at.isoformat() if thread.updated_at else None,
        "has_unread": thread_has_unread_for_user(thread, current_user),
        "unread_count": 1 if thread_has_unread_for_user(thread, current_user) else 0,
        "messages": [_build_thread_message_payload(message) for message in messages],
        "last_message": _build_last_message_payload(last_message) if last_message else None,
        "server_time": timezone.now().isoformat(),
    }


def build_summary_thread_payload(thread, current_user):
    thread.ensure_not_expired()
    other = thread.other_user(current_user)
    last_message = thread.messages.select_related("song").order_by("-created_at", "-id").first()
    has_unread = thread_has_unread_for_user(thread, current_user)

    return {
        "id": thread.id,
        "status": thread.status,
        "other_user": _build_user_payload(other),
        "last_message": _build_last_message_payload(last_message) if last_message else None,
        "has_unread": has_unread,
        "unread_count": 1 if has_unread else 0,
        "updated_at": thread.updated_at.isoformat() if thread.updated_at else None,
    }
