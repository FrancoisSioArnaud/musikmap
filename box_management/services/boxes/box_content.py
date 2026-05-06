from django.db.models import Prefetch, Q

from box_management.builders.deposit_payloads import _build_deposits_payload
from box_management.models import Deposit, DiscoveredSong, Reaction
from box_management.services.boxes.session_helpers import get_active_box_session_context
from box_management.services.pinned.pricing import get_active_pinned_deposit_for_box


def _box_deposits_queryset(box):
    return (
        Deposit.objects.filter(box=box, deposit_type=Deposit.DEPOSIT_TYPE_BOX)
        .select_related("song", "box", "user")
        .prefetch_related(
            Prefetch(
                "reactions",
                queryset=Reaction.objects.select_related("emoji", "user").order_by("created_at", "id"),
                to_attr="prefetched_reactions",
            )
        )
    )


def _serialize_one_deposit(deposit, *, viewer, force_revealed=False):
    if not deposit:
        return None
    force_song_infos_for = [deposit.pk] if force_revealed else None
    payloads = _build_deposits_payload(
        [deposit],
        viewer=viewer,
        include_user=True,
        force_song_infos_for=force_song_infos_for,
    )
    return payloads[0] if payloads else None


def serialize_active_pinned_deposit_for_box(box, *, viewer):
    active_pinned = get_active_pinned_deposit_for_box(box)
    return _serialize_one_deposit(active_pinned, viewer=viewer, force_revealed=True)


def _get_main_deposit_for_session(box, session):
    return (
        _box_deposits_queryset(box)
        .filter(deposited_at__lte=session.started_at)
        .order_by("-deposited_at", "-id")
        .first()
    )


def _get_older_deposits_for_main(box, main_deposit):
    if not main_deposit:
        return []

    older_filter = Q(deposited_at__lt=main_deposit.deposited_at) | Q(
        deposited_at=main_deposit.deposited_at,
        id__lt=main_deposit.id,
    )
    return list(_box_deposits_queryset(box).filter(older_filter).order_by("-deposited_at", "-id"))


def get_box_content(request, box_slug):
    context, error = get_active_box_session_context(request, box_slug)
    if error:
        return None, error

    user = context["user"]
    box = context["box"]
    session = context["session"]

    main_deposit = _get_main_deposit_for_session(box, session)
    older_deposits = _get_older_deposits_for_main(box, main_deposit)

    if main_deposit:
        DiscoveredSong.objects.get_or_create(
            user=user,
            deposit=main_deposit,
            defaults={"discovered_type": "main", "context": "box"},
        )

    older_payloads = _build_deposits_payload(
        older_deposits,
        viewer=user,
        include_user=True,
    )

    return {
        "boxSlug": box.slug,
        "main": _serialize_one_deposit(main_deposit, viewer=user, force_revealed=True),
        "older_deposits": older_payloads,
        "active_pinned_deposit": serialize_active_pinned_deposit_for_box(box, viewer=user),
        "my_deposit": _serialize_one_deposit(session.deposit, viewer=user, force_revealed=True),
    }, None
