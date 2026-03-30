# box_management/utils.py

import html
import json
import re
from collections import Counter
from datetime import date, timedelta
from html.parser import HTMLParser
from math import radians, sin, cos, sqrt, atan2
from typing import Any, Dict, List, Optional, Union, Iterable, Sequence, Tuple
from urllib.parse import urljoin, urlparse

import requests
from django.conf import settings
from django.db.models import QuerySet, Prefetch, Q, Count
from django.utils.timezone import localtime, localdate, timezone
from rest_framework import status
from rest_framework.response import Response

from users.models import CustomUser
from .models import Deposit, Reaction, DiscoveredSong, Song, IncitationPhrase

# Barèmes & coûts (importés depuis ton module utils global)
from utils import (
    NB_POINTS_ADD_SONG,
    NB_POINTS_FIRST_DEPOSIT_USER_ON_BOX,
    NB_POINTS_FIRST_SONG_DEPOSIT_BOX,
    NB_POINTS_FIRST_SONG_DEPOSIT_GLOBAL,
    NB_POINTS_CONSECUTIVE_DAYS_BOX,
    COST_REVEAL_BOX,
)



DEFAULT_FLOWBOX_SEARCH_INCITATION_TEXT = (
    "Besoin d’inspiration ? Partage une chanson qui colle à l’ambiance du moment."
)


def _coerce_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    value = (str(value or "").strip().lower())
    return value in {"1", "true", "yes", "y", "on", "oui"}


def _get_active_incitation_for_box(box, at_date=None):
    client_id = getattr(box, "client_id", None)
    if not client_id:
        return None

    current_date = at_date or localdate()
    return (
        IncitationPhrase.objects
        .for_client(client_id)
        .active_on_date(current_date)
        .order_by("-created_at", "-id")
        .first()
    )


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

# --- Helper pour réactions ---
def _reactions_summary_for_deposits(dep_ids):
    """Retourne {deposit_id: [{'emoji': '🔥', 'count': 3}, ...]}"""
    summary = {d: [] for d in dep_ids}
    if not dep_ids:
        return summary

    qs = (
        Reaction.objects
        .filter(deposit_id__in=dep_ids)
        .values("deposit_id", "emoji__char")
        .annotate(count=Count("id"))
    )
    for row in qs:
        did = row["deposit_id"]
        emoji_char = row["emoji__char"]
        cnt = row["count"]
        summary.setdefault(did, []).append({"emoji": emoji_char, "count": cnt})

    for did in summary:
        summary[did].sort(key=lambda x: x["count"], reverse=True)
    return summary


def _get_active_client_user_or_response(request):
    user = request.user

    if not user or not user.is_authenticated:
        return None, Response(
            {"detail": "Authentification requise."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    if not getattr(user, "client_id", None):
        return None, Response(
            {"detail": "Ce compte n'est rattaché à aucun client."},
            status=status.HTTP_403_FORBIDDEN,
        )

    if getattr(user, "portal_status", None) != "active":
        return None, Response(
            {"detail": "Ce compte n'a pas accès au portail client."},
            status=status.HTTP_403_FORBIDDEN,
        )

    if getattr(user, "client_role", "") not in {"client_owner", "client_editor"}:
        return None, Response(
            {"detail": "Ce compte n'a pas les droits nécessaires."},
            status=status.HTTP_403_FORBIDDEN,
        )

    return user, None


class _ArticleImportHTMLParser(HTMLParser):
    BLOCK_TAGS = {
        "p",
        "article",
        "main",
        "section",
        "div",
        "li",
        "h1",
        "h2",
        "h3",
        "blockquote",
    }

    SKIP_TAGS = {
        "script",
        "style",
        "noscript",
        "svg",
        "path",
        "iframe",
        "canvas",
    }

    SKIP_ATTR_KEYWORDS = {
        "nav",
        "menu",
        "header",
        "footer",
        "breadcrumb",
        "cookie",
        "consent",
        "banner",
        "sidebar",
        "toolbar",
        "newsletter",
        "social",
        "share",
        "search",
        "ads",
        "advert",
        "pagination",
    }

    def __init__(self):
        super().__init__()
        self.meta = {}
        self.title_chunks = []

        self.body_chunks = []
        self.paragraph_chunks = []
        self.image_sources = []
        self.favicon_sources = []

        self._in_title = False
        self._skip_depth = 0

        self._paragraph_stack = []
        self._current_paragraph_parts = []

    def _attrs_to_dict(self, attrs):
        return {key.lower(): value for key, value in attrs if key}

    def _should_skip_by_attrs(self, attrs_dict):
        haystack = " ".join(
            [
                attrs_dict.get("id") or "",
                attrs_dict.get("class") or "",
                attrs_dict.get("role") or "",
                attrs_dict.get("aria-label") or "",
            ]
        ).lower()

        return any(keyword in haystack for keyword in self.SKIP_ATTR_KEYWORDS)

    def handle_starttag(self, tag, attrs):
        tag = (tag or "").lower()
        attrs_dict = self._attrs_to_dict(attrs)

        if tag in self.SKIP_TAGS or self._should_skip_by_attrs(attrs_dict):
            self._skip_depth += 1
            return

        if tag == "title":
            self._in_title = True
            return

        if tag == "meta":
            meta_key = (
                attrs_dict.get("property")
                or attrs_dict.get("name")
                or attrs_dict.get("itemprop")
                or ""
            ).strip().lower()
            content = (attrs_dict.get("content") or "").strip()
            if meta_key and content and meta_key not in self.meta:
                self.meta[meta_key] = content
            return

        if tag == "link":
            rel_value = (attrs_dict.get("rel") or "").strip().lower()
            href = (attrs_dict.get("href") or "").strip()
            if href and any(marker in rel_value for marker in ("icon", "apple-touch-icon", "mask-icon")):
                self.favicon_sources.append(href)
            return

        if tag == "img":
            for key in ("src", "data-src", "data-original", "srcset"):
                candidate = (attrs_dict.get(key) or "").strip()
                if candidate:
                    if key == "srcset":
                        candidate = candidate.split(",")[0].strip().split(" ")[0].strip()
                    self.image_sources.append(candidate)
                    break
            return

        if self._skip_depth > 0:
            return

        if tag in {"p", "article", "main", "section", "blockquote"}:
            self._paragraph_stack.append(tag)
            self._current_paragraph_parts.append([])

    def handle_endtag(self, tag):
        tag = (tag or "").lower()

        if tag == "title":
            self._in_title = False
            return

        if self._skip_depth > 0:
            if tag in self.SKIP_TAGS or tag in {
                "nav", "header", "footer", "aside"
            }:
                self._skip_depth -= 1
            return

        if tag in {"p", "article", "main", "section", "blockquote"}:
            if self._paragraph_stack and self._current_paragraph_parts:
                self._paragraph_stack.pop()
                parts = self._current_paragraph_parts.pop()
                text = _collapse_article_text(" ".join(parts))
                if text:
                    self.paragraph_chunks.append(text)

    def handle_data(self, data):
        if not data:
            return

        if self._in_title:
            self.title_chunks.append(data)
            return

        if self._skip_depth > 0:
            return

        cleaned = _collapse_article_text(data)
        if not cleaned:
            return

        self.body_chunks.append(cleaned)

        if self._current_paragraph_parts:
            self._current_paragraph_parts[-1].append(cleaned)

    @property
    def title_text(self):
        return _collapse_article_text(" ".join(self.title_chunks))

    @property
    def body_text(self):
        return _collapse_article_text(" ".join(self.body_chunks))


def _collapse_article_text(value):
    value = html.unescape(value or "")
    value = re.sub(r"\s+", " ", value).strip()
    return value


def _truncate_article_text(value, limit=10000):
    value = _collapse_article_text(value)
    if len(value) <= limit:
        return value

    truncated = value[:limit].rstrip()
    last_space = truncated.rfind(" ")
    if last_space >= max(80, limit // 2):
        truncated = truncated[:last_space].rstrip()
    return truncated


def _absolute_remote_url(base_url, candidate):
    candidate = (candidate or "").strip()
    if not candidate:
        return ""

    if candidate.startswith("//"):
        candidate = f"https:{candidate}"

    absolute = urljoin(base_url, candidate)
    if not absolute.startswith(("http://", "https://")):
        return ""

    return absolute


def _dedupe_keep_order(values, limit=None):
    output = []
    seen = set()

    for value in values:
        normalized = (value or "").strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        output.append(normalized)

        if limit and len(output) >= limit:
            break

    return output


def _pick_best_favicon_url(final_url, parser):
    favicon_candidates = [
        _absolute_remote_url(final_url, href)
        for href in getattr(parser, "favicon_sources", [])
    ]

    parsed = urlparse(final_url)
    if parsed.scheme and parsed.netloc:
        favicon_candidates.append(f"{parsed.scheme}://{parsed.netloc}/favicon.ico")

    favicon_candidates = _dedupe_keep_order(favicon_candidates, limit=5)
    return favicon_candidates[0] if favicon_candidates else ""


def _clean_import_title(title):
    title = _collapse_article_text(title)
    if not title:
        return ""

    title = re.split(r"\s[\-|–|—|•|·|:]\s", title, maxsplit=1)[0].strip()
    title = re.split(r"\s\|\s", title, maxsplit=1)[0].strip()
    return title


def _looks_like_noise_text(text):
    text = _collapse_article_text(text)
    if not text:
        return True

    lowered = text.lower()

    noise_markers = [
        "cookie",
        "consent",
        "accepter",
        "refuser",
        "menu",
        "newsletter",
        "suivez-nous",
        "se connecter",
        "connexion",
        "inscription",
        "publicité",
        "advertisement",
    ]

    if any(marker in lowered for marker in noise_markers):
        return True

    if len(text) < 40:
        return True

    word_count = len(text.split())
    if word_count < 8:
        return True

    return False


def _pick_best_short_text(meta, parser):
    description = _collapse_article_text(
        meta.get("description")
        or meta.get("og:description")
        or meta.get("twitter:description")
    )

    if description and not _looks_like_noise_text(description):
        return _truncate_article_text(description, limit=10000)

    paragraph_candidates = []
    for chunk in parser.paragraph_chunks:
        text = _collapse_article_text(chunk)
        if _looks_like_noise_text(text):
            continue
        paragraph_candidates.append(text)

    paragraph_candidates = _dedupe_keep_order(paragraph_candidates)

    combined = ""
    for text in paragraph_candidates:
        if not combined:
            combined = text
        else:
            combined = f"{combined} {text}"

        if len(combined) >= 220:
            break

    combined = _truncate_article_text(combined, limit=10000)
    if combined:
        return combined

    body_candidates = []
    for piece in parser.body_chunks:
        text = _collapse_article_text(piece)
        if _looks_like_noise_text(text):
            continue
        body_candidates.append(text)

    merged_body = _truncate_article_text(" ".join(body_candidates), limit=10000)
    return merged_body


def _extract_import_preview_from_url(link):
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/123.0.0.0 Safari/537.36"
        ),
        "Accept": (
            "text/html,application/xhtml+xml,application/xml;"
            "q=0.9,image/avif,image/webp,*/*;q=0.8"
        ),
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Upgrade-Insecure-Requests": "1",
    }

    response = requests.get(
        link,
        headers=headers,
        timeout=10,
        allow_redirects=True,
    )
    response.raise_for_status()

    final_url = response.url or link

    content_type = (response.headers.get("Content-Type") or "").lower()
    if "text/html" not in content_type and "application/xhtml+xml" not in content_type:
        raise ValueError("Le lien ne renvoie pas une page HTML.")

    parser = _ArticleImportHTMLParser()
    parser.feed(response.text or "")
    parser.close()

    meta = parser.meta

    raw_title = (
        meta.get("og:title")
        or meta.get("twitter:title")
        or parser.title_text
    )
    title = _clean_import_title(raw_title)

    short_text = _pick_best_short_text(meta, parser)

    image_candidates = []
    for key in (
        "og:image",
        "og:image:url",
        "og:image:secure_url",
        "twitter:image",
        "twitter:image:src",
    ):
        image_candidates.append(_absolute_remote_url(final_url, meta.get(key)))

    for img_src in parser.image_sources:
        image_candidates.append(_absolute_remote_url(final_url, img_src))

    image_candidates = [
        img for img in image_candidates
        if img and not img.lower().endswith(".svg")
    ]
    image_candidates = _dedupe_keep_order(image_candidates, limit=3)
    favicon = _pick_best_favicon_url(final_url, parser)

    return {
        "title": title,
        "short_text": short_text,
        "cover_image": image_candidates[0] if image_candidates else "",
        "cover_images": image_candidates,
        "favicon": favicon,
        "resolved_link": final_url,
    }

# ---------- petits builders "from instance only" ----------

def _build_user_from_instance(user: Optional[CustomUser]) -> Dict[str, Any]:
    default_pic = f"{settings.STATIC_URL.rstrip('/')}/img/default_profile.jpg"
    if not user:
        return 

    pic = getattr(user, "profile_picture", None)
    profile_url = pic.url if pic else default_pic

    return {
        "username": getattr(user, "username", "Anonyme"),
        "profile_pic_url": profile_url,
    }


def _build_song_from_instance(song, hidden: bool) -> Dict[str, Any]:
    """Ne fait AUCUNE requête : lit uniquement l'instance déjà chargée."""
    if hidden:
        return {"image_url": song.image_url}
    return {
        "image_url": song.image_url,
        "title": song.title,
        "artist": song.artist,
        "spotify_url": song.spotify_url or None,
        "deezer_url": song.deezer_url or None,
    }


def _iter_reactions_from_instance(dep: Deposit):
    """
    Utilise en priorité la prefetch list (to_attr). Sinon, une SEULE requête
    jointe (select_related) – mais reste centrée sur l'objet (pas d'ID).
    """
    reacs = getattr(dep, "prefetched_reactions", None)
    if reacs is not None:
        return reacs
    return dep.reactions.select_related("emoji", "user").order_by("created_at", "id").all()


def _build_reactions_from_instance(dep: Deposit, current_user: Optional[CustomUser] = None) -> Dict[str, Any]:
    """Ne refait pas de get par ID : exploite uniquement dep + relations."""
    current_user_id = getattr(current_user, "id", None) if current_user else None

    detail: List[Dict[str, Any]] = []
    mine: Optional[Dict[str, Any]] = None
    counts: Counter = Counter()

    for r in _iter_reactions_from_instance(dep):
        if not getattr(r.emoji, "active", True):
            continue
        payload = {"user": {"name": getattr(r.user, "username", "Anonyme")}, "emoji": r.emoji.char}
        counts[r.emoji.char] += 1
        if current_user_id is not None and r.user_id == current_user_id:
            mine = payload
        else:
            detail.append(payload)

    if mine:
        detail = [mine] + detail

    summary = [{"emoji": e, "count": c} for e, c in sorted(counts.items(), key=lambda x: (-x[1], x[0]))]
    return {"detail": detail, "summary": summary}

def _build_deposit_from_instance(
    dep: Deposit,
    *,
    include_user: bool,
    include_deposit_time: bool,
    hidden: bool,
    current_user: Optional[CustomUser] = None,
) -> Dict[str, Any]:
    """Construit le payload final UNIQUEMENT depuis l'instance fournie."""

    payload: Dict[str, Any] = {
        "public_key": dep.public_key,
        "song": _build_song_from_instance(dep.song, hidden),
    }

    if include_deposit_time:
        # Date brute en UTC, au format ISO 8601
        payload["deposited_at"] = (
            dep.deposited_at.astimezone(timezone.utc).isoformat()
        )

    if include_user:
        payload["user"] = _build_user_from_instance(dep.user)

    rx = _build_reactions_from_instance(dep, current_user=current_user)
    payload["reactions"] = rx["detail"]
    payload["reactions_summary"] = rx["summary"]

    return payload




# box_management/utils.py

def _build_deposits_payload(
    deposits: Union[Deposit, Iterable[Deposit], Sequence[Deposit]],
    *,
    viewer: Optional[CustomUser] = None,
    include_user: bool = True,
    include_deposit_time: bool = True,
    force_song_infos_for: Optional[Iterable[int]] = None,
) -> List[Dict[str, Any]]:
    """
    Construit une liste de payloads de dépôts à partir d'instances déjà chargées.

    - N'effectue AUCUNE requête de "get par ID".
    - Optionnellement annote "is_revealed" pour le viewer fourni (en 1 requête bulk).
    - Permet un override ciblé (force_song_infos_for) pour renvoyer song en hidden=False
      pour certains dépôts, sans créer de reveal en base.
    - Construit le payload final via _build_deposit_from_instance(...).
    """
    # Normalisation en liste tout en respectant l’ordre fourni
    if isinstance(deposits, Deposit):
        deps: List[Deposit] = [deposits]
    else:
        deps = list(deposits or [])

    if not deps:
        return []

    force_ids = set(force_song_infos_for or [])

    # ------- Annotation "is_revealed" (BULK, 0/1 requête) -------
    if viewer is None:
        revealed_ids = set()  # personne -> rien de révélé
    else:
        viewer_id = getattr(viewer, "id", None)
        dep_ids = [d.pk for d in deps]

        # 1) Révélé implicitement si le viewer est le propriétaire du dépôt (0 requête)
        own_dep_ids = {d.pk for d in deps if getattr(d, "user_id", None) == viewer_id}

        # 2) Pour le reste seulement, on consulte DiscoveredSong (1 requête max)
        remaining_ids = [i for i in dep_ids if i not in own_dep_ids]

        discovered_ids = set()
        if remaining_ids:
            discovered_ids = set(
                DiscoveredSong.objects
                .filter(user_id=viewer_id, deposit_id__in=remaining_ids)
                .values_list("deposit_id", flat=True)
            )

        revealed_ids = own_dep_ids | discovered_ids

    # ------- Construction des payloads à partir des instances -------
    out: List[Dict[str, Any]] = []
    for dep in deps:
        # hidden si pas révélé, sauf override ciblé
        hidden = (dep.pk not in revealed_ids) and (dep.pk not in force_ids)

        payload = _build_deposit_from_instance(
            dep,
            include_user=include_user,
            include_deposit_time=include_deposit_time,
            hidden=hidden,
            current_user=viewer,
        )
        out.append(payload)

    return out



def _get_prev_head_and_older(box, limit: int = 10):
    """
    Snapshot AVANT création:
    - récupère d'un coup les (limit+1) derniers dépôts
    - prev_head = le plus récent
    - older = les suivants (jusqu'à limit)
    """
    qs = (
        Deposit.objects
        .filter(box=box)
        .select_related("song", "user")
        .prefetch_related(
            Prefetch(
                "reactions",
                queryset=Reaction.objects
                .select_related("emoji", "user")
                .order_by("created_at", "id"),
                to_attr="prefetched_reactions",
            )
        )
        .order_by("-deposited_at", "-id")
    )

    deposits = list(qs[: limit + 1])  # head + older
    if not deposits:
        return None, []

    prev_head = deposits[0]
    older_deposits_qs = deposits[1:]
    return prev_head, older_deposits_qs

# ---------- Normalisation & distance ----------

def normalize_string(input_string: str) -> str:
    """
    Normalise une chaîne : supprime les caractères spéciaux et met en minuscule.
    """
    normalized_string = re.sub(r'[^a-zA-Z0-9\s]', '', input_string).lower()
    normalized_string = re.sub(r'\s+', ' ', normalized_string).strip()
    return normalized_string


def _calculate_distance(lat1, lon1, lat2, lon2) -> float:
    """
    Calcule la distance entre deux points géographiques (Haversine).
    """
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    r = 6371000  # rayon de la Terre en mètres

    d_lat = lat2 - lat1
    d_lon = lon2 - lon1

    a = sin(d_lat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(d_lon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return r * c


# ============ Achievements centralisés ============

def _is_first_user_deposit(user: Optional[CustomUser], box) -> bool:
    """Vrai si l'utilisateur n'a jamais déposé dans cette box."""
    if not user:
        return False
    return not Deposit.objects.filter(user=user, box=box).exists()


def _is_first_song_deposit_global_by_title_artist(title: str, artist: str) -> bool:
    """Vrai si (title, artist) n'a jamais été déposé nulle part (case-insensitive)."""
    if not title or not artist:
        return False
    return not Deposit.objects.filter(
        song__title__iexact=title, song__artist__iexact=artist
    ).exists()


def _is_first_song_deposit_in_box_by_title_artist(title: str, artist: str, box) -> bool:
    """Vrai si (title, artist) n'a jamais été déposé dans la box donnée (case-insensitive)."""
    if not title or not artist:
        return False
    return not Deposit.objects.filter(
        box=box, song__title__iexact=title, song__artist__iexact=artist
    ).exists()


def _get_consecutive_deposit_days(user: Optional[CustomUser], box) -> int:
    """
    Nombre de JOURS consécutifs (terminant hier) où 'user' a déposé dans 'box'.
    Ex: si l'user a déposé hier et avant-hier → 2.
    """
    if not user:
        return 0

    today = localdate()
    target = today - timedelta(days=1)  # on ne compte pas aujourd'hui
    streak = 0

    # Liste des dates (locales) distinctes de dépôts, récentes → anciennes
    dates = (
        Deposit.objects
        .filter(user=user, box=box)
        .order_by("-deposited_at")
        .values_list("deposited_at", flat=True)
    )

    seen_days: List = []
    for dt in dates:
        try:
            d = localtime(dt).date()
        except Exception:
            d = timezone.localtime(dt).date()  # fallback
        if not seen_days or seen_days[-1] != d:
            seen_days.append(d)

    for d in seen_days:
        if d == target:
            streak += 1
            target -= timedelta(days=1)
        elif d < target:
            break  # trou dans la chaîne

    return streak


def _build_successes(*, box, user: Optional[CustomUser], song: Song) -> Tuple[List[Dict[str, Any]], int]:
    """
    Calcule la liste des 'successes' (achievements) + le total de points.

    Entrée:
      - box: instance de Box
      - user: CustomUser | None
      - song: instance de Song (déjà upsertée)

    Optimisations :
      - 1 requête pour tous les dépôts user+box (streak + "premier dépôt ici").
      - 1 requête pour tous les dépôts de cette song (global + dans cette box).
    """
    from django.utils.timezone import localtime, localdate  # déjà importés plus haut, mais pour clarté locale

    title = (getattr(song, "title", "") or "").strip()
    artist = (getattr(song, "artist", "") or "").strip()

    successes: Dict[str, Dict[str, Any]] = {}
    points_to_add = int(NB_POINTS_ADD_SONG)

    # ---------- Helper interne : calcul de streak à partir d'une liste de datetimes ----------
    def _compute_streak_from_dates(dates: List) -> int:
        """
        Reprend la logique de _get_consecutive_deposit_days, mais en pur Python
        à partir d'une liste de datetimes déjà récupérés.
        """
        if not dates:
            return 0

        today = localdate()
        target = today - timedelta(days=1)  # on ne compte pas aujourd'hui
        streak = 0

        # Liste des dates (locales) distinctes des dépôts, récentes → anciennes
        seen_days: List = []
        for dt in dates:
            try:
                d = localtime(dt).date()
            except Exception:
                d = timezone.localtime(dt).date()
            if not seen_days or seen_days[-1] != d:
                seen_days.append(d)

        for d in seen_days:
            if d == target:
                streak += 1
                target -= timedelta(days=1)
            elif d < target:
                break  # trou dans la chaîne

        return streak

    # ===================== 1) Requêtes mutualisées =====================

    # --- 1.a) Tous les dépôts de cet user dans cette box (streak + "premier dépôt ici")
    user_box_dates: List = []
    has_user_deposit_in_box = False
    if user:
        user_box_dates = list(
            Deposit.objects
            .filter(user=user, box=box)
            .order_by("-deposited_at")
            .values_list("deposited_at", flat=True)
        )
        has_user_deposit_in_box = len(user_box_dates) > 0

    # --- 1.b) Tous les dépôts de cette chanson (song) (global + dans cette box)
    # On s'appuie sur le fait que Song est upsertée par (title, artist),
    # donc il n'existe qu'une seule instance logique pour ce couple.
    song_box_ids: List[int] = []
    if title and artist:
        song_box_ids = list(
            Deposit.objects
            .filter(song=song)
            .values_list("box_id", flat=True)
        )

    # ===================== 2) Construction des achievements =====================

    # 1) Série de jours consécutifs
    nb_consecutive_days = _compute_streak_from_dates(user_box_dates) if user else 0
    if nb_consecutive_days > 0:
        bonus = nb_consecutive_days * int(NB_POINTS_CONSECUTIVE_DAYS_BOX)
        points_to_add += bonus
        successes["consecutive_days"] = {
            "name": "Amour fou",
            "desc": f"{nb_consecutive_days + 1} jours consécutifs avec cette boite",
            "points": bonus,
            "emoji": "🔥",
        }

    # 2) Premier dépôt de cet utilisateur dans cette box
    if user and not has_user_deposit_in_box:
        points_to_add += int(NB_POINTS_FIRST_DEPOSIT_USER_ON_BOX)
        successes["first_user_deposit_box"] = {
            "name": "Explorateur·ice",
            "desc": "C’est ta première chanson dans cette boîte",
            "points": int(NB_POINTS_FIRST_DEPOSIT_USER_ON_BOX),
            "emoji": "🔍",
        }

    # 3) Première fois (title, artist) dans la box
    is_first_song_in_box = False
    if title and artist:
        is_first_song_in_box = box.id not in song_box_ids

    if is_first_song_in_box:
        points_to_add += int(NB_POINTS_FIRST_SONG_DEPOSIT_BOX)
        successes["first_song_deposit"] = {
            "name": "Far West",
            "desc": "Cette chanson n’a jamais été déposée dans cette boîte",
            "points": int(NB_POINTS_FIRST_SONG_DEPOSIT_BOX),
            "emoji": "🤠",
        }

    # 4) Première fois (title, artist) sur le réseau
    is_first_song_global = False
    if title and artist:
        is_first_song_global = len(song_box_ids) == 0

    if is_first_song_global:
        points_to_add += int(NB_POINTS_FIRST_SONG_DEPOSIT_GLOBAL)
        successes["first_song_deposit_global"] = {
            "name": "Preums",
            "desc": "Cette chanson n'a jamais été déposée sur le réseau",
            "points": int(NB_POINTS_FIRST_SONG_DEPOSIT_GLOBAL),
            "emoji": "🥇",
        }

    # 5) Succès par défaut + total
    successes["default_deposit"] = {
        "name": "Pépite",
        "desc": "Tu as partagé·e une chanson",
        "points": int(NB_POINTS_ADD_SONG),
        "emoji": "💎",
    }
    successes["points_total"] = {"name": "Total", "points": points_to_add}

    return list(successes.values()), points_to_add











