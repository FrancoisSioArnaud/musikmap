from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework import status

from box_management.models import Box, BoxSession
from la_boite_a_son.api_errors import api_error
from users.utils import get_current_app_user, touch_last_seen

BOX_SESSION_DURATION_MINUTES = int(getattr(settings, "BOX_SESSION_DURATION_MINUTES", 20) or 20)


def get_box_by_slug(box_slug):
    box_slug = (box_slug or "").strip()
    if not box_slug:
        return None
    return Box.objects.select_related("client").filter(url=box_slug).first()


def is_box_session_active(session):
    return bool(session and getattr(session, "expires_at", None) and session.expires_at > timezone.now())


def get_active_box_session(user, box):
    if not user or not box:
        return None
    now = timezone.now()
    return BoxSession.objects.filter(user=user, box=box, expires_at__gt=now).order_by("-expires_at", "-id").first()


def serialize_box_identity(box):
    if not box:
        return None
    return {
        "id": getattr(box, "id", None),
        "slug": getattr(box, "slug", None) or getattr(box, "url", None),
        "name": getattr(box, "name", None),
        "client_slug": getattr(getattr(box, "client", None), "slug", None),
    }


def serialize_box_session(session):
    if not session:
        return None
    remaining_seconds = max(0, int((session.expires_at - timezone.now()).total_seconds()))
    return {
        "started_at": session.started_at.isoformat() if session.started_at else None,
        "expires_at": session.expires_at.isoformat() if session.expires_at else None,
        "remaining_seconds": remaining_seconds,
    }


def open_box_session_for_user(user, box):
    now = timezone.now()
    expires_at = now + timedelta(minutes=BOX_SESSION_DURATION_MINUTES)
    session, _created = BoxSession.objects.update_or_create(
        user=user,
        box=box,
        defaults={
            "started_at": now,
            "expires_at": expires_at,
        },
    )
    return session


def session_payload_for_box(session, box):
    return {
        "active": is_box_session_active(session),
        "box": serialize_box_identity(box),
        "session": serialize_box_session(session),
    }


def ensure_active_session_for_box_or_response(request, box):
    current_user = get_current_app_user(request)
    if not current_user:
        return None, api_error(status.HTTP_403_FORBIDDEN, "BOX_SESSION_REQUIRED", "Ouvre la boîte pour continuer.")

    active_session = get_active_box_session(current_user, box)
    if not active_session:
        return None, api_error(status.HTTP_403_FORBIDDEN, "BOX_SESSION_REQUIRED", "Ouvre la boîte pour continuer.")

    touch_last_seen(current_user)
    return current_user, None
