from django.db.models import Q

from private_messages.models import ChatThread


def sorted_pair(user_id_a, user_id_b):
    return (user_id_a, user_id_b) if user_id_a < user_id_b else (user_id_b, user_id_a)


def get_thread_for_users(user_a_id, user_b_id):
    left, right = sorted_pair(user_a_id, user_b_id)
    return (
        ChatThread.objects.select_related("user_a", "user_b", "initiator")
        .filter(user_a_id=left, user_b_id=right)
        .first()
    )


def list_threads_for_user(user_id):
    return (
        ChatThread.objects.select_related("user_a", "user_b", "initiator")
        .filter(Q(user_a_id=user_id) | Q(user_b_id=user_id))
        .order_by("-updated_at", "-id")
    )
