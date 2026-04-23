from box_management.selectors.incitations import get_client_phrase_by_id, get_client_phrases
from box_management.selectors.incitations_overlap import (
    _build_incitation_overlap_counts,
    _get_incitation_overlap_queryset,
)


def sort_incitations_for_today(phrases, today):
    def sort_key(item):
        if item.is_active_on_date(today):
            return (0, item.start_date, item.created_at, item.id)
        if item.is_future_on_date(today):
            return (1, item.start_date, item.created_at, item.id)
        return (2, -item.end_date.toordinal(), -item.created_at.timestamp(), -item.id)

    phrases.sort(key=sort_key)
    return phrases


def list_client_incitations(user, today):
    phrases = get_client_phrases(user)
    overlap_counts = _build_incitation_overlap_counts(phrases)
    return {"phrases": sort_incitations_for_today(phrases, today), "overlap_counts": overlap_counts}


def create_incitation(user, serializer, force_overlap):
    start_date = serializer.validated_data.get("start_date")
    end_date = serializer.validated_data.get("end_date")

    overlap_qs = _get_incitation_overlap_queryset(
        client_id=user.client_id,
        start_date=start_date,
        end_date=end_date,
    )

    if overlap_qs.exists() and not force_overlap:
        return None, {"overlap_qs": overlap_qs}

    phrase = serializer.save(client_id=user.client_id)
    return {"phrase": phrase}, None


def get_incitation_or_none(user, incitation_id):
    return get_client_phrase_by_id(user, incitation_id)


def update_incitation(phrase, serializer, force_overlap):
    start_date = serializer.validated_data.get("start_date", phrase.start_date)
    end_date = serializer.validated_data.get("end_date", phrase.end_date)

    overlap_qs = _get_incitation_overlap_queryset(
        client_id=phrase.client_id,
        start_date=start_date,
        end_date=end_date,
        exclude_id=phrase.id,
    )

    if overlap_qs.exists() and not force_overlap:
        return None, {"overlap_qs": overlap_qs}

    phrase = serializer.save()
    return {"phrase": phrase}, None
