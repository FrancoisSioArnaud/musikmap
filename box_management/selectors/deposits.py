from django.db.models import Prefetch

from box_management.models import Deposit, Reaction


def get_deposit_for_reveal(public_key):
    return Deposit.objects.select_related("song", "box").filter(public_key=public_key).first()


def get_deposit_for_reaction(public_key):
    return Deposit.objects.select_related("box").filter(public_key=public_key).first()


def get_deposit_for_comment(public_key):
    return Deposit.objects.select_related("user", "box__client").filter(public_key=public_key).first()


def get_deposit_with_reactions(deposit_id):
    return (
        Deposit.objects.filter(pk=deposit_id)
        .prefetch_related(
            Prefetch(
                "reactions",
                queryset=Reaction.objects.select_related("emoji", "user").order_by("created_at", "id"),
                to_attr="prefetched_reactions",
            )
        )
        .first()
    )
