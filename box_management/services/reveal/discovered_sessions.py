from django.db.models import Prefetch

from box_management.builders.deposit_payloads import build_deposits_payload, build_user_payload_from_instance
from box_management.models import DiscoveredSong, Reaction


def _discovered_events_for_user(user):
    return list(
        DiscoveredSong.objects.filter(user_id=user.id)
        .select_related("deposit", "deposit__song", "deposit__user", "deposit__box", "link_sender")
        .prefetch_related(
            Prefetch(
                "deposit__reactions",
                queryset=Reaction.objects.select_related("emoji", "user", "deposit").order_by("created_at", "id"),
                to_attr="prefetched_reactions",
            )
        )
        .order_by("discovered_at", "id")
    )


def _deposit_payload_builder(events, user):
    deposits = [ds.deposit for ds in events]
    unique_deposits = []
    seen_ids = set()
    for deposit in deposits:
        if deposit.pk not in seen_ids:
            seen_ids.add(deposit.pk)
            unique_deposits.append(deposit)

    deposits_payload_list = build_deposits_payload(
        unique_deposits, viewer=user, include_user=True, include_deposit_time=False
    )
    deposit_payload_by_id = {dep.pk: payload for dep, payload in zip(unique_deposits, deposits_payload_list)}

    def deposit_payload(discovered_song):
        dep = discovered_song.deposit
        base = deposit_payload_by_id.get(dep.pk, {})
        return {
            **base,
            "type": discovered_song.discovered_type,
            "context": discovered_song.context or "box",
            "discovered_at": discovered_song.discovered_at.isoformat(),
            "deposit_id": dep.pk,
        }

    return deposit_payload


def build_discovered_sessions_payload(user, limit, offset):
    events = _discovered_events_for_user(user)

    if not events:
        return {"sessions": [], "limit": limit, "offset": offset, "has_more": False, "next_offset": offset}

    deposit_payload = _deposit_payload_builder(events, user)

    sessions_all = []
    consumed = [False] * len(events)
    box_main_indices = [
        index
        for index, event in enumerate(events)
        if (event.context or "box") == "box" and event.discovered_type == "main"
    ]

    for idx, main_index in enumerate(box_main_indices):
        main_ds = events[main_index]
        box = main_ds.deposit.box
        if not box:
            consumed[main_index] = True
            continue
        next_main_index = box_main_indices[idx + 1] if (idx + 1) < len(box_main_indices) else len(events)
        deposits_list = [deposit_payload(main_ds)]
        consumed[main_index] = True
        for event_index in range(main_index + 1, next_main_index):
            ds = events[event_index]
            if (
                consumed[event_index]
                or (ds.context or "box") != "box"
                or ds.discovered_type != "revealed"
                or ds.deposit.box_id != box.id
            ):
                continue
            deposits_list.append(deposit_payload(ds))
            consumed[event_index] = True
        sessions_all.append(
            {
                "session_id": f"box-{main_ds.id}",
                "session_type": "box",
                "box": {"id": box.id, "name": box.name, "url": box.url},
                "started_at": main_ds.discovered_at.isoformat(),
                "deposits": deposits_list,
            }
        )

    next_box_main_pos_from = [None] * len(events)
    next_box_main_idx = None
    for index in range(len(events) - 1, -1, -1):
        next_box_main_pos_from[index] = next_box_main_idx
        event = events[index]
        if (event.context or "box") == "box" and event.discovered_type == "main":
            next_box_main_idx = index

    orphan_counter = 0
    index = 0
    while index < len(events):
        event = events[index]
        if consumed[index]:
            index += 1
            continue
        event_context = event.context or "box"
        if event_context == "profile":
            owner = event.deposit.user
            owner_id = getattr(owner, "id", None)
            deposits_list = []
            start = event.discovered_at
            session_indices = []
            cursor = index
            while cursor < len(events):
                current = events[cursor]
                current_context = current.context or "box"
                current_owner_id = getattr(current.deposit.user, "id", None)
                if current_context != "profile" or current_owner_id != owner_id:
                    break
                deposits_list.append(deposit_payload(current))
                session_indices.append(cursor)
                cursor += 1
            for consumed_index in session_indices:
                consumed[consumed_index] = True
            deposits_list.sort(
                key=lambda deposit: (deposit.get("discovered_at") or "", deposit.get("deposit_id") or 0),
                reverse=True,
            )
            sessions_all.append(
                {
                    "session_id": f"profile-{event.id}",
                    "session_type": "profile",
                    "profile_user": build_user_payload_from_instance(owner),
                    "started_at": start.isoformat(),
                    "deposits": deposits_list,
                }
            )
            index = cursor
            continue
        if event_context == "link":
            consumed[index] = True
            sessions_all.append(
                {
                    "session_id": f"link-{event.id}",
                    "session_type": "link",
                    "link_sender": build_user_payload_from_instance(getattr(event, "link_sender", None)),
                    "started_at": event.discovered_at.isoformat(),
                    "deposits": [deposit_payload(event)],
                }
            )
            index += 1
            continue
        if event.discovered_type == "revealed":
            box = event.deposit.box
            if box:
                stop_at = next_box_main_pos_from[index] if next_box_main_pos_from[index] is not None else len(events)
                deposits_list = [deposit_payload(event)]
                consumed[index] = True
                cursor = index + 1
                while cursor < stop_at:
                    current = events[cursor]
                    if consumed[cursor] or (current.context or "box") != "box":
                        cursor += 1
                        continue
                    if current.discovered_type != "revealed":
                        if current.discovered_type == "main":
                            break
                        cursor += 1
                        continue
                    if current.deposit.box_id != box.id:
                        cursor += 1
                        continue
                    deposits_list.append(deposit_payload(current))
                    consumed[cursor] = True
                    cursor += 1
                sessions_all.append(
                    {
                        "session_id": f"orph-{orphan_counter}",
                        "session_type": "box",
                        "box": {"id": box.id, "name": box.name, "url": box.url},
                        "started_at": event.discovered_at.isoformat(),
                        "deposits": deposits_list,
                    }
                )
                orphan_counter += 1
        index += 1

    sessions_all.sort(key=lambda session: session["started_at"], reverse=True)
    total_sessions = len(sessions_all)
    slice_start = offset
    slice_end = offset + limit
    sessions_page = sessions_all[slice_start:slice_end]
    has_more = slice_end < total_sessions
    next_offset = slice_end if has_more else slice_end
    return {
        "sessions": sessions_page,
        "limit": limit,
        "offset": offset,
        "has_more": has_more,
        "next_offset": next_offset,
    }


__all__ = ["build_discovered_sessions_payload"]
