from box_management.builders.deposit_payloads import build_deposits_payload
from box_management.selectors.deposits import get_user_deposits_queryset


def build_user_deposits_payload(*, target_user, viewer, limit, offset):
    page_qs = list(get_user_deposits_queryset(target_user)[offset : offset + limit + 1])
    has_more = len(page_qs) > limit
    deposits = page_qs[:limit]
    return {
        "items": build_deposits_payload(deposits, viewer=viewer, include_user=False),
        "limit": limit,
        "offset": offset,
        "has_more": has_more,
        "next_offset": offset + len(deposits),
    }


__all__ = ["build_user_deposits_payload"]
