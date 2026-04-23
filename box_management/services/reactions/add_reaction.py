from django.db import transaction
from rest_framework import status

from box_management.models import Deposit, DiscoveredSong, Emoji, EmojiRight, Reaction
from box_management.selectors.boxes import get_active_box_session
from box_management.selectors.deposits import get_deposit_for_reaction, get_deposit_with_reactions
from users.models import CustomUser


def add_or_remove_reaction(*, user, dep_public_key, emoji_id):
    deposit = get_deposit_for_reaction(dep_public_key)
    if not deposit:
        return None, {"status": status.HTTP_404_NOT_FOUND, "code": "DEPOSIT_NOT_FOUND", "detail": "Dépôt introuvable"}

    if (
        getattr(deposit, "box", None)
        and getattr(deposit, "deposit_type", Deposit.DEPOSIT_TYPE_BOX)
        in (
            Deposit.DEPOSIT_TYPE_BOX,
            Deposit.DEPOSIT_TYPE_PINNED,
        )
        and not get_active_box_session(user, deposit.box)
    ):
        return None, {
            "status": status.HTTP_403_FORBIDDEN,
            "code": "BOX_SESSION_REQUIRED",
            "detail": "Ouvre la boîte pour continuer.",
        }

    is_revealed_for_user = bool(
        getattr(deposit, "user_id", None) == getattr(user, "id", None)
        or getattr(deposit, "deposit_type", Deposit.DEPOSIT_TYPE_BOX)
        in (Deposit.DEPOSIT_TYPE_FAVORITE, Deposit.DEPOSIT_TYPE_PINNED)
        or DiscoveredSong.objects.filter(user=user, deposit=deposit).exists()
    )
    if not is_revealed_for_user:
        return None, {
            "status": status.HTTP_403_FORBIDDEN,
            "code": "DEPOSIT_NOT_REVEALED",
            "detail": "Écoute la chanson avant de réagir",
        }

    if emoji_id in (None, "", 0, "none"):
        with transaction.atomic():
            locked_user = CustomUser.objects.select_for_update().get(pk=user.pk)
            Reaction.objects.filter(user=locked_user, deposit=deposit).delete()
        return {"deposit": get_deposit_with_reactions(deposit.pk), "my_reaction": None}, None

    emoji = Emoji.objects.filter(id=emoji_id, active=True).first()
    if not emoji:
        return None, {"status": status.HTTP_404_NOT_FOUND, "code": "EMOJI_NOT_FOUND", "detail": "Emoji invalide"}

    with transaction.atomic():
        locked_user = CustomUser.objects.select_for_update().get(pk=user.pk)
        if int(emoji.cost or 0) > 0 and not EmojiRight.objects.filter(user=locked_user, emoji=emoji).exists():
            return None, {
                "status": status.HTTP_403_FORBIDDEN,
                "code": "EMOJI_NOT_UNLOCKED",
                "detail": "Emoji non débloqué",
            }
        Reaction.objects.filter(user=locked_user, deposit=deposit).delete()
        Reaction.objects.create(user=locked_user, deposit=deposit, emoji=emoji)

    return {"deposit": get_deposit_with_reactions(deposit.pk), "my_reaction_emoji_id": emoji.id}, None
