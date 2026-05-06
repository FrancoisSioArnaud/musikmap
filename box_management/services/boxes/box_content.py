from django.db.models import Prefetch, Q
from django.utils.dateparse import parse_datetime

from box_management.builders.deposit_payloads import build_deposits_payload
from box_management.models import Deposit, DiscoveredSong, Reaction
from box_management.services.boxes.session_helpers import get_active_box_session_context
from box_management.services.pinned.pricing import get_active_pinned_deposit_for_box

OLDER_DEPOSITS_PAGE_SIZE = 25
OLDER_DEPOSITS_MAX_PAGE_SIZE = 25


class InvalidOlderDepositsCursor(ValueError):
    pass


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
    payloads = build_deposits_payload(
        [deposit],
        viewer=viewer,
        include_user=True,
        force_song_infos_for=force_song_infos_for,
    )
    return payloads[0] if payloads else None


def serialize_active_pinned_deposit_for_box(box, *, viewer):
    active_pinned = get_active_pinned_deposit_for_box(box)
    return _serialize_one_deposit(active_pinned, viewer=viewer, force_revealed=True)


def build_older_deposits_cursor(deposit):
    if not deposit:
        return None
    return f"{deposit.deposited_at.isoformat()}|{deposit.id}"


def parse_older_deposits_cursor(cursor):
    cursor = (cursor or "").strip()
    if not cursor:
        return None

    try:
        raw_deposited_at, raw_deposit_id = cursor.rsplit("|", 1)
        deposited_at = parse_datetime(raw_deposited_at)
        deposit_id = int(raw_deposit_id)
    except (TypeError, ValueError):
        raise InvalidOlderDepositsCursor("Cursor invalide.")

    if not deposited_at or deposit_id <= 0:
        raise InvalidOlderDepositsCursor("Cursor invalide.")

    return deposited_at, deposit_id


def _coerce_older_deposits_limit(limit):
    try:
        parsed = int(limit)
    except (TypeError, ValueError):
        parsed = OLDER_DEPOSITS_PAGE_SIZE
    if parsed <= 0:
        return OLDER_DEPOSITS_PAGE_SIZE
    return min(parsed, OLDER_DEPOSITS_MAX_PAGE_SIZE)


def _get_main_deposit_for_session(box, session):
    return (
        _box_deposits_queryset(box)
        .filter(deposited_at__lte=session.started_at)
        .order_by("-deposited_at", "-id")
        .first()
    )


def _older_than_filter(deposited_at, deposit_id):
    return Q(deposited_at__lt=deposited_at) | Q(
        deposited_at=deposited_at,
        id__lt=deposit_id,
    )


def get_older_deposits_page(box, user, session, cursor=None, limit=OLDER_DEPOSITS_PAGE_SIZE):
    page_limit = _coerce_older_deposits_limit(limit)
    cursor_value = parse_older_deposits_cursor(cursor)

    if cursor_value:
        cursor_deposited_at, cursor_id = cursor_value
        older_filter = _older_than_filter(cursor_deposited_at, cursor_id)
    else:
        main_deposit = _get_main_deposit_for_session(box, session)
        if not main_deposit:
            return {
                "older_deposits": [],
                "next_cursor": None,
                "has_more": False,
            }
        older_filter = _older_than_filter(main_deposit.deposited_at, main_deposit.id)

    deposits = list(
        _box_deposits_queryset(box)
        .filter(deposited_at__lte=session.started_at)
        .filter(older_filter)
        .order_by("-deposited_at", "-id")[: page_limit + 1]
    )
    page_deposits = deposits[:page_limit]
    has_more = len(deposits) > page_limit
    next_cursor = build_older_deposits_cursor(page_deposits[-1]) if has_more and page_deposits else None

    return {
        "older_deposits": build_deposits_payload(
            page_deposits,
            viewer=user,
            include_user=True,
        ),
        "next_cursor": next_cursor,
        "has_more": has_more,
    }


def get_box_content(request, box_slug):
    context, error = get_active_box_session_context(request, box_slug)
    if error:
        return None, error

    user = context["user"]
    box = context["box"]
    session = context["session"]

    main_deposit = _get_main_deposit_for_session(box, session)
    older_page = get_older_deposits_page(box, user, session, limit=OLDER_DEPOSITS_PAGE_SIZE)

    if main_deposit:
        DiscoveredSong.objects.get_or_create(
            user=user,
            deposit=main_deposit,
            defaults={"discovered_type": "main", "context": "box"},
        )

    return {
        "boxSlug": box.slug,
        "main": _serialize_one_deposit(main_deposit, viewer=user, force_revealed=True),
        "older_deposits": older_page["older_deposits"],
        "older_deposits_next_cursor": older_page["next_cursor"],
        "older_deposits_has_more": older_page["has_more"],
        "active_pinned_deposit": serialize_active_pinned_deposit_for_box(box, viewer=user),
        "my_deposit": _serialize_one_deposit(session.deposit, viewer=user, force_revealed=True),
    }, None
