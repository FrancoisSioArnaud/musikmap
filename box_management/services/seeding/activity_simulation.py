import random
import secrets
from dataclasses import dataclass
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from box_management.models import Box, BoxSession, Comment, Deposit, DiscoveredSong, Emoji, EmojiRight, Reaction, Song
from box_management.services.comments.moderation_rules import _get_profile_picture_url, _normalize_comment_text
from private_messages.models import ChatMessage, ChatThread
from private_messages.services.moderation import validate_message_text

DEFAULT_BOX_SLUGS = ["chantier-naval", "hopital-bellier"]
COMMENT_REASON_CODE = "seed_activity_comment"
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


def _song_public_key():
    return secrets.token_urlsafe(12)[:25]


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


def _ensure_song(title, artist):
    song = Song.objects.filter(title__iexact=title).first()
    if song:
        return song, False

    song = Song.objects.create(
        public_key=_song_public_key(),
        title=title[:150],
        artists_json=[artist],
        duration=0,
        n_deposits=0,
    )
    return song, True


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
        song, created_song = _ensure_song(title, artist)

        timestamp = _pick_timestamp(rng, day_index=day_index)
        deposit = Deposit.objects.create(
            song=song,
            box=box,
            user=user,
            deposit_type=Deposit.DEPOSIT_TYPE_BOX,
            deposited_at=timestamp,
        )

        if created_song:
            song.n_deposits = 1
            song.save(update_fields=["n_deposits"])
        else:
            Song.objects.filter(pk=song.pk).update(n_deposits=(song.n_deposits or 0) + 1)

        created.append(deposit)

    return created


def _create_reveals(rng, *, box, day_deposits, users, day_index, intensity_conf):
    min_reveal, max_reveal = intensity_conf["reveals"]
    n_reveals = min(len(day_deposits), rng.randint(min_reveal, max_reveal))
    if n_reveals <= 0:
        return 0

    created = 0
    for deposit in rng.sample(day_deposits, k=n_reveals):
        candidates = [user for user in users if user.id != deposit.user_id]
        if not candidates:
            continue
        user = rng.choice(candidates)
        _, was_created = DiscoveredSong.objects.get_or_create(
            user=user,
            deposit=deposit,
            defaults={"discovered_type": "revealed", "context": "box"},
        )
        if was_created:
            reveal_time = _pick_timestamp(rng, day_index=day_index, start_hour=10, end_hour=23)
            DiscoveredSong.objects.filter(user=user, deposit=deposit).update(discovered_at=reveal_time)
            created += 1
    return created


def _create_reactions(rng, *, box, day_deposits, users, emojis, day_index, intensity_conf):
    if not day_deposits or not emojis:
        return 0

    min_rea, max_rea = intensity_conf["reactions"]
    n_reactions = rng.randint(min_rea, max_rea)
    created = 0
    for _ in range(n_reactions):
        deposit = rng.choice(day_deposits)
        reactors = [u for u in users if u.id != deposit.user_id]
        if not reactors:
            continue
        user = rng.choice(reactors)
        emoji = rng.choice(emojis)

        reaction, was_created = Reaction.objects.get_or_create(user=user, deposit=deposit, defaults={"emoji": emoji})
        if not was_created:
            if reaction.emoji_id != emoji.id:
                reaction.emoji = emoji
                reaction.save(update_fields=["emoji", "updated_at"])
            continue

        created_at = _pick_timestamp(rng, day_index=day_index, start_hour=9, end_hour=23)
        Reaction.objects.filter(pk=reaction.pk).update(created_at=created_at, updated_at=created_at)
        created += 1

    return created


def _create_comments(rng, *, box, day_deposits, users, day_index, intensity_conf):
    if not day_deposits:
        return 0

    min_com, max_com = intensity_conf["comments"]
    n_comments = rng.randint(min_com, max_com)
    created = 0

    for _ in range(n_comments):
        deposit = rng.choice(day_deposits)
        commenters = [u for u in users if u.id != deposit.user_id]
        if not commenters:
            continue

        user = rng.choice(commenters)
        text = rng.choice(COMMENT_TEMPLATES)
        normalized_text = _normalize_comment_text(text)

        exists = Comment.objects.filter(user=user, deposit=deposit, normalized_text=normalized_text).exists()
        if exists:
            continue

        comment = Comment.objects.create(
            client=getattr(box, "client", None),
            deposit=deposit,
            user=user,
            text=text,
            normalized_text=normalized_text,
            status=Comment.STATUS_PUBLISHED,
            reason_code=COMMENT_REASON_CODE,
            risk_score=0,
            risk_flags=[],
            reports_count=0,
            deposit_public_key=deposit.public_key or "",
            deposit_box_name=getattr(box, "name", "") or "",
            deposit_box_url=getattr(box, "url", "") or "",
            deposit_deleted=False,
            deposit_owner_user_id=deposit.user_id,
            deposit_owner_username=getattr(deposit.user, "username", "") or "",
            author_username=user.username or "",
            author_display_name=getattr(user, "display_name", "") or user.username or "",
            author_email=user.email or "",
            author_avatar_url=_get_profile_picture_url(user) or "",
            author_ip=None,
            author_user_agent=COMMENT_USER_AGENT,
        )
        created_at = _pick_timestamp(rng, day_index=day_index, start_hour=11, end_hour=23)
        Comment.objects.filter(pk=comment.pk).update(created_at=created_at, updated_at=created_at)
        created += 1

    return created


def _sorted_pair(user_a, user_b):
    return (user_a, user_b) if user_a.id <= user_b.id else (user_b, user_a)


def _create_private_messages(rng, *, users_by_username, day_index, intensity_conf):
    min_msg, max_msg = intensity_conf["messages"]
    n_threads = rng.randint(min_msg, max_msg)
    if n_threads <= 0:
        return 0

    usernames = list(users_by_username.keys())
    created_messages = 0

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
                second = ChatMessage.objects.create(
                    thread=thread,
                    sender=receiver,
                    message_type=ChatMessage.TYPE_TEXT,
                    text=cleaned_reply,
                )
                second_at = first_at + timedelta(minutes=rng.randint(5, 180))
                ChatMessage.objects.filter(pk=second.pk).update(created_at=second_at)
                created_messages += 1

    return created_messages


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
                day_deposits = _create_deposits_for_day(
                    rng,
                    box=box,
                    day_index=day_index,
                    personas=PERSONAS,
                    users_by_username=users_by_username,
                    intensity_conf=INTENSITY_CONFIG[intensity],
                )
                summary.deposits += len(day_deposits)
                touched_users.update(dep.user_id for dep in day_deposits if dep.user_id)

                summary.reveals += _create_reveals(
                    rng,
                    box=box,
                    day_deposits=day_deposits,
                    users=users,
                    day_index=day_index,
                    intensity_conf=INTENSITY_CONFIG[intensity],
                )
                summary.reactions += _create_reactions(
                    rng,
                    box=box,
                    day_deposits=day_deposits,
                    users=users,
                    emojis=emojis,
                    day_index=day_index,
                    intensity_conf=INTENSITY_CONFIG[intensity],
                )
                summary.comments += _create_comments(
                    rng,
                    box=box,
                    day_deposits=day_deposits,
                    users=users,
                    day_index=day_index,
                    intensity_conf=INTENSITY_CONFIG[intensity],
                )
                summary.private_messages += _create_private_messages(
                    rng,
                    users_by_username=users_by_username,
                    day_index=day_index,
                    intensity_conf=INTENSITY_CONFIG[intensity],
                )

            summary.users_touched = len(touched_users)
            summaries.append(summary)

    return summaries, None
