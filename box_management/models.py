from django.db import models
from django.utils import timezone
from django.db.models import Count
from django.dispatch import receiver
from django.core.exceptions import ValidationError
from typing import Union, Optional, Iterable
from users.models import CustomUser
from utils import generate_unique_filename
import secrets


class Client(models.Model):
    def background_picture_path(instance, filename):
        filename = generate_unique_filename(instance, filename)
        return f"clients/backgrounds/{filename}"

    name = models.CharField(max_length=100, unique=True, db_index=True)
    slug = models.SlugField(
        max_length=100,
        unique=True,
        db_index=True,
        null=True,
        blank=True,
    )
    background_picture = models.ImageField(
        upload_to=background_picture_path,
        blank=True,
        null=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        indexes = [
            models.Index(fields=["name"]),
            models.Index(fields=["slug"]),
        ]

    def __str__(self):
        return self.name


@receiver(models.signals.pre_delete, sender=Client)
def delete_client_background_picture(sender, instance, **kwargs):
    if instance.background_picture:
        instance.background_picture.delete(False)


@receiver(models.signals.pre_save, sender=Client)
def delete_old_client_background_picture(sender, instance, **kwargs):
    if not instance.pk:
        return

    existing_client = Client.objects.filter(pk=instance.pk).first()
    if not existing_client:
        return

    if existing_client.background_picture != instance.background_picture:
        if existing_client.background_picture:
            existing_client.background_picture.delete(False)


class Box(models.Model):
    name = models.CharField(max_length=50, unique=True, db_index=True)
    description = models.CharField(max_length=150, blank=True)
    url = models.SlugField(blank=True, unique=True)
    image_url = models.URLField(max_length=200, blank=True)
    client = models.ForeignKey(
        "Client",
        on_delete=models.PROTECT,
        related_name="boxes",
        null=True,
        blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        indexes = [
            models.Index(fields=["name"]),
        ]

    def __str__(self):
        return self.name


class ArticleQuerySet(models.QuerySet):
    def with_related(self):
        return self.select_related("client", "author")

    def _coerce_id(self, obj_or_id: Union[int, models.Model]) -> int:
        return getattr(obj_or_id, "pk", obj_or_id)

    def for_client(self, client_or_id: Union[int, "Client"]):
        client_id = self._coerce_id(client_or_id)
        return self.filter(client_id=client_id)

    def visible_for_client_user(self, user: CustomUser):
        if not user or not getattr(user, "client_id", None):
            return self.none()
        return self.for_client(user.client_id)

    def search(self, term: Optional[str]):
        if not term:
            return self
        return self.filter(
            models.Q(title__icontains=term)
            | models.Q(short_text__icontains=term)
            | models.Q(link__icontains=term)
        )

    def with_status(self, status_value: Optional[str]):
        if not status_value or status_value == "all":
            return self
        return self.filter(status=status_value)

    def published(self):
        return self.filter(status="published")

    def currently_visible(self, at=None):
        local_now = Article.normalize_local_datetime(at)
        current_date = local_now.date()
        current_time = local_now.time().replace(second=0, microsecond=0, tzinfo=None)

        date_filter = (
            (models.Q(display_start_date__isnull=True) | models.Q(display_start_date__lte=current_date))
            & (models.Q(display_end_date__isnull=True) | models.Q(display_end_date__gte=current_date))
        )

        time_filter = (
            models.Q(display_start_time__isnull=True, display_end_time__isnull=True)
            | models.Q(
                display_start_time__isnull=False,
                display_end_time__isnull=True,
                display_start_time__lte=current_time,
            )
            | models.Q(
                display_start_time__isnull=True,
                display_end_time__isnull=False,
                display_end_time__gte=current_time,
            )
            | (
                models.Q(
                    display_start_time__isnull=False,
                    display_end_time__isnull=False,
                    display_start_time__lte=models.F("display_end_time"),
                )
                & models.Q(display_start_time__lte=current_time)
                & models.Q(display_end_time__gte=current_time)
            )
            | (
                models.Q(
                    display_start_time__isnull=False,
                    display_end_time__isnull=False,
                    display_start_time__gt=models.F("display_end_time"),
                )
                & (
                    models.Q(display_start_time__lte=current_time)
                    | models.Q(display_end_time__gte=current_time)
                )
            )
        )

        return self.published().filter(date_filter).filter(time_filter)

    def ordered_for_admin(self):
        return self.order_by("-updated_at", "-created_at")


class Article(models.Model):
    STATUS_CHOICES = [
        ("draft", "Draft"),
        ("published", "Published"),
        ("archived", "Archived"),
    ]

    VISIBILITY_STATE_LABELS = {
        "draft": "Brouillon",
        "archived": "Archivé",
        "visible_now": "Visible maintenant",
        "scheduled": "Planifié",
        "expired": "Expiré",
        "out_of_hours": "Hors horaire",
    }

    client = models.ForeignKey(
        "Client",
        on_delete=models.CASCADE,
        related_name="articles",
        db_index=True,
    )

    author = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="articles_authored",
    )

    title = models.CharField(max_length=200, db_index=True, blank=True)
    link = models.URLField(max_length=2048, blank=True)

    short_text = models.CharField(
        max_length=10000,
        blank=True,
        help_text="Article text, maximum 1000 characters.",
    )

    favicon = models.URLField(
        max_length=2048,
        blank=True,
        help_text="Remote URL of the favicon.",
    )

    cover_image = models.URLField(
        max_length=2048,
        blank=True,
        help_text="Remote URL of the cover image.",
    )

    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default="draft",
        db_index=True,
    )

    display_start_date = models.DateField(null=True, blank=True, db_index=True)
    display_end_date = models.DateField(null=True, blank=True, db_index=True)
    display_start_time = models.TimeField(null=True, blank=True)
    display_end_time = models.TimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)
    published_at = models.DateTimeField(null=True, blank=True, db_index=True)

    objects = ArticleQuerySet.as_manager()

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["client", "status"]),
            models.Index(fields=["client", "created_at"]),
            models.Index(fields=["client", "published_at"]),
            models.Index(fields=["client", "display_start_date"]),
            models.Index(fields=["client", "display_end_date"]),
            models.Index(fields=["author"]),
            models.Index(fields=["status"]),
            models.Index(fields=["title"]),
        ]

    @staticmethod
    def normalize_local_datetime(value=None):
        current_dt = value or timezone.now()
        if timezone.is_naive(current_dt):
            current_dt = timezone.make_aware(current_dt, timezone.get_current_timezone())
        return timezone.localtime(current_dt)

    def clean(self):
        if self.author_id and self.client_id and self.author.client_id != self.client_id:
            raise ValidationError(
                {"author": "L'auteur doit appartenir au même client que l'article."}
            )

        self.title = (self.title or "").strip()
        self.link = (self.link or "").strip()
        self.short_text = (self.short_text or "").strip()
        self.favicon = (self.favicon or "").strip()
        self.cover_image = (self.cover_image or "").strip()

        if self.short_text and len(self.short_text) > 1000:
            raise ValidationError(
                {"short_text": "Le texte de l’article ne peut pas dépasser 1000 caractères."}
            )

        errors = {}

        if (
            self.display_start_date
            and self.display_end_date
            and self.display_end_date < self.display_start_date
        ):
            errors["display_end_date"] = (
                "La date de fin d’affichage doit être postérieure ou égale à la date de début."
            )

        if self.status == "published":
            if not self.title:
                errors["title"] = "Le titre est obligatoire pour publier un article."
            if not self.link and not self.short_text:
                errors["non_field_errors"] = (
                    "Pour publier un article, renseigne au moins un lien externe ou un texte court."
                )

        if errors:
            raise ValidationError(errors)

    @property
    def is_published(self):
        return self.status == "published"

    @property
    def is_draft(self):
        return self.status == "draft"

    @property
    def is_archived(self):
        return self.status == "archived"

    def is_within_date_window(self, at=None):
        local_now = self.normalize_local_datetime(at)
        current_date = local_now.date()

        if self.display_start_date and current_date < self.display_start_date:
            return False
        if self.display_end_date and current_date > self.display_end_date:
            return False
        return True

    def is_within_time_window(self, at=None):
        local_now = self.normalize_local_datetime(at)
        current_time = local_now.time().replace(second=0, microsecond=0, tzinfo=None)

        start_time = self.display_start_time
        end_time = self.display_end_time

        if not start_time and not end_time:
            return True

        if start_time and end_time:
            if start_time <= end_time:
                return start_time <= current_time <= end_time
            return current_time >= start_time or current_time <= end_time

        if start_time:
            return current_time >= start_time

        return current_time <= end_time

    def is_visible_now(self, at=None):
        if self.status != "published":
            return False
        return self.is_within_date_window(at=at) and self.is_within_time_window(at=at)

    def get_visibility_state(self, at=None):
        if self.status == "draft":
            return "draft"
        if self.status == "archived":
            return "archived"

        local_now = self.normalize_local_datetime(at)
        current_date = local_now.date()

        if self.display_start_date and current_date < self.display_start_date:
            return "scheduled"
        if self.display_end_date and current_date > self.display_end_date:
            return "expired"
        if not self.is_within_time_window(at=local_now):
            return "out_of_hours"
        return "visible_now"

    def get_visibility_state_label(self, at=None):
        return self.VISIBILITY_STATE_LABELS.get(
            self.get_visibility_state(at=at),
            "—",
        )

    def get_display_date_range_label(self):
        if self.display_start_date and self.display_end_date:
            return f"Du {self.display_start_date.strftime('%d/%m/%Y')} au {self.display_end_date.strftime('%d/%m/%Y')}"
        if self.display_start_date:
            return f"À partir du {self.display_start_date.strftime('%d/%m/%Y')}"
        if self.display_end_date:
            return f"Jusqu’au {self.display_end_date.strftime('%d/%m/%Y')}"
        return "Toujours"

    def get_display_time_range_label(self):
        def format_time(value):
            if not value:
                return None
            return value.strftime('%H:%M')

        start_label = format_time(self.display_start_time)
        end_label = format_time(self.display_end_time)

        if start_label and end_label:
            return f"Chaque jour de {start_label} à {end_label}"
        if start_label:
            return f"Chaque jour à partir de {start_label}"
        if end_label:
            return f"Chaque jour jusqu’à {end_label}"
        return "Toute la journée"

    def get_display_window_summary(self):
        return f"{self.get_display_date_range_label()} · {self.get_display_time_range_label()}"

    def save(self, *args, **kwargs):
        self.full_clean()

        if self.status == "published" and self.published_at is None:
            self.published_at = timezone.now()

        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.title or 'Sans titre'} ({self.client.name})"


class Song(models.Model):
    song_id = models.CharField(max_length=15, unique=True, db_index=True)

    title = models.CharField(max_length=50, db_index=True)
    artist = models.CharField(max_length=50, db_index=True)

    spotify_url = models.URLField(max_length=255, blank=True)
    deezer_url = models.URLField(max_length=255, blank=True)

    image_url = models.URLField(max_length=200, blank=True)
    duration = models.PositiveIntegerField(default=0)
    n_deposits = models.PositiveIntegerField(default=0, editable=False)

    class Meta:
        ordering = ["title", "artist"]
        indexes = [
            models.Index(fields=["title", "artist"]),
            models.Index(fields=["song_id"]),
        ]

    def __str__(self):
        return f"{self.title} - {self.artist}"


class DepositQuerySet(models.QuerySet):
    def with_related(self):
        """Précharge les FK pour éviter le N+1 dans les vues/serializers."""
        return self.select_related("song", "box", "user")

    def _coerce_id(self, obj_or_id: Union[int, models.Model]) -> int:
        """Retourne l'id si on passe un objet, sinon la valeur telle quelle."""
        return getattr(obj_or_id, "pk", obj_or_id)

    def latest_for_box(self, box_or_id: Union[int, "Box"], limit: Optional[int] = None):
        """
        Derniers dépôts d'une box, triés du plus récent au plus ancien.
        Utilisation :
            Deposit.objects.latest_for_box(box, limit=20)
            Deposit.objects.latest_for_box(box_id, limit=10)
        """
        bid = self._coerce_id(box_or_id)
        qs = (
            self.filter(box_id=bid)
            .with_related()
            .order_by("-deposited_at")
        )
        return qs[:int(limit)] if limit else qs

    def latest_for_user(self, user_or_id: Union[int, "CustomUser"], limit: Optional[int] = None):
        """
        Derniers dépôts d'un utilisateur, triés du plus récent au plus ancien.
        Utilisation :
            Deposit.objects.latest_for_user(user, limit=20)
            Deposit.objects.latest_for_user(user_id, limit=10)
        """
        uid = self._coerce_id(user_or_id)
        qs = (
            self.filter(user_id=uid)
            .with_related()
            .order_by("-deposited_at")
        )
        return qs[:int(limit)] if limit else qs


class Deposit(models.Model):
    deposited_at = models.DateTimeField(default=timezone.now, db_index=True)

    song = models.ForeignKey("Song", on_delete=models.CASCADE, related_name="deposits")
    box = models.ForeignKey("Box", on_delete=models.CASCADE, related_name="deposits")
    user = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="deposits",
    )

    public_key = models.CharField(
        max_length=16,
        unique=True,
        db_index=True,
        editable=False
    )

    objects = DepositQuerySet.as_manager()

    class Meta:
        ordering = ["-deposited_at"]
        indexes = [
            models.Index(fields=["box", "deposited_at"]),
            models.Index(fields=["song", "deposited_at"]),
            models.Index(fields=["user", "deposited_at"]),
            models.Index(fields=["public_key"]),
        ]

    def __str__(self):
        return f"Deposit {self.public_key} (song={self.song_id}, box={self.box_id})"

    def save(self, *args, **kwargs):
        if not self.public_key:
            self.public_key = self._generate_unique_key()
        super().save(*args, **kwargs)

    @staticmethod
    def _generate_key():
        return secrets.token_urlsafe(12)[:16]

    @classmethod
    def _generate_unique_key(cls):
        key = cls._generate_key()
        while cls.objects.filter(public_key=key).exists():
            key = cls._generate_key()
        return key


class LocationPoint(models.Model):
    box = models.ForeignKey(Box, on_delete=models.CASCADE, related_name="locations")

    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)

    dist_location = models.PositiveIntegerField(default=100)

    class Meta:
        indexes = [
            models.Index(fields=["box"]),
        ]

    def __str__(self):
        return f"{self.box.name} - {self.latitude} - {self.longitude}"


class DiscoveredSong(models.Model):
    deposit = models.ForeignKey(Deposit, on_delete=models.CASCADE, related_name="discoveries")
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name="discoveries")

    DISCOVERED_TYPES = (
        ("main", "Main"),
        ("revealed", "Revealed"),
    )
    discovered_type = models.CharField(
        max_length=8,
        choices=DISCOVERED_TYPES,
        default="revealed",
    )
    discovered_at = models.DateTimeField(auto_now_add=True, db_index=True)

    CONTEXT_CHOICES = (
        ("box", "Box"),
        ("profile", "Profile"),
    )
    context = models.CharField(
        max_length=10,
        choices=CONTEXT_CHOICES,
        default="box",
        blank=False,
        null=False,
        db_index=True,
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "deposit"],
                name="unique_discovery_per_user_and_deposit",
            ),
        ]
        ordering = ["-discovered_at"]
        indexes = [
            models.Index(fields=["user", "deposit"]),
            models.Index(fields=["context"]),
        ]

    def __str__(self):
        return f"{self.user_id} - {self.deposit_id} ({self.context})"


class Emoji(models.Model):
    """Catalogue des emojis (Unicode)"""
    char = models.CharField(max_length=8, unique=True, db_index=True)
    active = models.BooleanField(default=True)
    cost = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["char"]

    def __str__(self):
        flags = []
        if not self.active:
            flags.append("inactive")
        fl = f" ({', '.join(flags)})" if flags else ""
        return f"{self.char}{fl}"


class EmojiRight(models.Model):
    """Droit global d'utiliser un emoji (achat par user)"""
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name="emoji_rights")
    emoji = models.ForeignKey(Emoji, on_delete=models.CASCADE, related_name="rights")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "emoji"], name="unique_user_emoji_right"),
        ]
        indexes = [
            models.Index(fields=["user"]),
        ]


class Reaction(models.Model):
    """
    Une réaction = un user + un dépôt + un emoji.
    Upsert côté API : si déjà présent => update updated_at (pas de doublon).
    """
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name="reactions")
    deposit = models.ForeignKey(Deposit, on_delete=models.CASCADE, related_name="reactions")
    emoji = models.ForeignKey(Emoji, on_delete=models.CASCADE, related_name="reactions")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "deposit", "emoji"], name="uniq_user_deposit_emoji"),
        ]
        indexes = [
            models.Index(fields=["deposit", "emoji"]),
            models.Index(fields=["user", "deposit"]),
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user_id} -> {self.deposit_id} {self.emoji.char}"
