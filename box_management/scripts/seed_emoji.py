# box_management/scripts/seed_emoji.py

from django.db import transaction

from box_management.models import Emoji


def run():
    """
    Script pour peupler la table Emoji avec :
      - 3 emojis à coût = 0
      - 12 emojis supplémentaires coût : 300, 350, 400, ..., 850
    Total : 15 emojis
    """

    base_emojis = ["🔥", "🤯", "👽"]
    extra_emojis = ["✨", "😎", "🎉", "💥", "😱", "😍", "🤘", "🎶", "😄", "🙌", "🤩", "😈"]
    # 12 emojis → coûts 300, 350, ... 850
    extra_costs = [300 + i * 50 for i in range(len(extra_emojis))]

    print("=== Seeding Emojis ===")

    with transaction.atomic():
        # --- 3 emojis coût = 0 ---
        for char in base_emojis:
            obj, created = Emoji.objects.get_or_create(
                char=char,
                defaults={"cost": 0, "active": True},
            )
            if created:
                print(f"[OK] Ajouté : {char} (cost=0)")
            else:
                print(f"[SKIP] Existe déjà : {char}")

        # --- 12 emojis coût croissant ---
        for char, cost in zip(extra_emojis, extra_costs):
            obj, created = Emoji.objects.get_or_create(
                char=char,
                defaults={"cost": cost, "active": True},
            )
            if created:
                print(f"[OK] Ajouté : {char} (cost={cost})")
            else:
                print(f"[SKIP] Existe déjà : {char}")

    print("=== Terminé ===")
