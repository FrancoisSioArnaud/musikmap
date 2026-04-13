from __future__ import annotations

from datetime import timedelta
from difflib import SequenceMatcher
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import urlencode

import requests
from django.db import transaction
from django.utils import timezone

from deezer.credentials import APP_ID as DEEZER_APP_ID
from deezer.credentials import APP_SECRET as DEEZER_APP_SECRET
from spotify.credentials import CLIENT_ID as SPOTIFY_CLIENT_ID
from spotify.credentials import CLIENT_SECRET as SPOTIFY_CLIENT_SECRET
from spotify.credentials import REDIRECT_URI as SPOTIFY_REDIRECT_URI
from spotify.spotipy_client import sp

from .models import Song, SongProviderLink

SUPPORTED_PROVIDER_CODES = ("spotify", "deezer")
NEGATIVE_CACHE_HOURS = 4


def normalize_provider_code(value: Any) -> str:
    provider = str(value or "").strip().lower()
    if provider in SUPPORTED_PROVIDER_CODES:
        return provider
    if value in (1, "1"):
        return "spotify"
    if value in (2, "2"):
        return "deezer"
    return ""


def build_provider_code_from_option(option: Dict[str, Any]) -> str:
    return normalize_provider_code(option.get("provider_code") or option.get("platform_id"))


def normalize_artists(value: Any) -> List[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, tuple):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return []
        # support already-joined strings from legacy payloads
        parts = [part.strip() for part in raw.replace(" feat. ", ", ").replace(" feat ", ", ").split(",")]
        return [part for part in parts if part]
    return []


def build_artist_display(artists: Iterable[str]) -> str:
    return ", ".join([str(a).strip() for a in (artists or []) if str(a).strip()])


def provider_url_from_track_id(provider_code: str, provider_track_id: str) -> str:
    provider = normalize_provider_code(provider_code)
    track_id = str(provider_track_id or "").strip()
    if not provider or not track_id:
        return ""
    if provider == "spotify":
        return f"https://open.spotify.com/track/{track_id}"
    if provider == "deezer":
        return f"https://www.deezer.com/track/{track_id}"
    return ""


def provider_uri_from_track_id(provider_code: str, provider_track_id: str) -> str:
    provider = normalize_provider_code(provider_code)
    track_id = str(provider_track_id or "").strip()
    if not provider or not track_id:
        return ""
    if provider == "spotify":
        return f"spotify:track:{track_id}"
    if provider == "deezer":
        return f"deezer:track:{track_id}"
    return ""


def serialize_provider_link(link: Optional[SongProviderLink]) -> Optional[Dict[str, Any]]:
    if not link:
        return None
    return {
        "provider_code": link.provider_code,
        "status": link.status,
        "provider_track_id": link.provider_track_id or None,
        "provider_url": link.provider_url or None,
        "provider_uri": link.provider_uri or None,
        "last_attempt_at": link.last_attempt_at.isoformat() if link.last_attempt_at else None,
    }


def get_song_provider_links_map(song: Song) -> Dict[str, Dict[str, Any]]:
    links: Dict[str, Dict[str, Any]] = {}
    prefetched = getattr(song, "prefetched_provider_links", None)
    iterable = prefetched if prefetched is not None else song.provider_links.all()
    for link in iterable:
        links[link.provider_code] = serialize_provider_link(link)
    return links


def _safe_text(value: Any) -> str:
    return str(value or "").strip()


def normalize_track_payload(raw_track: Dict[str, Any]) -> Dict[str, Any]:
    provider_code = build_provider_code_from_option(raw_track)
    artists = normalize_artists(raw_track.get("artists") or raw_track.get("artist"))
    provider_track_id = _safe_text(raw_track.get("provider_track_id") or raw_track.get("id"))
    provider_url = _safe_text(raw_track.get("provider_url") or raw_track.get("url"))
    provider_uri = _safe_text(raw_track.get("provider_uri"))
    if not provider_url:
        provider_url = provider_url_from_track_id(provider_code, provider_track_id)
    if not provider_uri:
        provider_uri = provider_uri_from_track_id(provider_code, provider_track_id)

    title = _safe_text(raw_track.get("title") or raw_track.get("name"))
    artist_display = build_artist_display(artists)
    return {
        "provider_code": provider_code,
        "platform_id": 1 if provider_code == "spotify" else 2 if provider_code == "deezer" else None,
        "provider_track_id": provider_track_id,
        "provider_url": provider_url,
        "provider_uri": provider_uri,
        "url": provider_url,
        "id": provider_track_id,
        "name": title,
        "title": title,
        "artists": artists,
        "artist": artist_display,
        "duration": int(raw_track.get("duration") or 0),
        "isrc": _safe_text(raw_track.get("isrc")),
        "image_url": _safe_text(raw_track.get("image_url")),
        "image_url_small": _safe_text(raw_track.get("image_url_small") or raw_track.get("image_url")),
    }


def normalize_spotify_track(item: Dict[str, Any], *, include_isrc: bool = False) -> Dict[str, Any]:
    album = item.get("album") or {}
    images = album.get("images") or []
    image_url = images[0]["url"] if images else ""
    image_64 = next((img for img in images if img.get("height") == 64), None)
    image_url_small = image_64["url"] if image_64 else (images[-1]["url"] if images else image_url)
    artists = [artist.get("name") for artist in (item.get("artists") or []) if artist.get("name")]
    external_ids = item.get("external_ids") or {}
    return normalize_track_payload(
        {
            "provider_code": "spotify",
            "provider_track_id": item.get("id"),
            "provider_url": ((item.get("external_urls") or {}).get("spotify")) or provider_url_from_track_id("spotify", item.get("id") or ""),
            "provider_uri": item.get("uri") or provider_uri_from_track_id("spotify", item.get("id") or ""),
            "title": item.get("name"),
            "artists": artists,
            "duration": int((item.get("duration_ms") or 0) / 1000),
            "isrc": external_ids.get("isrc") if include_isrc else "",
            "image_url": image_url,
            "image_url_small": image_url_small,
        }
    )


def normalize_deezer_track(item: Dict[str, Any], *, include_isrc: bool = True) -> Dict[str, Any]:
    album = item.get("album") or {}
    contributors = item.get("contributors") or []
    artists = [artist.get("name") for artist in contributors if artist.get("name")]
    if not artists and (item.get("artist") or {}).get("name"):
        artists = [item["artist"]["name"]]
    image_url = album.get("cover_medium") or album.get("cover_big") or album.get("cover") or ""
    image_url_small = album.get("cover_small") or image_url
    return normalize_track_payload(
        {
            "provider_code": "deezer",
            "provider_track_id": item.get("id"),
            "provider_url": item.get("link") or provider_url_from_track_id("deezer", item.get("id") or ""),
            "provider_uri": provider_uri_from_track_id("deezer", item.get("id") or ""),
            "title": item.get("title"),
            "artists": artists,
            "duration": int(item.get("duration") or 0),
            "isrc": item.get("isrc") if include_isrc else "",
            "image_url": image_url,
            "image_url_small": image_url_small,
        }
    )


def backend_search_tracks(provider_code: str, search_query: str) -> List[Dict[str, Any]]:
    provider = normalize_provider_code(provider_code)
    query = _safe_text(search_query)
    if not provider or not query:
        return []
    try:
        if provider == "spotify":
            results = sp.search(q=query, type="track", limit=15)
            return [normalize_spotify_track(item) for item in ((results.get("tracks") or {}).get("items") or [])]
        response = requests.get(
            "https://api.deezer.com/search/track",
            params={"q": query, "limit": 15, "output": "json"},
            timeout=10,
        )
        data = response.json() if response.ok else {}
        return [normalize_deezer_track(item, include_isrc=False) for item in (data.get("data") or [])]
    except Exception:
        return []


def fetch_provider_track(provider_code: str, provider_track_id: str) -> Optional[Dict[str, Any]]:
    provider = normalize_provider_code(provider_code)
    track_id = _safe_text(provider_track_id)
    if not provider or not track_id:
        return None
    try:
        if provider == "spotify":
            item = sp.track(track_id)
            return normalize_spotify_track(item, include_isrc=True)
        response = requests.get(f"https://api.deezer.com/track/{track_id}", timeout=10)
        data = response.json() if response.ok else {}
        if data.get("error"):
            return None
        return normalize_deezer_track(data, include_isrc=True)
    except Exception:
        return None


def _normalized_compare_text(value: str) -> str:
    return " ".join(repr(value).strip("'\"").lower().replace("&", " ").replace("feat.", " ").replace("feat", " ").split())


def _score_candidate(song: Song, candidate: Dict[str, Any]) -> float:
    title_ratio = SequenceMatcher(None, _normalized_compare_text(song.title), _normalized_compare_text(candidate.get("title") or "")).ratio()
    source_artist = _normalized_compare_text(build_artist_display(song.artists_json or []))
    target_artist = _normalized_compare_text(build_artist_display(candidate.get("artists") or []))
    artist_ratio = SequenceMatcher(None, source_artist, target_artist).ratio() if source_artist and target_artist else 0.0
    source_duration = int(song.duration or 0)
    target_duration = int(candidate.get("duration") or 0)
    duration_ratio = 1.0
    if source_duration and target_duration:
        diff = abs(source_duration - target_duration)
        duration_ratio = max(0.0, 1.0 - min(diff, 30) / 30)
    return (title_ratio * 0.5) + (artist_ratio * 0.35) + (duration_ratio * 0.15)


def search_provider_track_by_isrc(provider_code: str, isrc: str) -> Optional[Dict[str, Any]]:
    provider = normalize_provider_code(provider_code)
    code = _safe_text(isrc)
    if not provider or not code:
        return None
    try:
        if provider == "spotify":
            results = sp.search(q=f"isrc:{code}", type="track", limit=5)
            items = ((results.get("tracks") or {}).get("items") or [])
            for item in items:
                normalized = normalize_spotify_track(item, include_isrc=True)
                if _safe_text(normalized.get("isrc")).upper() == code.upper():
                    return normalized
            return normalize_spotify_track(items[0], include_isrc=True) if items else None
        response = requests.get(
            "https://api.deezer.com/search/track",
            params={"q": f'isrc:"{code}"', "limit": 5, "output": "json"},
            timeout=10,
        )
        data = response.json() if response.ok else {}
        items = data.get("data") or []
        for item in items:
            normalized = normalize_deezer_track(item, include_isrc=True)
            if _safe_text(normalized.get("isrc")).upper() == code.upper():
                return normalized
        return normalize_deezer_track(items[0], include_isrc=True) if items else None
    except Exception:
        return None


def search_provider_track_by_metadata(provider_code: str, song: Song) -> Optional[Dict[str, Any]]:
    query = " ".join(filter(None, [song.title, build_artist_display(song.artists_json or [])]))
    candidates = backend_search_tracks(provider_code, query)
    if not candidates:
        return None
    ranked = sorted(candidates, key=lambda item: _score_candidate(song, item), reverse=True)
    best = ranked[0]
    if _score_candidate(song, best) < 0.72:
        return None
    if normalize_provider_code(provider_code) == "spotify" and best.get("provider_track_id"):
        detailed = fetch_provider_track("spotify", best["provider_track_id"])
        return detailed or best
    if normalize_provider_code(provider_code) == "deezer" and best.get("provider_track_id"):
        detailed = fetch_provider_track("deezer", best["provider_track_id"])
        return detailed or best
    return best


def get_or_create_song_from_track(track_payload: Dict[str, Any]) -> Song:
    track = normalize_track_payload(track_payload)
    if not track["title"]:
        raise ValueError("Informations de chanson incomplètes.")
    provider_code = track["provider_code"]
    provider_track_id = track["provider_track_id"]

    if provider_code and provider_track_id:
        existing_link = (
            SongProviderLink.objects.select_related("song")
            .filter(provider_code=provider_code, provider_track_id=provider_track_id, status=SongProviderLink.STATUS_RESOLVED)
            .first()
        )
        if existing_link:
            return existing_link.song

    if track["isrc"]:
        existing_song = Song.objects.filter(isrc__iexact=track["isrc"]).first()
        if existing_song:
            return existing_song

    artists_json = track["artists"]
    existing_song = Song.objects.filter(
        title__iexact=track["title"],
        duration=track["duration"],
    ).first()
    if existing_song and [str(a).strip().lower() for a in (existing_song.artists_json or [])] == [str(a).strip().lower() for a in artists_json]:
        return existing_song

    import secrets

    public_key = secrets.token_urlsafe(18)[:25]
    while Song.objects.filter(public_key=public_key).exists():
        public_key = secrets.token_urlsafe(18)[:25]

    return Song.objects.create(
        public_key=public_key,
        title=track["title"],
        artists_json=artists_json,
        duration=track["duration"],
        isrc=track["isrc"],
        image_url=track["image_url"],
        image_url_small=track["image_url_small"],
    )


def upsert_song_provider_link(song: Song, track_payload: Dict[str, Any], *, status: str = SongProviderLink.STATUS_RESOLVED) -> Optional[SongProviderLink]:
    track = normalize_track_payload(track_payload)
    provider_code = track["provider_code"]
    if not provider_code:
        return None
    defaults = {
        "status": status,
        "provider_track_id": track["provider_track_id"],
        "provider_url": track["provider_url"],
        "provider_uri": track["provider_uri"],
        "last_attempt_at": timezone.now(),
    }
    link, _created = SongProviderLink.objects.update_or_create(
        song=song,
        provider_code=provider_code,
        defaults=defaults,
    )
    return link


def _maybe_refresh_song_core(song: Song, track: Dict[str, Any]) -> None:
    update_fields: List[str] = []
    if not (song.artists_json or []) and track.get("artists"):
        song.artists_json = track["artists"]
        update_fields.append("artists_json")
    if not song.isrc and track.get("isrc"):
        song.isrc = track["isrc"]
        update_fields.append("isrc")
    if not song.image_url and track.get("image_url"):
        song.image_url = track["image_url"]
        update_fields.append("image_url")
    if not song.image_url_small and track.get("image_url_small"):
        song.image_url_small = track["image_url_small"]
        update_fields.append("image_url_small")
    if not song.duration and track.get("duration"):
        song.duration = int(track["duration"])
        update_fields.append("duration")
    if update_fields:
        song.save(update_fields=update_fields)


def _resolve_source_track_isrc(song: Song) -> None:
    if song.isrc:
        return
    source_link = (
        song.provider_links.filter(status=SongProviderLink.STATUS_RESOLVED)
        .exclude(provider_track_id="")
        .order_by("id")
        .first()
    )
    if not source_link:
        return
    details = fetch_provider_track(source_link.provider_code, source_link.provider_track_id)
    if not details:
        return
    _maybe_refresh_song_core(song, details)
    upsert_song_provider_link(song, details)


def resolve_provider_link_for_song(song: Song, target_provider_code: str) -> Dict[str, Any]:
    provider_code = normalize_provider_code(target_provider_code)
    if not provider_code:
        return {"ok": False, "code": "INVALID_PROVIDER", "message": "Plateforme invalide."}

    existing_link = song.get_provider_link(provider_code)
    now = timezone.now()
    if existing_link:
        if existing_link.status == SongProviderLink.STATUS_RESOLVED and existing_link.provider_url:
            return {"ok": True, "link": existing_link, "song": song}
        if (
            existing_link.status == SongProviderLink.STATUS_NOT_FOUND
            and existing_link.last_attempt_at
            and existing_link.last_attempt_at >= now - timedelta(hours=NEGATIVE_CACHE_HOURS)
        ):
            return {
                "ok": False,
                "code": "PROVIDER_LINK_NOT_FOUND",
                "message": "Impossible de trouver cette chanson sur cette plateforme.",
            }

    try:
        with transaction.atomic():
            song = Song.objects.select_for_update().get(pk=song.pk)
            _resolve_source_track_isrc(song)

            candidate = None
            if song.isrc:
                candidate = search_provider_track_by_isrc(provider_code, song.isrc)
            if not candidate:
                candidate = search_provider_track_by_metadata(provider_code, song)

            if not candidate:
                link, _created = SongProviderLink.objects.update_or_create(
                    song=song,
                    provider_code=provider_code,
                    defaults={
                        "status": SongProviderLink.STATUS_NOT_FOUND,
                        "provider_track_id": "",
                        "provider_url": "",
                        "provider_uri": "",
                        "last_attempt_at": timezone.now(),
                    },
                )
                return {
                    "ok": False,
                    "code": "PROVIDER_LINK_NOT_FOUND",
                    "message": "Impossible de trouver cette chanson sur cette plateforme.",
                    "link": link,
                }

            _maybe_refresh_song_core(song, candidate)
            link = upsert_song_provider_link(song, candidate, status=SongProviderLink.STATUS_RESOLVED)
            return {"ok": True, "link": link, "song": song}
    except Exception:
        return {
            "ok": False,
            "code": "PROVIDER_RESOLUTION_ERROR",
            "message": "La plateforme est indisponible pour le moment. Réessaie plus tard.",
        }


def get_spotify_auth_url() -> str:
    params = {
        "client_id": SPOTIFY_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": SPOTIFY_REDIRECT_URI,
        "scope": "user-read-recently-played",
    }
    return "https://accounts.spotify.com/authorize?" + urlencode(params)


def get_deezer_auth_url(redirect_uri: str) -> str:
    return (
        "https://connect.deezer.com/oauth/auth.php?"
        + urlencode(
            {
                "app_id": DEEZER_APP_ID,
                "redirect_uri": redirect_uri,
                "perms": "email,basic_access,offline_access,listening_history",
            }
        )
    )
