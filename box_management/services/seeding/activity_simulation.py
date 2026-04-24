import random
import time
from dataclasses import dataclass, field
from datetime import timedelta
from difflib import SequenceMatcher

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from box_management.models import Box, BoxSession, Comment, Deposit, DiscoveredSong, Emoji, EmojiRight, Reaction
from box_management.provider_services import ProviderRateLimitError, ProviderSearchError, backend_search_tracks_strict
from box_management.services.comments.create_comment import create_comment
from box_management.services.comments.moderation_rules import _normalize_comment_text
from box_management.services.deposits.song_creation import create_song_deposit
from box_management.services.reactions.add_reaction import add_or_remove_reaction
from box_management.services.reveal.reveal_song import reveal_song_for_user
from la_boite_a_son.economy import COST_REVEAL_BOX
from private_messages.models import ChatMessage, ChatThread
from private_messages.services.moderation import validate_message_text

DEFAULT_BOX_SLUGS = ["chantier-naval", "hopital-bellier"]
COMMENT_USER_AGENT = "seed_activity_command"

INTENSITY_CONFIG = {
    "low": {
        "deposits": (1, 2),
        "reactions": (2, 4),
        "comments": (0, 1),
        "reveals": (1, 2),
        "messages": (0, 1),
    },
    "medium": {
        "deposits": (2, 4),
        "reactions": (4, 8),
        "comments": (1, 3),
        "reveals": (2, 4),
        "messages": (1, 2),
    },
    "high": {
        "deposits": (4, 7),
        "reactions": (8, 12),
        "comments": (3, 6),
        "reveals": (3, 6),
        "messages": (2, 4),
    },
}

PERSONAS = [
    {
        "username": "nora.boom",
        "first_name": "Nora",
        "last_name": "Boom",
        "social_tone": "Toujours enthousiaste, adore les refrains qui restent.",
        "primary_genre": "indie pop",
        "secondary_genre": "chanson française",
        "songs": [
            ("Amour plastique", "Videoclub"),
            ("Nights", "Frank Ocean"),
            ("Respire encore", "Clara Luciani"),
            ("Le temps est bon", "Bon Entendeur"),
            ("Sunset", "The xx"),
            ("Tout oublier", "Angèle"),
        ],
    },
    {
        "username": "malo.rapfr",
        "first_name": "Malo",
        "last_name": "Rime",
        "social_tone": "Commente court, souvent sur les punchlines.",
        "primary_genre": "rap FR",
        "secondary_genre": "afro",
        "songs": [
            ("Feu de bois", "Damso"),
            ("TPA", "Gazo"),
            ("Djadja", "Aya Nakamura"),
            ("Basique", "Orelsan"),
            ("Jolie", "Ninho"),
            ("Mwaka Moon", "Kalash"),
        ],
    },
    {
        "username": "ines.jazz",
        "first_name": "Inès",
        "last_name": "Blue",
        "social_tone": "Parle de groove et de prod, ton posé.",
        "primary_genre": "jazz/funk",
        "secondary_genre": "soul/RnB",
        "songs": [
            ("Them Changes", "Thundercat"),
            ("Nakamarra", "Hiatus Kaiyote"),
            ("Tadow", "Masego, FKJ"),
            ("Get You", "Daniel Caesar"),
            ("Redbone", "Childish Gambino"),
            ("What About Me?", "Snarky Puppy"),
        ],
    },
    {
        "username": "sam.electro",
        "first_name": "Sam",
        "last_name": "Pulse",
        "social_tone": "Aime les tracks de nuit et les transitions propres.",
        "primary_genre": "électro",
        "secondary_genre": "house",
        "songs": [
            ("Strobe", "deadmau5"),
            ("Midnight City", "M83"),
            ("Innerbloom", "RÜFÜS DU SOL"),
            ("Safe and Sound", "Justice"),
            ("Roadgame", "Kavinsky"),
            ("On Hold", "The xx"),
        ],
    },
    {
        "username": "lina.altrock",
        "first_name": "Lina",
        "last_name": "Volt",
        "social_tone": "Plus discrète mais très active en réactions.",
        "primary_genre": "rock alternatif",
        "secondary_genre": "indie pop",
        "songs": [
            ("Do I Wanna Know?", "Arctic Monkeys"),
            ("Reptilia", "The Strokes"),
            ("Obstacle 1", "Interpol"),
            ("Fluorescent Adolescent", "Arctic Monkeys"),
            ("My Number", "Foals"),
            ("Take Me Out", "Franz Ferdinand"),
        ],
    },
    {
        "username": "yass.afro",
        "first_name": "Yass",
        "last_name": "Flow",
        "social_tone": "Met de l'ambiance, relance souvent en DM.",
        "primary_genre": "afro",
        "secondary_genre": "rap FR",
        "songs": [
            ("Ye", "Burna Boy"),
            ("Calm Down", "Rema"),
            ("Mon soleil", "Dadju, Anitta"),
            ("Drogba", "Afro B"),
            ("Pookie", "Aya Nakamura"),
            ("Soweto", "Victony"),
        ],
    },
]

REACTION_TEMPLATES = ["🔥", "🤯", "🎶", "😎", "✨", "🙌"]
COMMENT_TEMPLATES = [
    "Très bon choix, ça colle grave à l'ambiance.",
    "Je l'avais pas écouté depuis longtemps, merci pour le rappel.",
    "La prod est super propre sur celui-là.",
    "Gros mood de fin de journée, validé.",
    "Bien vu, ça passe trop bien dans cette box.",
    "Incroyable découverte, je l'ajoute direct.",
]
DM_OPENERS = [
    "Ton dernier dépôt m'a mis trop bien.",
    "On a clairement les mêmes goûts sur ce style.",
    "Merci pour la reco, je l'ai envoyée à un pote.",
    "Je connaissais pas du tout, grosse claque.",
]


@dataclass
class ActivitySeedSummary:
    box_slug: str
    users_touched: int = 0
    created_users: int = 0
    deposits: int = 0
    reveals: int = 0
    reactions: int = 0
    comments: int = 0
    private_messages: int = 0
    warnings: int = 0
    warning_messages: list[str] = field(default_factory=list)


def _push_warning(warning_messages, message, *, max_messages=100):
    if len(warning_messages) < max_messages:
        warning_messages.append(message)


def _pick_timestamp(rng, *, day_index, start_hour=8, end_hour=23):
    now = timezone.now()
    base = now - timedelta(days=day_index)
    hour = rng.randint(start_hour, end_hour)
    minute = rng.randint(0, 59)
    second = rng.randint(0, 59)
    return base.replace(hour=hour, minute=minute, second=second, microsecond=0)


def _ensure_boxes(slugs):
    boxes_by_slug = {box.url: box for box in Box.objects.filter(url__in=slugs).select_related("client")}
    missing = [slug for slug in slugs if slug not in boxes_by_slug]
    if missing:
        raise ValueError(f"Box introuvable(s): {', '.join(missing)}")
    return [boxes_by_slug[slug] for slug in slugs]


def _ensure_persona_users(rng):
    User = get_user_model()
    usernames = [p["username"] for p in PERSONAS]
    existing = {u.username: u for u in User.objects.filter(username__in=usernames)}

    created = 0
    users = {}
    for persona in PERSONAS:
        user = existing.get(persona["username"])
        if not user:
            user = User.objects.create_user(
                username=persona["username"],
                password="test1234",
                first_name=persona["first_name"],
                last_name=persona["last_name"],
                points=rng.randint(200, 500),
                last_platform="",
                is_guest=False,
            )
            created += 1
        users[persona["username"]] = user

    return users, created


def _normalized(value):
    return " ".join(
        str(value or "").strip().lower().replace("&", " ").replace("feat.", " ").replace("feat", " ").split()
    )


def _pick_best_spotify_track(candidates, *, title, artist):
    expected_title = _normalized(title)
    expected_artist = _normalized(artist)
    if not expected_title or not expected_artist:
        return None

    best_track = None
    best_score = 0.0
    for track in candidates:
        title_ratio = SequenceMatcher(None, expected_title, _normalized(track.get("title"))).ratio()
        artists = ", ".join(track.get("artists") or [])
        artist_ratio = SequenceMatcher(None, expected_artist, _normalized(artists)).ratio()
        score = (title_ratio * 0.65) + (artist_ratio * 0.35)
        if score > best_score:
            best_score = score
            best_track = track

    if best_score < 0.72:
        return None
    return best_track


def _search_spotify_track_with_retry(query, *, max_attempts=3, sleep_fn=None):
    sleep = sleep_fn or time.sleep
    last_error = None
    for attempt in range(1, max_attempts + 1):
        try:
            return backend_search_tracks_strict("spotify", query)
        except ProviderRateLimitError as exc:
            last_error = exc
            if attempt >= max_attempts:
                break
            sleep(int(exc.retry_after or 1))
        except ProviderSearchError as exc:
            last_error = exc
            break
    if last_error:
        raise last_error
    return []


def _ensure_emoji_pool(users_by_username):
    emojis = list(Emoji.objects.filter(active=True).order_by("id"))
    if not emojis:
        return [], 1

    paid = [emoji for emoji in emojis if int(emoji.cost or 0) > 0]
    if paid:
        for user in users_by_username.values():
            for emoji in paid:
                EmojiRight.objects.get_or_create(user=user, emoji=emoji)
    return emojis, 0


def _create_deposits_for_day(rng, *, box, day_index, personas, users_by_username, intensity_conf):
    created = []
    warnings = 0
    warning_messages = []
    min_dep, max_dep = intensity_conf["deposits"]
    n_deposits = rng.randint(min_dep, max_dep)

    weighted_personas = []
    for persona in personas:
        weight = 3 if persona["username"] in {"malo.rapfr", "nora.boom"} else 2
        weighted_personas.extend([persona] * weight)

    for _ in range(n_deposits):
        persona = rng.choice(weighted_personas)
        user = users_by_username[persona["username"]]

        existing_count = Deposit.objects.filter(box=box, user=user, deposit_type=Deposit.DEPOSIT_TYPE_BOX).count()
        songs = persona["songs"]
        title, artist = songs[existing_count % len(songs)]
        query = f"{title} {artist}"
        try:
            spotify_results = _search_spotify_track_with_retry(query)
        except ProviderRateLimitError:
            warnings += 1
            _push_warning(warning_messages, f"[{box.url}] j-{day_index} rate-limit provider sur '{query}'.")
            continue
        except ProviderSearchError:
            warnings += 1
            _push_warning(warning_messages, f"[{box.url}] j-{day_index} erreur provider sur '{query}'.")
            continue

        track = _pick_best_spotify_track(spotify_results, title=title, artist=artist)
        if not track:
            warnings += 1
            _push_warning(warning_messages, f"[{box.url}] j-{day_index} aucun match fiable pour '{query}'.")
            continue
        if not int(track.get("duration") or 0):
            warnings += 1
            _push_warning(warning_messages, f"[{box.url}] j-{day_index} track sans durée pour '{query}'.")
            continue
        if not (track.get("image_url") or track.get("image_url_small")):
            warnings += 1
            _push_warning(warning_messages, f"[{box.url}] j-{day_index} track sans image pour '{query}'.")
            continue

        timestamp = _pick_timestamp(rng, day_index=day_index)
        try:
            deposit, _song, was_created = create_song_deposit(
                request=None,
                user=user,
                option=track,
                deposit_type=Deposit.DEPOSIT_TYPE_BOX,
                box=box,
                reuse_recent_window_seconds=0,
            )
        except ValueError:
            warnings += 1
            _push_warning(warning_messages, f"[{box.url}] j-{day_index} dépôt refusé pour '{query}'.")
            continue

        if was_created:
            Deposit.objects.filter(pk=deposit.pk).update(deposited_at=timestamp)
        created.append(deposit)

    return created, warnings, warning_messages


def _create_reveals(rng, *, box, day_deposits, users, day_index, intensity_conf):
    min_reveal, max_reveal = intensity_conf["reveals"]
    n_reveals = min(len(day_deposits), rng.randint(min_reveal, max_reveal))
    if n_reveals <= 0:
        return 0, 0, []

    created = 0
    warnings = 0
    warning_messages = []
    for deposit in rng.sample(day_deposits, k=n_reveals):
        candidates = [user for user in users if user.id != deposit.user_id]
        if not candidates:
            continue
        user = rng.choice(candidates)
        result, error = reveal_song_for_user(
            user=user,
            dep_public_key=deposit.public_key,
            context="box",
            cost_reveal_box=COST_REVEAL_BOX,
        )
        if error:
            warnings += 1
            _push_warning(
                warning_messages,
                f"[{box.url}] j-{day_index} reveal impossible pour dep={deposit.public_key}.",
            )
            continue
        if result and DiscoveredSong.objects.filter(user=user, deposit=deposit).exists():
            reveal_time = _pick_timestamp(rng, day_index=day_index, start_hour=10, end_hour=23)
            DiscoveredSong.objects.filter(user=user, deposit=deposit).update(discovered_at=reveal_time)
            created += 1
    return created, warnings, warning_messages


def _create_reactions(rng, *, box, day_deposits, users, emojis, day_index, intensity_conf):
    if not day_deposits or not emojis:
        return 0, 0, []

    min_rea, max_rea = intensity_conf["reactions"]
    n_reactions = rng.randint(min_rea, max_rea)
    created = 0
    warnings = 0
    warning_messages = []
    for _ in range(n_reactions):
        deposit = rng.choice(day_deposits)
        reactors = [u for u in users if u.id != deposit.user_id]
        if not reactors:
            continue
        user = rng.choice(reactors)
        emoji = rng.choice(emojis)

        payload, error = add_or_remove_reaction(user=user, dep_public_key=deposit.public_key, emoji_id=emoji.id)
        if error:
            reveal_song_for_user(
                user=user,
                dep_public_key=deposit.public_key,
                context="box",
                cost_reveal_box=COST_REVEAL_BOX,
            )
            payload, error = add_or_remove_reaction(user=user, dep_public_key=deposit.public_key, emoji_id=emoji.id)
        if error:
            warnings += 1
            _push_warning(
                warning_messages,
                f"[{box.url}] j-{day_index} réaction impossible pour dep={deposit.public_key}.",
            )
            continue
        reaction = Reaction.objects.filter(user=user, deposit=deposit).first()
        if not reaction:
            warnings += 1
            _push_warning(
                warning_messages,
                f"[{box.url}] j-{day_index} réaction absente après création dep={deposit.public_key}.",
            )
            continue
        created_at = _pick_timestamp(rng, day_index=day_index, start_hour=9, end_hour=23)
        Reaction.objects.filter(pk=reaction.pk).update(created_at=created_at, updated_at=created_at)
        if payload is not None:
            created += 1

    return created, warnings, warning_messages


def _create_comments(rng, *, box, day_deposits, users, day_index, intensity_conf):
    if not day_deposits:
        return 0, 0, []

    min_com, max_com = intensity_conf["comments"]
    n_comments = rng.randint(min_com, max_com)
    created = 0
    warnings = 0
    warning_messages = []

    for _ in range(n_comments):
        deposit = rng.choice(day_deposits)
        commenters = [u for u in users if u.id != deposit.user_id]
        if not commenters:
            continue

        user = rng.choice(commenters)
        text = rng.choice(COMMENT_TEMPLATES)
        normalized_text = _normalize_comment_text(text)
        if Comment.objects.filter(user=user, deposit=deposit, normalized_text=normalized_text).exists():
            continue

        result, error = create_comment(
            user=user,
            dep_public_key=deposit.public_key,
            text_value=text,
            song_option=None,
            author_ip=None,
            author_user_agent=COMMENT_USER_AGENT,
        )
        if error:
            warnings += 1
            _push_warning(
                warning_messages,
                f"[{box.url}] j-{day_index} commentaire refusé dep={deposit.public_key}.",
            )
            continue
        comment = (result or {}).get("comment")
        if not comment:
            warnings += 1
            _push_warning(
                warning_messages,
                f"[{box.url}] j-{day_index} commentaire non créé dep={deposit.public_key}.",
            )
            continue
        created_at = _pick_timestamp(rng, day_index=day_index, start_hour=11, end_hour=23)
        Comment.objects.filter(pk=comment.pk).update(created_at=created_at, updated_at=created_at)
        created += 1

    return created, warnings, warning_messages


def _sorted_pair(user_a, user_b):
    return (user_a, user_b) if user_a.id <= user_b.id else (user_b, user_a)


def _create_private_messages(rng, *, users_by_username, day_index, intensity_conf):
    min_msg, max_msg = intensity_conf["messages"]
    n_threads = rng.randint(min_msg, max_msg)
    if n_threads <= 0:
        return 0, 0, []

    usernames = list(users_by_username.keys())
    created_messages = 0
    warnings = 0
    warning_messages = []

    for _ in range(n_threads):
        initiator_username = rng.choice(usernames)
        receiver_username = rng.choice([u for u in usernames if u != initiator_username])
        initiator = users_by_username[initiator_username]
        receiver = users_by_username[receiver_username]

        left, right = _sorted_pair(initiator, receiver)
        thread, _ = ChatThread.objects.get_or_create(
            user_a=left,
            user_b=right,
            defaults={"initiator": initiator, "status": ChatThread.STATUS_ACCEPTED, "accepted_at": timezone.now()},
        )

        if thread.status != ChatThread.STATUS_ACCEPTED:
            thread.status = ChatThread.STATUS_ACCEPTED
            thread.accepted_at = timezone.now()
            thread.refused_at = None
            thread.expired_at = None
            thread.save(update_fields=["status", "accepted_at", "refused_at", "expired_at", "updated_at"])

        opener = rng.choice(DM_OPENERS)
        ok, cleaned = validate_message_text(opener)
        if not ok:
            continue

        if ChatMessage.objects.filter(thread=thread, sender=initiator, text=cleaned).exists():
            continue

        first = ChatMessage.objects.create(
            thread=thread,
            sender=initiator,
            message_type=ChatMessage.TYPE_TEXT,
            text=cleaned,
        )
        first_at = _pick_timestamp(rng, day_index=day_index, start_hour=13, end_hour=22)
        ChatMessage.objects.filter(pk=first.pk).update(created_at=first_at)
        created_messages += 1

        if rng.random() < 0.8:
            reply_text = "Oui, super reco, on en a d'autres du même style ?"
            ok_reply, cleaned_reply = validate_message_text(reply_text)
            if ok_reply:
                if ChatMessage.objects.filter(thread=thread, sender=receiver, text=cleaned_reply).exists():
                    warnings += 1
                    _push_warning(
                        warning_messages,
                        f"j-{day_index} réponse DM déjà présente thread={thread.id}.",
                    )
                    continue
                second = ChatMessage.objects.create(
                    thread=thread,
                    sender=receiver,
                    message_type=ChatMessage.TYPE_TEXT,
                    text=cleaned_reply,
                )
                second_at = first_at + timedelta(minutes=rng.randint(5, 180))
                ChatMessage.objects.filter(pk=second.pk).update(created_at=second_at)
                created_messages += 1

    return created_messages, warnings, warning_messages


def seed_activity(*, box_slugs=None, days=10, intensity="medium", seed=None, dry_run=False):
    if intensity not in INTENSITY_CONFIG:
        raise ValueError("Intensity invalide. Utilise: low, medium, high.")

    box_slugs = list(box_slugs or DEFAULT_BOX_SLUGS)
    rng = random.Random(seed)

    boxes = _ensure_boxes(box_slugs)

    if dry_run:
        return [ActivitySeedSummary(box_slug=box.url, warnings=0) for box in boxes], "dry_run"

    with transaction.atomic():
        users_by_username, created_users = _ensure_persona_users(rng)
        users = list(users_by_username.values())
        emojis, emoji_warning = _ensure_emoji_pool(users_by_username)

        summaries = []
        for box in boxes:
            summary = ActivitySeedSummary(box_slug=box.url, created_users=created_users, warnings=emoji_warning)
            if emoji_warning:
                _push_warning(
                    summary.warning_messages,
                    f"[{box.url}] aucun emoji actif trouvé: réactions ignorées.",
                )

            for user in users:
                started = timezone.now() - timedelta(days=days)
                expires = timezone.now() + timedelta(days=7)
                BoxSession.objects.update_or_create(
                    user=user,
                    box=box,
                    defaults={"started_at": started, "expires_at": expires},
                )

            touched_users = set()
            for day_index in range(days):
                day_deposits, deposit_warnings, deposit_warning_messages = _create_deposits_for_day(
                    rng,
                    box=box,
                    day_index=day_index,
                    personas=PERSONAS,
                    users_by_username=users_by_username,
                    intensity_conf=INTENSITY_CONFIG[intensity],
                )
                summary.deposits += len(day_deposits)
                summary.warnings += deposit_warnings
                summary.warning_messages.extend(deposit_warning_messages)
                touched_users.update(dep.user_id for dep in day_deposits if dep.user_id)

                reveals, reveal_warnings, reveal_warning_messages = _create_reveals(
                    rng,
                    box=box,
                    day_deposits=day_deposits,
                    users=users,
                    day_index=day_index,
                    intensity_conf=INTENSITY_CONFIG[intensity],
                )
                summary.reveals += reveals
                summary.warnings += reveal_warnings
                summary.warning_messages.extend(reveal_warning_messages)
                reactions, reaction_warnings, reaction_warning_messages = _create_reactions(
                    rng,
                    box=box,
                    day_deposits=day_deposits,
                    users=users,
                    emojis=emojis,
                    day_index=day_index,
                    intensity_conf=INTENSITY_CONFIG[intensity],
                )
                summary.reactions += reactions
                summary.warnings += reaction_warnings
                summary.warning_messages.extend(reaction_warning_messages)
                comments, comment_warnings, comment_warning_messages = _create_comments(
                    rng,
                    box=box,
                    day_deposits=day_deposits,
                    users=users,
                    day_index=day_index,
                    intensity_conf=INTENSITY_CONFIG[intensity],
                )
                summary.comments += comments
                summary.warnings += comment_warnings
                summary.warning_messages.extend(comment_warning_messages)
                private_messages, pm_warnings, pm_warning_messages = _create_private_messages(
                    rng,
                    users_by_username=users_by_username,
                    day_index=day_index,
                    intensity_conf=INTENSITY_CONFIG[intensity],
                )
                summary.private_messages += private_messages
                summary.warnings += pm_warnings
                summary.warning_messages.extend(pm_warning_messages)

            summary.users_touched = len(touched_users)
            summaries.append(summary)

    return summaries, None
