from django.utils import timezone

from private_messages.models import ChatThread


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
        "image_url": song.image_url,
        "image_url_small": song.image_url_small,
    }


def _build_message_payload(message):
    return {
        "id": message.id,
        "message_type": message.message_type,
        "text": message.text,
        "song": _build_song_payload(message.song),
        "sender": _build_user_payload(message.sender),
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
        "initiator_id": thread.initiator_id,
        "other_user": _build_user_payload(other),
        "accepted_at": thread.accepted_at.isoformat() if thread.accepted_at else None,
        "refused_at": thread.refused_at.isoformat() if thread.refused_at else None,
        "expired_at": thread.expired_at.isoformat() if thread.expired_at else None,
        "expires_at": thread.expires_at.isoformat() if thread.expires_at else None,
        "updated_at": thread.updated_at.isoformat() if thread.updated_at else None,
        "is_pending_sent": thread.status == ChatThread.STATUS_PENDING and thread.initiator_id == current_user.id,
        "is_pending_received": thread.status == ChatThread.STATUS_PENDING and thread.initiator_id != current_user.id,
        "messages": [_build_message_payload(message) for message in messages],
        "last_message": _build_message_payload(last_message) if last_message else None,
        "server_time": timezone.now().isoformat(),
    }
