from box_management.models import IncitationPhrase


def _get_incitation_overlap_queryset(*, client_id, start_date, end_date, exclude_id=None):
    if not client_id or not start_date or not end_date:
        return IncitationPhrase.objects.none()

    qs = IncitationPhrase.objects.for_client(client_id).filter(
        start_date__lte=end_date,
        end_date__gte=start_date,
    )
    if exclude_id:
        qs = qs.exclude(id=exclude_id)
    return qs


def _build_incitation_overlap_counts(phrases):
    phrases = list(phrases or [])
    counts = {}
    for phrase in phrases:
        counts[getattr(phrase, "id", None)] = phrase.get_overlap_count() if getattr(phrase, "id", None) else 0
    return counts


__all__ = ["_build_incitation_overlap_counts", "_get_incitation_overlap_queryset"]
