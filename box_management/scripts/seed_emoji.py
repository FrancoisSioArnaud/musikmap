

from django.core.management.base import BaseCommand
from django.db import transaction

from box_management.models import Emoji


class Command(BaseCommand):
    help = "Ajoute/Met à jour un set d'émojis par défaut dans la table Emoji."

    def handle(self, *args, **options):
        """
        On crée 15 émojis :
          - 3 premiers : 🔥 🤯 👽 avec un coût = 0
          - 12 suivants : coût à partir de 300, +50 à chaque fois
            => 300, 350, 400, ..., 850
        """

        # 3 émojis gratuits
        base_emojis = [
            {"char": "🔥", "cost": 0},
            {"char": "🤯", "cost": 0},
            {"char": "👽", "cost": 0},
        ]

        # 12 émojis payants, coûts 300, 350, 400, ..., 850
        paid_chars = [
            "😎",
            "🎧",
            "🎵",
            "💃",
            "🕺",
            "🌈",
            "🌊",
            "⭐",
            "🧠",
            "💥",
            "😈",
            "🐙",
        ]

        paid_emojis = []
        cost = 300
        for ch in paid_chars:
            paid_emojis.append({"char": ch, "cost": cost})
            cost += 50  # +50 à chaque fois

        all_emojis = base_emojis + paid_emojis

        created_count = 0
        updated_count = 0

        # On fait tout dans une transaction pour rester propre
        with transaction.atomic():
            for data in all_emojis:
                obj, created = Emoji.objects.update_or_create(
                    char=data["char"],
                    defaults={
                        "cost": data["cost"],
                        "active": True,
                    },
                )
                if created:
                    created_count += 1
                else:
                    updated_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Seed Emoji terminé : {created_count} créés, {updated_count} mis à jour."
            )
        )
