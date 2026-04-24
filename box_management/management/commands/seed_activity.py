import random
import time
from dataclasses import dataclass, field
from typing import Any

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from rest_framework.test import APIClient

from box_management.models import Box, LocationPoint

User = get_user_model()

DEFAULT_BOX_SLUGS = ["hopital_bellier", "chantier_naval"]
DEFAULT_PASSWORD = "SeedActivity!2026"
SEARCH_QUERIES = [
    "daft punk",
    "the weeknd",
    "stromae",
    "billie eilish",
    "indochine",
    "muse",
]


@dataclass
class StepResult:
    action: str
    status: str
    detail: str


@dataclass
class SeedContext:
    rng: random.Random
    dry_run: bool
    verbose_errors: bool
    ok_count: int = 0
    warning_count: int = 0
    error_count: int = 0
    users_created: int = 0
    sessions_opened: int = 0
    deposits: int = 0
    reveals: int = 0
    reactions: int = 0
    comments: int = 0
    pins: int = 0
    links: int = 0
    discoveries: int = 0
    messages: int = 0
    results: list[StepResult] = field(default_factory=list)


class Command(BaseCommand):
    help = "Génère une activité réaliste via endpoints backend sur des boîtes existantes."

    def add_arguments(self, parser):
        parser.add_argument("--users", type=int, default=8)
        parser.add_argument("--boxes", nargs="+", default=DEFAULT_BOX_SLUGS)
        parser.add_argument("--deposits-per-box", type=int, default=6)
        parser.add_argument("--days", type=int, default=1)
        parser.add_argument("--intensity", choices=["low", "medium", "high"], default="medium")
        parser.add_argument("--seed", type=int, default=None)
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--errors", action="store_true")

    def log_ok(self, ctx: SeedContext, action: str, detail: str):
        ctx.ok_count += 1
        ctx.results.append(StepResult(action=action, status="OK", detail=detail))
        self.stdout.write(self.style.SUCCESS(f"[OK] {action} — {detail}"))

    def log_warning(self, ctx: SeedContext, action: str, detail: str):
        ctx.warning_count += 1
        ctx.results.append(StepResult(action=action, status="WARNING", detail=detail))
        self.stdout.write(self.style.WARNING(f"[WARNING] {action} — {detail}"))

    def log_error(self, ctx: SeedContext, action: str, detail: str):
        ctx.error_count += 1
        ctx.results.append(StepResult(action=action, status="ERROR", detail=detail))
        self.stdout.write(self.style.ERROR(f"[ERROR] {action} — {detail}"))

    def _extract_error_detail(self, payload: Any) -> str:
        if not isinstance(payload, dict):
            return "Réponse API invalide"
        detail = payload.get("detail") or payload.get("message") or "Erreur API"
        code = payload.get("code")
        title = payload.get("title")
        bits = [str(detail)]
        if code:
            bits.append(f"code={code}")
        if title:
            bits.append(f"title={title}")
        return " | ".join(bits)

    def api_request(
        self,
        ctx: SeedContext,
        client: APIClient,
        method: str,
        path: str,
        *,
        payload: dict[str, Any] | None = None,
        query: dict[str, Any] | None = None,
        expected_statuses: tuple[int, ...] = (200,),
        action: str = "api_request",
    ) -> tuple[bool, Any, int]:
        if ctx.dry_run:
            return True, {"dry_run": True}, 200

        http_method = getattr(client, method.lower())
        if method.lower() == "get":
            response = http_method(path, data=query or {}, format="json")
        else:
            response = http_method(path, data=payload or {}, format="json")

        status_code = response.status_code
        data = None
        try:
            data = response.json()
        except Exception:
            data = {"detail": response.content.decode("utf-8", errors="ignore")[:500]}

        if status_code not in expected_statuses:
            self.log_warning(
                ctx,
                action,
                f"HTTP {status_code} sur {path} | {self._extract_error_detail(data)}",
            )
            return False, data, status_code

        return True, data, status_code

    def create_user(self, ctx: SeedContext, idx: int) -> User:
        username = f"seed_user_{idx}_{ctx.rng.randint(1000, 9999)}"
        email = f"{username}@seed.local"
        if ctx.dry_run:
            user = User(username=username, email=email, points=5000)
            self.log_ok(ctx, "create_user", f"(dry-run) {username} créé avec 5000 points")
            return user

        with transaction.atomic():
            user = User.objects.create_user(username=username, email=email, password=DEFAULT_PASSWORD)
            user.points = 5000
            user.save(update_fields=["points"])

        ctx.users_created += 1
        self.log_ok(ctx, "create_user", f"{username} créé avec 5000 points")
        return user

    def login_user(self, ctx: SeedContext, client: APIClient, user: User) -> bool:
        ok, _data, _status = self.api_request(
            ctx,
            client,
            "post",
            "/users/login_user",
            payload={"username": user.username, "password": DEFAULT_PASSWORD},
            expected_statuses=(200,),
            action="login_user",
        )
        if ok:
            self.log_ok(ctx, "login_user", f"{user.username} connecté")
        return ok

    def open_box_session(self, ctx: SeedContext, client: APIClient, user: User, box_slug: str, latitude: float, longitude: float) -> bool:
        ok, data, _ = self.api_request(
            ctx,
            client,
            "post",
            "/box-management/verify-location",
            payload={"boxSlug": box_slug, "latitude": latitude, "longitude": longitude},
            expected_statuses=(200,),
            action="open_box_session.verify-location",
        )
        if not ok:
            return False

        ok2, session_data, _ = self.api_request(
            ctx,
            client,
            "get",
            "/box-management/box-session/",
            query={"boxSlug": box_slug},
            expected_statuses=(200,),
            action="open_box_session.box-session",
        )
        if not ok2:
            return False

        if not session_data.get("active"):
            self.log_warning(ctx, "open_box_session", f"session inactive pour {user.username} / {box_slug}")
            return False

        ctx.sessions_opened += 1
        remaining = data.get("session", {}).get("remaining_seconds") if isinstance(data, dict) else None
        self.log_ok(ctx, "open_box_session", f"{user.username} dans {box_slug} (remaining={remaining})")
        return True

    def search_song(self, ctx: SeedContext, client: APIClient, query: str, retries: int = 2) -> dict[str, Any] | None:
        for attempt in range(1, retries + 2):
            ok, data, status_code = self.api_request(
                ctx,
                client,
                "post",
                "/spotify/search",
                payload={"search_query": query},
                expected_statuses=(200, 429, 503),
                action="search_song",
            )
            if not ok:
                if status_code in (429, 503):
                    if attempt <= retries + 1:
                        sleep_s = min(attempt, 2)
                        time.sleep(sleep_s)
                        continue
                return None

            tracks = data.get("tracks") if isinstance(data, dict) else None
            if tracks:
                self.log_ok(ctx, "search_song", f"query='{query}' -> {len(tracks)} résultats")
                return tracks[0]

            self.log_warning(ctx, "search_song", f"query='{query}' sans résultat")
            return None

        self.log_warning(ctx, "search_song", "Spotify indisponible après retries")
        return None

    def deposit_song(self, ctx: SeedContext, client: APIClient, box_slug: str, option: dict[str, Any]) -> str | None:
        ok, data, _ = self.api_request(
            ctx,
            client,
            "post",
            "/box-management/get-box/",
            payload={"boxSlug": box_slug, "option": option},
            expected_statuses=(200,),
            action="deposit_song",
        )
        if not ok:
            return None

        successes = data.get("successes") if isinstance(data, dict) else None
        dep_key = None
        if isinstance(successes, list) and successes:
            dep_key = successes[0].get("public_key")
        if not dep_key:
            dep_key = (data.get("main") or {}).get("public_key") if isinstance(data, dict) else None

        if not dep_key:
            self.log_warning(ctx, "deposit_song", f"dépôt sans public_key pour {box_slug}")
            return None

        ctx.deposits += 1
        self.log_ok(ctx, "deposit_song", f"box={box_slug} dep_public_key={dep_key}")
        return dep_key

    def reveal(self, ctx: SeedContext, client: APIClient, dep_public_key: str) -> bool:
        ok, _data, _ = self.api_request(
            ctx,
            client,
            "post",
            "/box-management/revealSong",
            payload={"dep_public_key": dep_public_key, "context": "box"},
            expected_statuses=(200, 400, 403),
            action="reveal",
        )
        if not ok:
            return False
        ctx.reveals += 1
        self.log_ok(ctx, "reveal", f"dep_public_key={dep_public_key}")
        return True

    def react(self, ctx: SeedContext, client: APIClient, dep_public_key: str, emoji_id: int | None) -> bool:
        ok, _data, _ = self.api_request(
            ctx,
            client,
            "post",
            "/box-management/reactions",
            payload={"dep_public_key": dep_public_key, "emoji_id": emoji_id},
            expected_statuses=(200,),
            action="react",
        )
        if not ok:
            return False
        ctx.reactions += 1
        action_detail = "remove" if emoji_id is None else f"emoji_id={emoji_id}"
        self.log_ok(ctx, "react", f"dep_public_key={dep_public_key} {action_detail}")
        return True

    def comment(self, ctx: SeedContext, client: APIClient, dep_public_key: str, text: str, song_option: dict[str, Any] | None = None) -> bool:
        ok, data, status_code = self.api_request(
            ctx,
            client,
            "post",
            "/box-management/comments/",
            payload={"dep_public_key": dep_public_key, "text": text, "song_option": song_option},
            expected_statuses=(201, 202, 400, 403, 429),
            action="comment",
        )
        if not ok:
            return False

        if status_code in (201, 202):
            ctx.comments += 1
            self.log_ok(ctx, "comment", f"dep_public_key={dep_public_key} status={status_code}")
            return True

        self.log_warning(ctx, "comment", f"refus métier attendu status={status_code} dep_public_key={dep_public_key}")
        return False

    def pin(self, ctx: SeedContext, client: APIClient, box_slug: str, option: dict[str, Any]) -> bool:
        ok, data, _ = self.api_request(
            ctx,
            client,
            "get",
            "/box-management/pinned-song/",
            query={"boxSlug": box_slug},
            expected_statuses=(200,),
            action="pin.get",
        )
        if not ok:
            return False

        steps = (data or {}).get("price_steps") or []
        if not steps:
            self.log_warning(ctx, "pin", f"aucune durée disponible pour box={box_slug}")
            return False

        duration = steps[0].get("duration_minutes")
        ok2, _data2, status_code2 = self.api_request(
            ctx,
            client,
            "post",
            "/box-management/pinned-song/",
            payload={"boxSlug": box_slug, "option": option, "duration_minutes": duration},
            expected_statuses=(200, 400, 403),
            action="pin.post",
        )
        if not ok2:
            return False

        if status_code2 == 200:
            ctx.pins += 1
            self.log_ok(ctx, "pin", f"box={box_slug} duration={duration}")
            return True

        self.log_warning(ctx, "pin", f"échec métier attendu status={status_code2} box={box_slug}")
        return False

    def share_link(self, ctx: SeedContext, owner_client: APIClient, opener_client: APIClient, dep_public_key: str) -> bool:
        ok, data, _ = self.api_request(
            ctx,
            owner_client,
            "post",
            "/box-management/links/",
            payload={"dep_public_key": dep_public_key},
            expected_statuses=(200, 403, 404),
            action="share_link.create",
        )
        if not ok:
            return False

        slug = (data or {}).get("slug")
        if not slug:
            self.log_warning(ctx, "share_link", f"création impossible pour dep_public_key={dep_public_key}")
            return False

        ok2, _data2, status_code2 = self.api_request(
            ctx,
            opener_client,
            "get",
            f"/box-management/links/{slug}/",
            expected_statuses=(200, 410),
            action="share_link.open",
        )
        if not ok2:
            return False

        if status_code2 == 200:
            ctx.links += 1
            self.log_ok(ctx, "share_link", f"slug={slug} ouvert par autre user")
            return True

        self.log_warning(ctx, "share_link", f"slug={slug} expiré/supprimé status={status_code2}")
        return False

    def discovered(self, ctx: SeedContext, client: APIClient) -> bool:
        ok, data, _ = self.api_request(
            ctx,
            client,
            "get",
            "/box-management/discovered-songs",
            query={"limit": 20, "offset": 0},
            expected_statuses=(200,),
            action="discovered",
        )
        if not ok:
            return False

        sessions = (data or {}).get("sessions") or []
        ctx.discoveries += len(sessions)
        self.log_ok(ctx, "discovered", f"{len(sessions)} sessions découvertes")
        return True

    def messages(self, ctx: SeedContext, sender_client: APIClient, receiver_client: APIClient, receiver_id: int, song_option: dict[str, Any]) -> bool:
        ok, data, status_code = self.api_request(
            ctx,
            sender_client,
            "post",
            "/messages/thread/start",
            payload={"target_user_id": receiver_id, "song": song_option, "text": "Salut, tu connais ce son ?"},
            expected_statuses=(201, 200, 409),
            action="messages.start",
        )
        if not ok:
            return False

        thread_id = (data or {}).get("thread_id")
        if not thread_id:
            self.log_warning(ctx, "messages", f"pas de thread_id status={status_code}")
            return False

        _ = self.api_request(
            ctx,
            receiver_client,
            "post",
            f"/messages/thread/{thread_id}/reply",
            payload={"text": "Oui, excellent choix !"},
            expected_statuses=(200, 409, 429),
            action="messages.reply",
        )
        _ = self.api_request(
            ctx,
            sender_client,
            "get",
            f"/messages/thread/{thread_id}",
            expected_statuses=(200,),
            action="messages.detail",
        )
        _ = self.api_request(
            ctx,
            sender_client,
            "get",
            "/messages/summary",
            expected_statuses=(200,),
            action="messages.summary",
        )

        ctx.messages += 1
        self.log_ok(ctx, "messages", f"thread_id={thread_id}")
        return True

    def handle(self, *args, **options):
        users_count = int(options["users"])
        deposits_per_box = int(options["deposits_per_box"])
        if users_count <= 1:
            raise CommandError("--users doit être > 1")
        if deposits_per_box <= 0:
            raise CommandError("--deposits-per-box doit être > 0")

        ctx = SeedContext(
            rng=random.Random(options.get("seed")),
            dry_run=bool(options.get("dry_run")),
            verbose_errors=bool(options.get("errors")),
        )

        requested_boxes = [str(slug).strip() for slug in options["boxes"] if str(slug).strip()]
        if not requested_boxes:
            raise CommandError("Aucune box fournie")

        def _aliases(slug: str) -> list[str]:
            return [slug, slug.replace("_", "-"), slug.replace("-", "_")]

        boxes_by_requested: dict[str, Box] = {}
        for requested_slug in requested_boxes:
            box = Box.objects.filter(url__in=_aliases(requested_slug)).first()
            if box:
                boxes_by_requested[requested_slug] = box

        missing_boxes = [slug for slug in requested_boxes if slug not in boxes_by_requested]
        if missing_boxes:
            self.log_error(ctx, "bootstrap.boxes", f"boîtes manquantes: {', '.join(missing_boxes)}")
            raise CommandError("Boîtes requises absentes, arrêt propre.")

        box_coords: dict[str, tuple[float, float]] = {}
        for slug in requested_boxes:
            box = boxes_by_requested[slug]
            point = LocationPoint.objects.filter(box=box).order_by("id").first()
            if not point:
                if ctx.dry_run:
                    self.log_warning(ctx, "bootstrap.locations", f"(dry-run) aucun LocationPoint pour box={box.url}")
                    box_coords[slug] = (0.0, 0.0)
                    continue
                point = LocationPoint.objects.create(
                    box=box,
                    latitude=48.8566,
                    longitude=2.3522,
                    dist_location=50000,
                )
                self.log_warning(
                    ctx,
                    "bootstrap.locations",
                    f"LocationPoint créé pour box={box.url} (référentiel minimal)",
                )
            box_coords[slug] = (float(point.latitude), float(point.longitude))

        self.log_ok(ctx, "bootstrap", f"{len(requested_boxes)} boîtes validées")
        resolved_box_slugs = [boxes_by_requested[slug].url for slug in requested_boxes]

        clients_by_user: list[tuple[User, APIClient]] = []
        for idx in range(users_count):
            user = self.create_user(ctx, idx)
            client = APIClient()
            if not self.login_user(ctx, client, user):
                self.log_error(ctx, "login_user", f"échec login pour {user.username}")
                if not ctx.dry_run:
                    raise CommandError("Impossible de poursuivre sans authentification utilisateur.")
            clients_by_user.append((user, client))

        for user, client in clients_by_user:
            for requested_slug in requested_boxes:
                lat, lon = box_coords[requested_slug]
                box_slug = boxes_by_requested[requested_slug].url
                opened = self.open_box_session(ctx, client, user, box_slug, lat, lon)
                if not opened:
                    self.log_warning(ctx, "open_box_session", f"session non ouverte pour {user.username} / {box_slug}")

        songs_cache: list[dict[str, Any]] = []
        for _user, client in clients_by_user:
            query = ctx.rng.choice(SEARCH_QUERIES)
            song = self.search_song(ctx, client, query)
            if song:
                songs_cache.append(song)

        if not songs_cache:
            self.log_warning(ctx, "search_song", "aucune chanson trouvée, fallback statique")
            songs_cache.append(
                {
                    "provider_code": "spotify",
                    "platform_id": 1,
                    "provider_track_id": "3n3Ppam7vgaVa1iaRUc9Lp",
                    "id": "3n3Ppam7vgaVa1iaRUc9Lp",
                    "title": "Mr. Brightside",
                    "name": "Mr. Brightside",
                    "artist": "The Killers",
                    "artists": ["The Killers"],
                    "image_url": "",
                    "image_url_small": "",
                    "duration": 223,
                    "url": "https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp",
                }
            )

        deposit_keys: list[str] = []
        for box_slug in resolved_box_slugs:
            for _ in range(deposits_per_box):
                user, client = ctx.rng.choice(clients_by_user)
                option = ctx.rng.choice(songs_cache)
                dep_key = self.deposit_song(ctx, client, box_slug, option)
                if dep_key:
                    deposit_keys.append(dep_key)
                else:
                    self.log_warning(ctx, "deposit_song", f"échec dépôt pour {user.username} / {box_slug}")

        for dep_key in deposit_keys[: max(1, len(deposit_keys) // 2)]:
            _user, client = ctx.rng.choice(clients_by_user)
            self.reveal(ctx, client, dep_key)

        # Tentative insuffisance de points (pas toujours reproductible selon règles métier)
        if deposit_keys:
            test_user, test_client = clients_by_user[0]
            insufficient_triggered = False
            for dep_key in deposit_keys:
                ok, data, status_code = self.api_request(
                    ctx,
                    test_client,
                    "post",
                    "/box-management/revealSong",
                    payload={"dep_public_key": dep_key, "context": "box"},
                    expected_statuses=(200, 400, 403),
                    action="reveal.insufficient-test",
                )
                if not ok:
                    continue
                if status_code in (400, 403) and isinstance(data, dict) and data.get("code") == "INSUFFICIENT_POINTS":
                    insufficient_triggered = True
                    self.log_ok(ctx, "reveal.insufficient", f"cas points insuffisants obtenu pour {test_user.username}")
                    break
            if not insufficient_triggered:
                self.log_warning(ctx, "reveal.insufficient", "cas points insuffisants non atteint sur ce run")

        # Réactions + catalogue emojis + achat potentiel
        emoji_free_id = None
        emoji_paid_id = None
        sample_user, sample_client = clients_by_user[0]
        ok_catalog, catalog_data, _ = self.api_request(
            ctx,
            sample_client,
            "get",
            "/box-management/emojis/catalog",
            expected_statuses=(200,),
            action="emoji.catalog",
        )
        if ok_catalog:
            for emoji in (catalog_data or {}).get("actives_paid", []):
                cost = int(emoji.get("cost") or 0)
                if cost == 0 and emoji_free_id is None:
                    emoji_free_id = emoji.get("id")
                if cost > 0 and emoji_paid_id is None:
                    emoji_paid_id = emoji.get("id")

        if emoji_paid_id:
            self.api_request(
                ctx,
                sample_client,
                "post",
                "/box-management/emojis/purchase",
                payload={"emoji_id": emoji_paid_id},
                expected_statuses=(200, 400),
                action="emoji.purchase",
            )

        for dep_key in deposit_keys[: min(6, len(deposit_keys))]:
            _user, client = ctx.rng.choice(clients_by_user)
            if emoji_free_id:
                self.react(ctx, client, dep_key, emoji_free_id)
            self.react(ctx, client, dep_key, None)

        # Commentaires (succès + refus potentiels)
        for dep_key in deposit_keys[: min(6, len(deposit_keys))]:
            _user, client = ctx.rng.choice(clients_by_user)
            text = ctx.rng.choice(
                [
                    "Très bon son 👌",
                    "Je valide totalement.",
                    "Ça passe bien ici.",
                    "Quel classique !",
                ]
            )
            self.comment(ctx, client, dep_key, text)

        # Pin
        for box_slug in resolved_box_slugs:
            _user, client = ctx.rng.choice(clients_by_user)
            self.pin(ctx, client, box_slug, ctx.rng.choice(songs_cache))

        # Liens
        if deposit_keys and len(clients_by_user) >= 2:
            owner_user, owner_client = clients_by_user[0]
            opener_user, opener_client = clients_by_user[1]
            _ = owner_user, opener_user
            for dep_key in deposit_keys[: min(4, len(deposit_keys))]:
                self.share_link(ctx, owner_client, opener_client, dep_key)

        # Découvertes
        for _user, client in clients_by_user[:3]:
            self.discovered(ctx, client)

        # Messages privés
        if len(clients_by_user) >= 2:
            sender_user, sender_client = clients_by_user[0]
            receiver_user, receiver_client = clients_by_user[1]
            self.messages(ctx, sender_client, receiver_client, receiver_user.id or 0, ctx.rng.choice(songs_cache))
            _ = sender_user

        # Favoris
        fav_user, fav_client = clients_by_user[0]
        ok_fav, _fav_data, fav_status = self.api_request(
            ctx,
            fav_client,
            "post",
            "/users/set-favorite-song",
            payload={"option": ctx.rng.choice(songs_cache)},
            expected_statuses=(200, 400, 403),
            action="favorite.set",
        )
        if ok_fav and fav_status == 200:
            self.log_ok(ctx, "favorite", f"chanson favorite définie pour {fav_user.username}")
        elif ok_fav:
            self.log_warning(ctx, "favorite", f"non défini status={fav_status}")

        self.stdout.write("")
        self.stdout.write("===== RÉSUMÉ seed_activity =====")
        for requested_slug in requested_boxes:
            self.stdout.write(f"box={boxes_by_requested[requested_slug].url}")
        self.stdout.write(f"users créés: {ctx.users_created}")
        self.stdout.write(f"sessions ouvertes: {ctx.sessions_opened}")
        self.stdout.write(f"dépôts: {ctx.deposits}")
        self.stdout.write(f"reveals: {ctx.reveals}")
        self.stdout.write(f"réactions: {ctx.reactions}")
        self.stdout.write(f"commentaires: {ctx.comments}")
        self.stdout.write(f"pins: {ctx.pins}")
        self.stdout.write(f"liens: {ctx.links}")
        self.stdout.write(f"découvertes: {ctx.discoveries}")
        self.stdout.write(f"messages: {ctx.messages}")
        self.stdout.write(f"total OK: {ctx.ok_count} | WARNING: {ctx.warning_count} | ERROR: {ctx.error_count}")
