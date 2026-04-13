import sys
import time
import random
import secrets
from datetime import timedelta
from urllib.parse import urlencode

import requests
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.db import transaction

from box_management.models import Box, Song, SongProviderLink, Deposit
from spotify.credentials import CLIENT_ID as SPOTIFY_CLIENT_ID, CLIENT_SECRET as SPOTIFY_CLIENT_SECRET


# =========================================================
# Personas (servent aussi à créer les users manquants)
# =========================================================

PERSONAS = [
    {"username": "lea.moon", "first_name": "Léa", "last_name": "Indie"},
    {"username": "karim.groove", "first_name": "Karim", "last_name": "NeoSoul"},
    {"username": "zoe.vapor", "first_name": "Zoé", "last_name": "Electro"},
    {"username": "max.jazzy", "first_name": "Max", "last_name": "HipHop"},
    {"username": "emma.orbit", "first_name": "Emma", "last_name": "AltPop"},
    {"username": "hugo.wave", "first_name": "Hugo", "last_name": "Electro"},
    {"username": "sara.aurora", "first_name": "Sara", "last_name": "AltPop"},
    {"username": "lucas.verso", "first_name": "Lucas", "last_name": "IndieRap"},
    {"username": "nina.silk", "first_name": "Nina", "last_name": "NuJazz"},
    {"username": "theo.noir", "first_name": "Theo", "last_name": "PostPunk"},
]

USERNAMES = [p["username"] for p in PERSONAS]

SONGS_BY_USER = {
    "lea.moon": [
        {"title": "Chateau", "artist": "Angus & Julia Stone"},
        {"title": "Bloom", "artist": "The Paper Kites"},
        {"title": "Youth", "artist": "Daughter"},
        {"title": "Keep Your Head Up", "artist": "Ben Howard"},
        {"title": "Motion Sickness", "artist": "Phoebe Bridgers"},
    ],
    "karim.groove": [
        {"title": "Sorceress", "artist": "Jordan Rakei"},
        {"title": "Movie", "artist": "Tom Misch"},
        {"title": "Nakamarra", "artist": "Hiatus Kaiyote"},
        {"title": "Why Don't You", "artist": "Cleo Sol"},
        {"title": "Put Me Thru", "artist": "Anderson .Paak"},
    ],
    "zoe.vapor": [
        {"title": "Graveyard Girl", "artist": "M83"},
        {"title": "Peur des filles", "artist": "L'Impératrice"},
        {"title": "Show Me How", "artist": "Men I Trust"},
        {"title": "Saint Claude", "artist": "Christine and the Queens"},
        {"title": "Strangers", "artist": "Roosevelt"},
    ],
    "max.jazzy": [
        {"title": "Find a Way", "artist": "A Tribe Called Quest"},
        {"title": "Yeux disent", "artist": "Lomepal"},
        {"title": "Luv(sic) pt3", "artist": "Nujabes"},
        {"title": "Go!", "artist": "Common"},
        {"title": "Petit frère", "artist": "IAM"},
    ],
    "emma.orbit": [
        {"title": "The Less I Know the Better", "artist": "Tame Impala"},
        {"title": "No. 1 Party Anthem", "artist": "Arctic Monkeys"},
        {"title": "Queen of Peace", "artist": "Florence + The Machine"},
        {"title": "Miracle Aligner", "artist": "The Last Shadow Puppets"},
        {"title": "Red Eyes", "artist": "The War on Drugs"},
    ],
    "hugo.wave": [
        {"title": "Tonight", "artist": "Yuksek"},
        {"title": "Baby I'm Yours", "artist": "Breakbot"},
        {"title": "Roadgame", "artist": "Kavinsky"},
        {"title": "New Lands", "artist": "Justice"},
        {"title": "Dorothy", "artist": "Polo & Pan"},
    ],
    "sara.aurora": [
        {"title": "Gimme", "artist": "BANKS"},
        {"title": "Sober", "artist": "Lorde"},
        {"title": "Wasting My Young Years", "artist": "London Grammar"},
        {"title": "Alaska", "artist": "Maggie Rogers"},
        {"title": "Clearest Blue", "artist": "CHVRCHES"},
    ],
    "lucas.verso": [
        {"title": "Sur la route", "artist": "Jazzy Bazz"},
        {"title": "Tempête", "artist": "Nekfeu"},
        {"title": "TMTC", "artist": "Caballero & JeanJass"},
        {"title": "Bleu noir", "artist": "Georgio"},
        {"title": "Stupéfiant et noir", "artist": "Alpha Wann"},
    ],
    "nina.silk": [
        {"title": "Confessions", "artist": "BADBADNOTGOOD"},
        {"title": "Hopopono", "artist": "GoGo Penguin"},
        {"title": "What About Me?", "artist": "Snarky Puppy"},
        {"title": "Ruins", "artist": "Portico Quartet"},
        {"title": "Lowrider", "artist": "Yussef Kamaal"},
    ],
    "theo.noir": [
        {"title": "Televised Mind", "artist": "Fontaines D.C."},
        {"title": "Mr. Motivator", "artist": "IDLES"},
        {"title": "Green & Blue", "artist": "The Murder Capital"},
        {"title": "Obstacle 1", "artist": "Interpol"},
        {"title": "House of Jealous Lovers", "artist": "The Rapture"},
    ],
}


# =========================================================
# Spotify (Client Credentials)
# =========================================================

def _get_spotify_token():
    if not SPOTIFY_CLIENT_ID or not SPOTIFY_CLIENT_SECRET:
        print("[ERR] Spotify CLIENT_ID/CLIENT_SECRET non configurés (spotify.credentials).")
        sys.exit(1)

    url = "https://accounts.spotify.com/api/token"
    data = {"grant_type": "client_credentials"}
    r = requests.post(url, data=data, auth=(SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET), timeout=12)
    r.raise_for_status()
    return r.json()["access_token"]


_SPOTIFY_TOKEN = None
_SPOTIFY_HEADERS = None


def _ensure_spotify_headers():
    global _SPOTIFY_TOKEN, _SPOTIFY_HEADERS
    if not _SPOTIFY_TOKEN:
        _SPOTIFY_TOKEN = _get_spotify_token()
        _SPOTIFY_HEADERS = {"Authorization": f"Bearer {_SPOTIFY_TOKEN}"}


def spotify_search_track(title: str, artist: str):
    """Retourne un payload Spotify normalisé minimal ou None."""
    global _SPOTIFY_TOKEN, _SPOTIFY_HEADERS

    _ensure_spotify_headers()

    base = "https://api.spotify.com/v1/search"
    query = f'track:"{title}" artist:"{artist}"'
    url = f"{base}?{urlencode({'q': query, 'type': 'track', 'limit': 1})}"

    r = requests.get(url, headers=_SPOTIFY_HEADERS, timeout=12)

    if r.status_code == 401:
        # Token expiré → on en redemande un
        _SPOTIFY_TOKEN = _get_spotify_token()
        _SPOTIFY_HEADERS = {"Authorization": f"Bearer {_SPOTIFY_TOKEN}"}
        r = requests.get(url, headers=_SPOTIFY_HEADERS, timeout=12)

    if not r.ok:
        print(f"[WARN] Spotify search fail for '{title}' - '{artist}': {r.status_code}")
        return None

    items = r.json().get("tracks", {}).get("items", [])
    if not items:
        print(f"[WARN] No match on Spotify for '{title}' - '{artist}'")
        return None

    tr = items[0]
    spotify_url = tr.get("external_urls", {}).get("spotify") or ""
    images = (tr.get("album", {}) or {}).get("images", []) or []
    image_url = images[0]["url"] if images else ""
    image_url_small = images[-1]["url"] if images else image_url
    duration_sec = int(round((tr.get("duration_ms") or 0) / 1000.0))
    artists = [a.get("name") for a in (tr.get("artists") or []) if a.get("name")]
    isrc = ((tr.get("external_ids") or {}).get("isrc")) or ""

    return {
        "provider_track_id": tr.get("id") or "",
        "provider_url": spotify_url,
        "provider_uri": tr.get("uri") or "",
        "title": tr.get("name") or title,
        "artists": artists or [artist],
        "image_url": image_url,
        "image_url_small": image_url_small,
        "duration": duration_sec,
        "isrc": isrc,
    }


# =========================================================
# Helpers (compatibles avec tes modèles)
# =========================================================

def gen_public_key(max_len: int = 25) -> str:
    return secrets.token_urlsafe(18)[:max_len]


def _unique_song_public_key() -> str:
    for _ in range(20):
        public_key = gen_public_key(25)
        if not Song.objects.filter(public_key=public_key).exists():
            return public_key
    return gen_public_key(25)


def random_datetime_within_last_48h():
    now = timezone.now()
    return now - timedelta(seconds=random.randint(0, 48 * 3600))


def get_or_create_users(personas):
    """
    Retourne (dict{username:user}, list_missing_created).

    Crée les utilisateurs manquants avec :
    - username
    - first_name
    - last_name
    - password: "test1234"
    - last_platform: ""
    - points: entre 200 et 400
    """
    User = get_user_model()

    existing = list(User.objects.filter(username__in=[p["username"] for p in personas]))
    by_name = {u.username: u for u in existing}

    created_usernames = []

    for p in personas:
        uname = p["username"]
        if uname in by_name:
            continue

        u = User.objects.create(
            username=uname,
            first_name=p.get("first_name", "")[:150],
            last_name=p.get("last_name", "")[:150],
            email="",
            last_platform="",
            points=random.randint(200, 400),
        )
        u.set_password("test1234")
        u.save(update_fields=["password"])

        by_name[uname] = u
        created_usernames.append(uname)

    return by_name, created_usernames


def upsert_song(title: str, artist: str):
    """Réutilise Song si (title + artists_json) existent, sinon crée Song + lien Spotify."""
    existing = Song.objects.filter(title__iexact=title).all()
    artist_key = artist.strip().lower()
    for song in existing:
        artists = [str(name).strip().lower() for name in (song.artists_json or []) if str(name).strip()]
        if artists == [artist_key]:
            return song

    info = spotify_search_track(title, artist)
    if not info:
        return None

    song = Song.objects.create(
        public_key=_unique_song_public_key(),
        title=(info.get("title") or title)[:150],
        artists_json=list(info.get("artists") or [artist]),
        isrc=(info.get("isrc") or "")[:32],
        image_url=info.get("image_url") or "",
        image_url_small=info.get("image_url_small") or info.get("image_url") or "",
        duration=int(info.get("duration") or 0),
        n_deposits=0,
    )

    SongProviderLink.objects.create(
        song=song,
        provider_code="spotify",
        status=SongProviderLink.STATUS_RESOLVED,
        provider_track_id=str(info.get("provider_track_id") or ""),
        provider_url=info.get("provider_url") or "",
        provider_uri=info.get("provider_uri") or "",
        last_attempt_at=timezone.now(),
    )
    return song


# =========================================================
# Seed principal
# =========================================================

def seed_siohome():
    # 0) Récupération de la box 'siohome' (par name, puis par url)
    box = Box.objects.filter(name="siohome").first() or Box.objects.filter(url="siohome").first()
    if not box:
        print("[ERR] La boîte 'siohome' est introuvable (ni name='siohome', ni url='siohome'). Abandon.")
        return

    # 1) Users : récupérer ou créer les manquants
    with transaction.atomic():
        users_by_name, created_usernames = get_or_create_users(PERSONAS)

    if created_usernames:
        print(f"[INFO] Users créés : {', '.join(created_usernames)}")
    else:
        print("[INFO] Tous les users existaient déjà.")

    # 2) Dépôts
    created_deposits = 0
    created_songs_new = 0

    with transaction.atomic():
        for username in USERNAMES:
            user = users_by_name.get(username)
            if not user:
                continue

            print(f"\n🎧 {username} — dépôts sur 'siohome'...")

            for item in SONGS_BY_USER.get(username, []):
                title = item["title"].strip()
                artist = item["artist"].strip()

                song = upsert_song(title, artist)
                if not song:
                    print(f"[SKIP] Spotify KO: {title} - {artist}")
                    continue

                # Création du dépôt pour cette box et cet utilisateur
                Deposit.objects.create(
                    song=song,
                    box=box,
                    user=user,
                    deposited_at=random_datetime_within_last_48h(),
                )
                created_deposits += 1

                # Mise à jour n_deposits (champ non éditable dans l'admin, mais OK en script)
                before = song.n_deposits or 0
                Song.objects.filter(pk=song.pk).update(n_deposits=before + 1)
                if before == 0:
                    created_songs_new += 1

                # Politesse API Spotify
                time.sleep(0.12)

    print("\n====================================")
    print(f"Users en base : {len(users_by_name)}")
    print(f"Songs nouvellement créés: {created_songs_new}")
    print(f"Deposits créés : {created_deposits}")
    print("Box : siohome")
    print("Done ✅")


# Hook django-extensions
def run():
    seed_siohome()
