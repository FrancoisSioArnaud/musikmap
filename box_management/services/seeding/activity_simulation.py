import random
from dataclasses import dataclass
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from box_management.models import Box, BoxSession, Comment, Deposit, DiscoveredSong, Emoji, EmojiRight, Reaction, Song
from box_management.provider_services import (
    backend_search_tracks,
    get_or_create_song_from_track,
    upsert_song_provider_link,
)
from box_management.services.comments.moderation_rules import _get_profile_picture_url, _normalize_comment_text
from private_messages.models import ChatMessage, ChatThread
from private_messages.services.moderation import validate_message_text

DEFAULT_BOX_SLUGS = ["chantier-naval", "hopital-bellier"]
COMMENT_REASON_CODE = "seed_activity_comment"
COMMENT_USER_AGENT = "seed_activity_command"

INTENSITY_CONFIG = {
    "low": {"deposits": (1, 2), "reactions": (2, 4), "comments": (0, 1), "reveals": (1, 2), "messages": (0, 1)},
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
            ("Respire encore", "Clara Luciani"),
            ("Le temps est bon", "Bon Entendeur"),
            ("Sunset", "The xx"),
            ("Tout oublier", "Angèle"),
            ("Aline", "Christophe"),
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
            ("Basique", "Orelsan"),
            ("Jolie", "Ninho"),
            ("Mwaka Moon", "Kalash"),
            ("Mauvaise idée", "Luther"),
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
            ("Baby I'm Yours", "Breakbot"),
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
    {
        "username": "claire.soul",
        "first_name": "Claire",
        "last_name": "Velvet",
        "social_tone": "Très chaleureuse, recommande des voix soul.",
        "primary_genre": "soul/RnB",
        "secondary_genre": "jazz/funk",
        "songs": [
            ("Best Part", "Daniel Caesar, H.E.R."),
            ("Gettin' In The Way", "Jill Scott"),
            ("Need U Bad", "Jazmine Sullivan"),
            ("Free Mind", "Tems"),
            ("Focus", "H.E.R."),
            ("Come Through and Chill", "Miguel"),
        ],
    },
    {
        "username": "tom.house",
        "first_name": "Tom",
        "last_name": "Night",
        "social_tone": "Dépose surtout en fin de journée, très club.",
        "primary_genre": "house",
        "secondary_genre": "électro",
        "songs": [
            ("You & Me - Flume Remix", "Disclosure, Eliza Doolittle"),
            ("Cola", "CamelPhat, Elderbrook"),
            ("White Noise", "Disclosure"),
            ("Losing It", "FISHER"),
            ("One More Time", "Daft Punk"),
            ("Music Sounds Better With You", "Stardust"),
        ],
    },
    {
        "username": "sarah.chanson",
        "first_name": "Sarah",
        "last_name": "Plume",
        "social_tone": "Aime les textes et les mélodies françaises.",
        "primary_genre": "chanson française",
        "secondary_genre": "indie pop",
        "songs": [
            ("Bruxelles je t'aime", "Angèle"),
            ("Dernière danse", "Indila"),
            ("Le vent nous portera", "Noir Désir"),
            ("La grenade", "Clara Luciani"),
            ("Sur la planche", "La Femme"),
            ("L'effet de masse", "Maëlle"),
        ],
    },
    {
        "username": "wassim.rap",
        "first_name": "Wassim",
        "last_name": "Nocturne",
        "social_tone": "Toujours au courant des sorties FR.",
        "primary_genre": "rap FR",
        "secondary_genre": "drill",
        "songs": [
            ("Bande organisée", "SCH"),
            ("Molly", "SDM"),
            ("Validée", "Booba"),
            ("Fendi", "Gazo"),
            ("Dolce Camara", "Booba"),
            ("Macro", "H JeuneCrack"),
        ],
    },
    {
        "username": "emma.indie",
        "first_name": "Emma",
        "last_name": "Lane",
        "social_tone": "Partage des sons doux, commente beaucoup.",
        "primary_genre": "indie pop",
        "secondary_genre": "dream pop",
        "songs": [
            ("Space Song", "Beach House"),
            ("Cherry-coloured Funk", "Cocteau Twins"),
            ("Sofia", "Clairo"),
            ("Bags", "Clairo"),
            ("Myth", "Beach House"),
            ("Nothing's Gonna Hurt You Baby", "Cigarettes After Sex"),
        ],
    },
    {
        "username": "paul.groove",
        "first_name": "Paul",
        "last_name": "Swing",
        "social_tone": "Mixe funk old school et néo-soul moderne.",
        "primary_genre": "jazz/funk",
        "secondary_genre": "soul/RnB",
        "songs": [
            ("Come Down", "Anderson .Paak"),
            ("The Less I Know The Better", "Tame Impala"),
            ("Everybody Loves The Sunshine", "Roy Ayers Ubiquity"),
            ("Disco Yes", "Tom Misch"),
            ("Mystery Lady", "Masego"),
            ("After The Storm", "Kali Uchis"),
        ],
    },
    {
        "username": "lucie.pop",
        "first_name": "Lucie",
        "last_name": "Nova",
        "social_tone": "Très active en réactions, découvre via la commu.",
        "primary_genre": "pop",
        "secondary_genre": "chanson française",
        "songs": [
            ("Physical", "Dua Lipa"),
            ("Levitating", "Dua Lipa"),
            ("Mauvais payeur", "Clara Luciani"),
            ("Je te vois enfin", "Yseult"),
            ("Runaway", "AURORA"),
            ("Tout va bien", "Orelsan"),
        ],
    },
    {
        "username": "amine.global",
        "first_name": "Amine",
        "last_name": "Mix",
        "social_tone": "Ouvre des discussions privées après les découvertes.",
        "primary_genre": "afro",
        "secondary_genre": "house",
        "songs": [
            ("Love Nwantiti", "CKay"),
            ("People", "Libianca"),
            ("Jerusalema", "Master KG"),
            ("Water", "Tyla"),
            ("Soso", "Omah Lay"),
            ("Rush", "Ayra Starr"),
        ],
    },
]

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
    warning_samples: list[str] | None = None


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


def _resolve_spotify_song(song_item, query_cache, song_cache):
    title, artist = song_item
    query = f"{title} {artist}"

    if query not in query_cache:
        results = backend_search_tracks("spotify", query)
        query_cache[query] = results[0] if results else None

    track = query_cache[query]
    if not track:
        return None, f"Spotify introuvable pour '{title}' - '{artist}'"

    provider_track_id = (track.get("provider_track_id") or "").strip()
    if provider_track_id in song_cache:
        return song_cache[provider_track_id], None

    try:
        song = get_or_create_song_from_track(track)
        upsert_song_provider_link(song, track)
    except Exception:
        return None, f"Spotify erreur pour '{title}' - '{artist}'"

    if provider_track_id:
        song_cache[provider_track_id] = song
    return song, None


def _create_deposits_for_day(
    rng, *, box, day_index, personas, users_by_username, intensity_conf, query_cache, song_cache
):
    created = []
    warnings = []
    min_dep, max_dep = intensity_conf["deposits"]
    n_deposits = rng.randint(min_dep, max_dep)

    weighted_personas = []
    very_active = {"malo.rapfr", "nora.boom", "wassim.rap", "emma.indie"}
    for persona in personas:
        weight = 4 if persona["username"] in very_active else 2
        weighted_personas.extend([persona] * weight)

    for _ in range(n_deposits):
        persona = rng.choice(weighted_personas)
        user = users_by_username[persona["username"]]

        existing_count = Deposit.objects.filter(box=box, user=user, deposit_type=Deposit.DEPOSIT_TYPE_BOX).count()
        songs = persona["songs"]
        song, warning = _resolve_spotify_song(songs[existing_count % len(songs)], query_cache, song_cache)
        if warning:
            warnings.append(warning)
            continue

        timestamp = _pick_timestamp(rng, day_index=day_index)
        deposit = Deposit.objects.create(
            song=song,
            box=box,
            user=user,
            deposit_type=Deposit.DEPOSIT_TYPE_BOX,
            deposited_at=timestamp,
        )
        Song.objects.filter(pk=song.pk).update(n_deposits=(song.n_deposits or 0) + 1)
        created.append(deposit)

    return created, warnings


def _create_reveals(rng, *, day_deposits, users, day_index, intensity_conf):
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


def _create_reactions(rng, *, day_deposits, users, emojis, day_index, intensity_conf):
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

        query_cache = {}
        song_cache = {}
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
                day_deposits, day_warnings = _create_deposits_for_day(
                    rng,
                    box=box,
                    day_index=day_index,
                    personas=PERSONAS,
                    users_by_username=users_by_username,
                    intensity_conf=INTENSITY_CONFIG[intensity],
                    query_cache=query_cache,
                    song_cache=song_cache,
                )
                summary.warnings += len(day_warnings)
                if day_warnings:
                    if summary.warning_samples is None:
                        summary.warning_samples = []
                    for warning in day_warnings:
                        if len(summary.warning_samples) >= 5:
                            break
                        if warning not in summary.warning_samples:
                            summary.warning_samples.append(warning)
                summary.deposits += len(day_deposits)
                touched_users.update(dep.user_id for dep in day_deposits if dep.user_id)

                summary.reveals += _create_reveals(
                    rng,
                    day_deposits=day_deposits,
                    users=users,
                    day_index=day_index,
                    intensity_conf=INTENSITY_CONFIG[intensity],
                )
                summary.reactions += _create_reactions(
                    rng,
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
