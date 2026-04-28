from django.utils import timezone


def get_last_read_at_for_user(thread, user):
    if user.id == thread.user_a_id:
        return thread.user_a_last_read_at
    if user.id == thread.user_b_id:
        return thread.user_b_last_read_at
    return None


def set_last_read_at_for_user(thread, user, dt=None):
    next_dt = dt or timezone.now()
    if user.id == thread.user_a_id:
        thread.user_a_last_read_at = next_dt
        thread.save(update_fields=["user_a_last_read_at", "updated_at"])
        return next_dt
    if user.id == thread.user_b_id:
        thread.user_b_last_read_at = next_dt
        thread.save(update_fields=["user_b_last_read_at", "updated_at"])
        return next_dt
    return None


def thread_has_unread_for_user(thread, user):
    last_read_at = get_last_read_at_for_user(thread, user)
    last_received_message = (
        thread.messages.exclude(sender_id=user.id).order_by("-created_at", "-id").first()
    )
    if not last_received_message:
        return False
    if not last_read_at:
        return True
    return last_received_message.created_at > last_read_at
