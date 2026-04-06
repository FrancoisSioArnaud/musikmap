import random
from datetime import timedelta
from importlib import import_module

from django.db import transaction
from django.utils import timezone

from box_management.models import Box, Deposit, Song, Emoji, EmojiRight, Reaction, Comment
from box_management.utils import _normalize_comment_text, _get_profile_picture_url

seed_siohome = import_module("box_management.scripts.seed_siohome")

PERSONAS = seed_siohome.PERSONAS
USERNAMES = seed_siohome.USERNAMES
SONGS_BY_USER = seed_siohome.SONGS_BY_USER
get_or_create_users = seed_siohome.get_or_create_users
upsert_song = seed_siohome.upsert_song
random_datetime_within_last_48h = seed_siohome.random_datetime_within_last_48h

BOX_SLUG = "chantier-naval"
DEPOSITS_PER_USER = 5
REACTIONS_PER_USER = 10
COMMENTS_PER_USER = 3
COMMENT_REASON_CODE = "seed_chantier_comment"
REACTION_USER_AGENT = "seed_chantier_script"
COMMENT_USER_AGENT = "seed_chantier_script"

COMMENT_TEXTS = [
    "Très bon morceau.",
    "Belle pioche.",
    "Je valide fort.",
    "Gros mood.",
    "Super trouvaille.",
    "Très stylé.",
    "Ça passe trop bien.",
    "Bien vu celui-ci.",
    "Très belle ambiance.",
    "Excellent partage.",
    "Ça fonctionne très bien.",
    "Très propre.",
    "J’aime beaucoup.",
    "Très cool.",
    "Ça me parle direct.",
    "Lourd celui-là.",
    "Je le remets direct.",
    "Bonne découverte.",
]


def _get_box():
    box = Box.objects.filter(url=BOX_SLUG).select_related("client").first()
    if not box:
        print(
            f"[ERR] La box avec url='{BOX_SLUG}' est introuvable. "
            "Crée-la d'abord puis relance le script."
        )
        return None
    return box


def _ensure_users():
    with transaction.atomic():
        users_by_name, created_usernames = get_or_create_users(PERSONAS)

    if created_usernames:
        print(f"[INFO] Users créés : {', '.join(created_usernames)}")
    else:
        print("[INFO] Tous les users existaient déjà.")

    return users_by_name


def _ensure_song_for_item(item):
    title = item["title"].strip()
    artist = item["artist"].strip()
    return upsert_song(title, artist)


def _create_missing_deposits(box, users_by_name):
    created_deposits = 0
    created_song_records = 0

    with transaction.atomic():
        for username in USERNAMES:
            user = users_by_name.get(username)
            if not user:
                continue

            print(f"\n🎧 {username} — dépôts sur '{BOX_SLUG}'...")

            planned_items = SONGS_BY_USER.get(username, [])[:DEPOSITS_PER_USER]
            for item in planned_items:
                song = _ensure_song_for_item(item)
                if not song:
                    print(f"[SKIP] Spotify KO: {item['title']} - {item['artist']}")
                    continue

                deposit_exists = Deposit.objects.filter(
                    box=box,
                    user=user,
                    song=song,
                ).exists()
                if deposit_exists:
                    print(f"[SKIP] Déjà présent : {song.title} - {song.artist}")
                    continue

                Deposit.objects.create(
                    song=song,
                    box=box,
                    user=user,
                    deposited_at=random_datetime_within_last_48h(),
                )
                created_deposits += 1

                before = song.n_deposits or 0
                Song.objects.filter(pk=song.pk).update(n_deposits=before + 1)
                if before == 0:
                    created_song_records += 1

                print(f"[OK] Dépôt créé : {song.title} - {song.artist}")

    return created_deposits, created_song_records


def _build_weighted_emojis():
    emojis = list(Emoji.objects.filter(active=True).order_by("id"))
    if not emojis:
        return []

    weighted = []
    for emoji in emojis:
        weight = 6 if (emoji.cost or 0) == 0 else 1
        weighted.extend([emoji] * weight)
    return weighted


def _ensure_emoji_rights(users_by_name, emojis):
    paid_emojis = [emoji for emoji in emojis if (emoji.cost or 0) > 0]
    if not paid_emojis:
        return 0

    created_rights = 0
    with transaction.atomic():
        for user in users_by_name.values():
            for emoji in paid_emojis:
                _, created = EmojiRight.objects.get_or_create(user=user, emoji=emoji)
                if created:
                    created_rights += 1

    return created_rights


def _pick_reaction_targets(box, user):
    reacted_deposit_ids = set(
        Reaction.objects.filter(user=user, deposit__box=box).values_list("deposit_id", flat=True)
    )

    candidates = list(
        Deposit.objects.select_related("user", "song")
        .filter(box=box, user__isnull=False)
        .exclude(user_id=user.id)
        .exclude(id__in=reacted_deposit_ids)
        .order_by("id")
    )
    random.shuffle(candidates)
    return candidates


def _seed_reactions(box, users_by_name):
    active_emojis = list(Emoji.objects.filter(active=True).order_by("id"))
    if not active_emojis:
        print("[WARN] Aucun emoji actif trouvé. Lance d'abord seed_emoji.")
        return 0, 0

    created_rights = _ensure_emoji_rights(users_by_name, active_emojis)
    weighted_emojis = _build_weighted_emojis()
    if not weighted_emojis:
        print("[WARN] Aucun emoji utilisable trouvé.")
        return created_rights, 0

    total_created = 0

    with transaction.atomic():
        for username in USERNAMES:
            user = users_by_name.get(username)
            if not user:
                continue

            existing_count = Reaction.objects.filter(user=user, deposit__box=box).count()
            to_create = max(0, REACTIONS_PER_USER - existing_count)

            if to_create <= 0:
                print(f"[SKIP] {username} a déjà {existing_count}/{REACTIONS_PER_USER} réactions sur {BOX_SLUG}.")
                continue

            candidates = _pick_reaction_targets(box, user)
            if not candidates:
                print(f"[WARN] Aucun dépôt éligible pour les réactions de {username}.")
                continue

            selected_deposits = candidates[:to_create]
            created_for_user = 0

            for deposit in selected_deposits:
                emoji = random.choice(weighted_emojis)
                reaction, created = Reaction.objects.get_or_create(
                    user=user,
                    deposit=deposit,
                    emoji=emoji,
                )
                if not created:
                    continue

                reaction_dt = timezone.now() - timedelta(
                    days=random.randint(0, 6),
                    hours=random.randint(0, 23),
                    minutes=random.randint(0, 59),
                    seconds=random.randint(0, 59),
                )
                Reaction.objects.filter(pk=reaction.pk).update(
                    created_at=reaction_dt,
                    updated_at=reaction_dt,
                )
                created_for_user += 1
                total_created += 1

            print(
                f"[OK] {username} : +{created_for_user} réaction(s) "
                f"(total maintenant : {existing_count + created_for_user}/{REACTIONS_PER_USER})"
            )

    return created_rights, total_created


def _pick_comment_targets(box, user):
    already_commented_ids = set(
        Comment.objects.filter(user=user, deposit__box=box).values_list("deposit_id", flat=True)
    )

    candidates = list(
        Deposit.objects.select_related("box__client", "user", "song")
        .filter(box=box, user__isnull=False)
        .exclude(user_id=user.id)
        .exclude(id__in=already_commented_ids)
        .order_by("id")
    )
    random.shuffle(candidates)
    return candidates


def _pick_comment_text():
    return random.choice(COMMENT_TEXTS)


def _build_comment_datetimes(count):
    now = timezone.now()
    datetimes = []
    for i in range(count):
        dt = now - timedelta(
            days=i,
            hours=random.randint(0, 18),
            minutes=random.randint(0, 59),
            seconds=random.randint(0, 59),
        )
        datetimes.append(dt)
    datetimes.sort()
    return datetimes


def _seed_comments(box, users_by_name):
    total_created = 0

    with transaction.atomic():
        for username in USERNAMES:
            user = users_by_name.get(username)
            if not user:
                continue

            existing_seeded_count = Comment.objects.filter(
                user=user,
                deposit__box=box,
                reason_code=COMMENT_REASON_CODE,
            ).count()
            to_create = max(0, COMMENTS_PER_USER - existing_seeded_count)

            if to_create <= 0:
                print(
                    f"[SKIP] {username} a déjà {existing_seeded_count}/{COMMENTS_PER_USER} commentaires seedés sur {BOX_SLUG}."
                )
                continue

            candidates = _pick_comment_targets(box, user)
            if not candidates:
                print(f"[WARN] Aucun dépôt éligible pour les commentaires de {username}.")
                continue

            selected_deposits = candidates[:to_create]
            planned_datetimes = _build_comment_datetimes(len(selected_deposits))
            created_for_user = 0

            for deposit, comment_dt in zip(selected_deposits, planned_datetimes):
                profile_picture_url = _get_profile_picture_url(user) or ""
                comment = Comment.objects.create(
                    client=getattr(deposit.box, "client", None),
                    deposit=deposit,
                    user=user,
                    text=_pick_comment_text(),
                    normalized_text="",
                    status=Comment.STATUS_PUBLISHED,
                    reason_code=COMMENT_REASON_CODE,
                    risk_score=0,
                    risk_flags=[],
                    reports_count=0,
                    deposit_public_key=deposit.public_key or "",
                    deposit_box_name=getattr(deposit.box, "name", "") or "",
                    deposit_box_url=getattr(deposit.box, "url", "") or "",
                    deposit_deleted=False,
                    deposit_owner_user_id=deposit.user_id,
                    deposit_owner_username=getattr(deposit.user, "username", "") or "",
                    author_username=user.username or "",
                    author_display_name=getattr(user, "display_name", "") or user.username or "",
                    author_email=user.email or "",
                    author_avatar_url=profile_picture_url,
                    author_ip=None,
                    author_user_agent=COMMENT_USER_AGENT,
                )
                normalized_text = _normalize_comment_text(comment.text)
                Comment.objects.filter(pk=comment.pk).update(
                    normalized_text=normalized_text,
                    created_at=comment_dt,
                    updated_at=comment_dt,
                )
                created_for_user += 1
                total_created += 1

            print(
                f"[OK] {username} : +{created_for_user} commentaire(s) "
                f"(total seedé maintenant : {existing_seeded_count + created_for_user}/{COMMENTS_PER_USER})"
            )

    return total_created


def seed_chantier():
    box = _get_box()
    if not box:
        return

    users_by_name = _ensure_users()

    created_deposits, created_song_records = _create_missing_deposits(box, users_by_name)
    created_rights, created_reactions = _seed_reactions(box, users_by_name)
    created_comments = _seed_comments(box, users_by_name)

    total_deposits = Deposit.objects.filter(box=box, user__username__in=USERNAMES).count()
    total_reactions = Reaction.objects.filter(deposit__box=box, user__username__in=USERNAMES).count()
    total_comments = Comment.objects.filter(deposit__box=box, user__username__in=USERNAMES).count()

    print("\n====================================")
    print(f"Box : {BOX_SLUG}")
    print(f"Songs nouvellement créés : {created_song_records}")
    print(f"EmojiRight créés : {created_rights}")
    print(f"Deposits créés : {created_deposits}")
    print(f"Reactions créées : {created_reactions}")
    print(f"Commentaires créés : {created_comments}")
    print("--- Totaux actuels sur la box ---")
    print(f"Deposits : {total_deposits}")
    print(f"Reactions : {total_reactions}")
    print(f"Commentaires : {total_comments}")
    print("Done ✅")



def run():
    seed_chantier()
