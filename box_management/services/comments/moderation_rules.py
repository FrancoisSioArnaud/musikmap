import re
from collections.abc import Iterable
from typing import Any

from django.db.models import Q
from django.utils import timezone

from box_management.domain.constants import (
    COMMENT_REASON_DOXXING,
    COMMENT_REASON_EMAIL_FORBIDDEN,
    COMMENT_REASON_EMPTY,
    COMMENT_REASON_HARASSMENT,
    COMMENT_REASON_LINK_FORBIDDEN,
    COMMENT_REASON_PHONE_FORBIDDEN,
    COMMENT_REASON_SPAM,
    COMMENT_REASON_TOO_LONG,
)
from box_management.models import Client, CommentAttemptLog, CommentUserRestriction, Deposit
from users.models import CustomUser

COMMENT_MAX_LENGTH = 100

_COMMENT_URL_RE = re.compile(
    r"(?:https?://|www\.|\b[a-z0-9.-]+\.(?:fr|com|net|org|io|gg|be|de|es|co|app|ly)\b)",
    re.IGNORECASE,
)
_COMMENT_EMAIL_RE = re.compile(r"\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b")
_COMMENT_PHONE_RE = re.compile(r"(?:\+?\d[\d\s().-]{7,}\d)")
_COMMENT_SPAM_REPEAT_RE = re.compile(r"(.)\1{5,}")
_COMMENT_SYMBOL_RE = re.compile(r"[^\w\sÀ-ÿ]")
_COMMENT_INSULT_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in [
        r"\bconnard(?:e)?s?\b",
        r"\bfdp\b",
        r"\bencul[ée]s?\b",
        r"\bta gueule\b",
        r"\bnique ta m[èe]re\b",
        r"\bsale con(?:ne)?\b",
        r"\bsalope\b",
        r"\bb[âa]tard\b",
    ]
]
_COMMENT_DOXX_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in [
        r"\bon sait o[uù] tu habites\b",
        r"\bton adresse\b",
        r"\bton num[ée]ro\b",
        r"\bje vais venir chez toi\b",
        r"\bon va venir chez toi\b",
    ]
]


def _is_full_comment_user(user: CustomUser | None) -> bool:
    return bool(user and getattr(user, "id", None) and not getattr(user, "is_guest", False))


def _get_profile_picture_url(user: CustomUser | None) -> str | None:
    if not user or not getattr(user, "profile_picture", None):
        return None
    try:
        return user.profile_picture.url
    except Exception:
        return None


def _normalize_comment_text(value: str | None) -> str:
    value = str(value or "")
    value = value.replace("​", "").replace("‌", "").replace("‍", "")
    value = re.sub(r"\s+", " ", value).strip()
    value = value.lower()
    return value


def _extract_digits_count(value: str | None) -> int:
    return len(re.sub(r"\D", "", str(value or "")))


def _contains_forbidden_phone(value: str | None) -> bool:
    text = str(value or "")
    if not _COMMENT_PHONE_RE.search(text):
        return False
    return _extract_digits_count(text) >= 8


def _detect_comment_pre_creation_error(text: str):
    if not text:
        return COMMENT_REASON_EMPTY
    if len(text) > COMMENT_MAX_LENGTH:
        return COMMENT_REASON_TOO_LONG
    if _COMMENT_URL_RE.search(text):
        return COMMENT_REASON_LINK_FORBIDDEN
    if _COMMENT_EMAIL_RE.search(text):
        return COMMENT_REASON_EMAIL_FORBIDDEN
    if _contains_forbidden_phone(text):
        return COMMENT_REASON_PHONE_FORBIDDEN
    return None


def _score_comment_risk(*, text: str, normalized_text: str):
    score = 0
    flags = []

    if _COMMENT_SPAM_REPEAT_RE.search(normalized_text):
        score += 50
        flags.append(COMMENT_REASON_SPAM)

    if len(normalized_text) >= 24 and len(set(normalized_text)) <= 4:
        score += 30
        flags.append("low_variation")

    if _COMMENT_SYMBOL_RE.findall(text) and len(_COMMENT_SYMBOL_RE.findall(text)) >= 8:
        score += 15
        flags.append("symbol_noise")

    for pattern in _COMMENT_INSULT_PATTERNS:
        if pattern.search(normalized_text):
            score += 70
            flags.append(COMMENT_REASON_HARASSMENT)
            break

    for pattern in _COMMENT_DOXX_PATTERNS:
        if pattern.search(normalized_text):
            score += 95
            flags.append(COMMENT_REASON_DOXXING)
            break

    return min(score, 100), list(dict.fromkeys(flags))


def _log_blocked_comment_attempt(
    *,
    client: Client | None,
    deposit: Deposit | None,
    user: CustomUser | None,
    text: str,
    normalized_text: str,
    reason_code: str,
    author_ip: str | None = None,
    author_user_agent: str = "",
    meta: dict[str, Any] | None = None,
):
    target_owner = getattr(deposit, "user", None) if deposit else None
    CommentAttemptLog.objects.create(
        client=client,
        deposit=deposit,
        user=user,
        deposit_public_key=getattr(deposit, "public_key", "") or "",
        target_owner_user_id=getattr(target_owner, "id", None),
        target_owner_username=getattr(target_owner, "username", "") or "",
        text=(text or "")[:COMMENT_MAX_LENGTH],
        normalized_text=(normalized_text or "")[:160],
        reason_code=reason_code,
        meta=meta or {},
        author_ip=author_ip,
        author_user_agent=(author_user_agent or "")[:255],
    )


def _get_active_comment_restrictions_for_clients(user: CustomUser | None, client_ids: Iterable[int]):
    if not _is_full_comment_user(user):
        return {}

    clean_client_ids = [cid for cid in set(client_ids or []) if cid]
    if not clean_client_ids:
        return {}

    now_dt = timezone.now()
    restrictions = (
        CommentUserRestriction.objects.filter(user_id=user.id, client_id__in=clean_client_ids, starts_at__lte=now_dt)
        .filter(Q(ends_at__isnull=True) | Q(ends_at__gt=now_dt))
        .order_by("client_id", "-created_at", "-id")
    )

    by_client = {}
    for restriction in restrictions:
        by_client.setdefault(restriction.client_id, restriction)
    return by_client


__all__ = [
    "COMMENT_MAX_LENGTH",
    "_detect_comment_pre_creation_error",
    "_get_active_comment_restrictions_for_clients",
    "_get_profile_picture_url",
    "_log_blocked_comment_attempt",
    "_normalize_comment_text",
    "_score_comment_risk",
]
