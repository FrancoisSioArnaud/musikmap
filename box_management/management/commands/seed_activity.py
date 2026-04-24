from django.core.management.base import BaseCommand, CommandError

from box_management.services.seeding.activity_simulation import DEFAULT_BOX_SLUGS, seed_activity


class Command(BaseCommand):
    help = "Simule une activité réaliste multi-boîtes pour la démo produit."

    def add_arguments(self, parser):
        parser.add_argument(
            "--boxes",
            nargs="+",
            default=DEFAULT_BOX_SLUGS,
            help="Liste des slugs de boîtes ciblées (ex: chantier-naval hopital-bellier).",
        )
        parser.add_argument("--days", type=int, default=10, help="Nombre de jours simulés.")
        parser.add_argument(
            "--intensity",
            choices=["low", "medium", "high"],
            default="medium",
            help="Niveau d'intensité des interactions.",
        )
        parser.add_argument("--seed", type=int, default=None, help="Seed aléatoire pour un run reproductible.")
        parser.add_argument("--dry-run", action="store_true", help="Affiche la cible sans écrire en base.")
        parser.add_argument(
            "--errors",
            action="store_true",
            help="Affiche les erreurs détaillées (avec traceback) au lieu d'un message simplifié.",
        )

    def handle(self, *args, **options):
        days = int(options["days"])
        if days <= 0:
            raise CommandError("--days doit être strictement positif.")

        try:
            summaries, status = seed_activity(
                box_slugs=options["boxes"],
                days=days,
                intensity=options["intensity"],
                seed=options.get("seed"),
                dry_run=bool(options.get("dry_run")),
            )
        except ValueError as exc:
            if options.get("errors"):
                raise
            raise CommandError(str(exc)) from exc

        if status == "dry_run":
            self.stdout.write(self.style.WARNING("[DRY-RUN] Aucun objet créé."))
            for summary in summaries:
                self.stdout.write(f"- box={summary.box_slug}")
            return

        self.stdout.write(self.style.SUCCESS("[OK] seed_activity terminé."))
        for summary in summaries:
            self.stdout.write(
                " | ".join(
                    [
                        f"box={summary.box_slug}",
                        f"users_touched={summary.users_touched}",
                        f"created_users={summary.created_users}",
                        f"deposits={summary.deposits}",
                        f"reveals={summary.reveals}",
                        f"reactions={summary.reactions}",
                        f"comments={summary.comments}",
                        f"private_messages={summary.private_messages}",
                        f"warnings={summary.warnings}",
                    ]
                )
            )
            if options.get("errors") and summary.warning_messages:
                self.stdout.write(self.style.WARNING(f"  warnings ({len(summary.warning_messages)}):"))
                for warning in summary.warning_messages:
                    self.stdout.write(self.style.WARNING(f"    - {warning}"))
