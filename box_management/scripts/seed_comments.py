import random
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from box_management.models import Comment, Deposit
from box_management.services.comments.moderation_rules import _get_profile_picture_url, _normalize_comment_text

SEED_REASON_CODE = "seed_fake_comment"
COMMENTS_PER_USER = 5

# Même base que seed_siohome.py
PERSONA_USERNAMES = [
    "lea.moon",
    "karim.groove",
    "zoe.vapor",
    "max.jazzy",
    "emma.orbit",
    "hugo.wave",
    "sara.aurora",
    "lucas.verso",
    "nina.silk",
    "theo.noir",
]

COMMENT_TEXTS = [
    "Très bon son.",
    "J’adore ce morceau.",
    "Belle découverte.",
    "Ça tourne fort.",
    "Très bon choix.",
    "Gros mood sur celui-là.",
    "Super vibe.",
    "Ça passe trop bien.",
    "Excellent partage.",
    "Très propre.",
    "Je valide fort.",
    "Ça fait plaisir.",
    "Très stylé.",
    "Incroyable découverte.",
    "Je le remets direct.",
    "Vraiment lourd.",
    "Très belle ambiance.",
    "Ça fonctionne trop bien.",
    "Bien vu celui-ci.",
    "Très bon goût.",
    "J’aime beaucoup.",
    "Top partage.",
    "Très cool.",
    "Ça me parle direct.",
    "Vraiment fort.",
    "Ça donne envie d’écouter plus.",
    "Excellent morceau.",
    "Très belle trouvaille.",
    "Super énergie.",
    "Ça marche trop bien.",
]


def _pick_comment_text():
    return random.choice(COMMENT_TEXTS)


def _pick_candidate_deposits_for_user(user):
    """
    Dépôts éligibles pour commenter :
    - dépôt avec owner
    - owner différent du user courant
    - dépôt pas déjà commenté par ce user
    """
    already_commented_deposit_ids = set(Comment.objects.filter(user=user).values_list("deposit_id", flat=True))

    deposits = list(
        Deposit.objects.select_related("box__client", "user", "song")
        .filter(user__isnull=False)
        .exclude(user_id=user.id)
        .exclude(id__in=already_commented_deposit_ids)
        .order_by("id")
    )

    random.shuffle(deposits)
    return deposits


def _build_comment_datetimes(count):
    """
    Répartit les commentaires sur les 5 derniers jours
    pour garder une chronologie crédible.
    """
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

    # plus ancien -> plus récent
    datetimes.sort()
    return datetimes


def run():
    User = get_user_model()

    users = list(
        User.objects.filter(
            username__in=PERSONA_USERNAMES,
            is_guest=False,
        ).order_by("id")
    )

    if not users:
        print("[ERR] Aucun user fictif trouvé.")
        print("Vérifie que seed_siohome a bien été exécuté.")
        return

    print("=== Seeding fake comments ===")
    print(f"[INFO] Users ciblés : {len(users)}")
    print(f"[INFO] Objectif : {COMMENTS_PER_USER} commentaires seedés par user")

    total_created = 0
    total_skipped = 0

    with transaction.atomic():
        for user in users:
            existing_seeded_count = Comment.objects.filter(
                user=user,
                reason_code=SEED_REASON_CODE,
            ).count()

            to_create = max(0, COMMENTS_PER_USER - existing_seeded_count)

            if to_create <= 0:
                print(f"[SKIP] {user.username} a déjà {existing_seeded_count}/{COMMENTS_PER_USER} commentaires seedés.")
                total_skipped += 1
                continue

            candidate_deposits = _pick_candidate_deposits_for_user(user)

            if not candidate_deposits:
                print(f"[WARN] Aucun dépôt éligible trouvé pour {user.username}.")
                total_skipped += 1
                continue

            selected_deposits = candidate_deposits[:to_create]
            planned_datetimes = _build_comment_datetimes(len(selected_deposits))

            created_for_user = 0

            for idx, (deposit, comment_dt) in enumerate(zip(selected_deposits, planned_datetimes), start=1):
                profile_picture_url = _get_profile_picture_url(user) or ""

                comment = Comment.objects.create(
                    client=getattr(deposit.box, "client", None),
                    deposit=deposit,
                    user=user,
                    text=_pick_comment_text(),
                    normalized_text="",  # set juste après
                    status=Comment.STATUS_PUBLISHED,
                    reason_code=SEED_REASON_CODE,
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
                    author_user_agent="seed_comments_script",
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
                f"[OK] {user.username} : +{created_for_user} commentaire(s) "
                f"(total seedé maintenant : {existing_seeded_count + created_for_user}/{COMMENTS_PER_USER})"
            )

    print("=== Terminé ===")
    print(f"[INFO] Commentaires créés : {total_created}")
    print(f"[INFO] Users ignorés/skippés : {total_skipped}")
