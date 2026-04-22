from datetime import timedelta
from django.db import models
import re
from django.utils import timezone
from django.dispatch import receiver
from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from typing import Union, Optional
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

    @property
    def slug(self):
        return self.url

    @slug.setter
    def slug(self, value):
        self.url = value

    def __str__(self):
        return self.name


class BoxSession(models.Model):
    user = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name="box_sessions",
    )
    box = models.ForeignKey(
        "Box",
        on_delete=models.CASCADE,
        related_name="sessions",
    )
    started_at = models.DateTimeField(db_index=True)
    expires_at = models.DateTimeField(db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-expires_at", "-id"]
        indexes = [
            models.Index(fields=["user", "box"]),
            models.Index(fields=["expires_at"]),
        ]

    @property
    def is_active(self):
        return bool(self.expires_at and self.expires_at > timezone.now())

    @property
    def remaining_seconds(self):
        if not self.expires_at:
            return 0
        return max(0, int((self.expires_at - timezone.now()).total_seconds()))


class IncitationPhraseQuerySet(models.QuerySet):
    def _coerce_id(self, obj_or_id: Union[int, models.Model]) -> int:
        return getattr(obj_or_id, "pk", obj_or_id)

    def for_client(self, client_or_id: Union[int, "Client"]):
        client_id = self._coerce_id(client_or_id)
        return self.filter(client_id=client_id)

    def visible_for_client_user(self, user: CustomUser):
        if not user or not getattr(user, "client_id", None):
            return self.none()
        return self.for_client(user.client_id)

    def active_on_date(self, at_date=None):
        current_date = at_date or timezone.localdate()
        return self.filter(start_date__lte=current_date, end_date__gte=current_date)


class IncitationPhrase(models.Model):
    client = models.ForeignKey(
        "Client",
        on_delete=models.CASCADE,
        related_name="incitation_phrases",
        db_index=True,
    )

    text = models.CharField(
        max_length=100,
        blank=False,
        help_text=(
            "Phrase affichée sous la barre de recherche pendant la période choisie."
        ),
    )

    start_date = models.DateField(db_index=True)
    end_date = models.DateField(db_index=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = IncitationPhraseQuerySet.as_manager()

    class Meta:
        ordering = ["start_date", "created_at"]
        indexes = [
            models.Index(fields=["client", "start_date"]),
            models.Index(fields=["client", "end_date"]),
            models.Index(fields=["client", "created_at"]),
        ]

    def clean(self):
        self.text = (self.text or "").strip()

        errors = {}

        if not self.text:
            errors["text"] = "La phrase d’incitation est obligatoire."
        elif len(self.text) > 100:
            errors["text"] = "La phrase d’incitation ne peut pas dépasser 100 caractères."

        if self.start_date and self.end_date and self.end_date < self.start_date:
            errors["end_date"] = (
                "La date de fin doit être postérieure ou égale à la date de début."
            )

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def get_overlapping_queryset(self):
        if not self.client_id or not self.start_date or not self.end_date:
            return self.__class__.objects.none()

        qs = self.__class__.objects.for_client(self.client_id).filter(
            start_date__lte=self.end_date,
            end_date__gte=self.start_date,
        )
        if self.pk:
            qs = qs.exclude(pk=self.pk)
        return qs

    def get_overlap_count(self):
        return self.get_overlapping_queryset().count()

    def has_overlap(self):
        return self.get_overlapping_queryset().exists()

    def is_active_on_date(self, at_date=None):
        current_date = at_date or timezone.localdate()
        return self.start_date <= current_date <= self.end_date

    def is_future_on_date(self, at_date=None):
        current_date = at_date or timezone.localdate()
        return self.start_date > current_date

    def is_past_on_date(self, at_date=None):
        current_date = at_date or timezone.localdate()
        return self.end_date < current_date

    def get_period_label(self):
        if not self.start_date or not self.end_date:
            return "—"
        return f"Du {self.start_date.strftime('%d/%m/%Y')} au {self.end_date.strftime('%d/%m/%Y')}"

    def __str__(self):
        return self.text



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
        help_text="Article text, maximum 10000 characters.",
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

        if self.short_text and len(self.short_text) > 10000:
            raise ValidationError(
                {"short_text": "Le texte de l’article ne peut pas dépasser 10000 caractères."}
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
    public_key = models.CharField(max_length=25, unique=True, db_index=True)
    title = models.CharField(max_length=150, db_index=True)
    artists_json = models.JSONField(default=list, blank=True)
    isrc = models.CharField(max_length=32, blank=True, default="", db_index=True)
    image_url = models.URLField(max_length=255, blank=True)
    image_url_small = models.URLField(max_length=255, blank=True, default="")
    accent_color = models.CharField(max_length=7, blank=True, default="")
    duration = models.PositiveIntegerField(default=0)
    n_deposits = models.PositiveIntegerField(default=0, editable=False)

    class Meta:
        ordering = ["title", "public_key"]
        indexes = [
            models.Index(fields=["title"]),
            models.Index(fields=["public_key"]),
            models.Index(fields=["isrc"]),
        ]

    @property
    def artist(self):
        artists = [str(name).strip() for name in (self.artists_json or []) if str(name).strip()]
        return ", ".join(artists)

    @property
    def song_id(self):
        return self.public_key

    def _provider_links_iter(self):
        prefetched = getattr(self, "prefetched_provider_links", None)
        if prefetched is not None:
            return prefetched
        return list(self.provider_links.all())

    def get_provider_link(self, provider_code: str):
        normalized = (provider_code or "").strip().lower()
        if not normalized:
            return None
        for link in self._provider_links_iter():
            if getattr(link, "provider_code", "") == normalized:
                return link
        return None

    @property
    def spotify_url(self):
        link = self.get_provider_link("spotify")
        if link and link.status == SongProviderLink.STATUS_RESOLVED:
            return link.provider_url or ""
        return ""

    @property
    def deezer_url(self):
        link = self.get_provider_link("deezer")
        if link and link.status == SongProviderLink.STATUS_RESOLVED:
            return link.provider_url or ""
        return ""

    def __str__(self):
        artist = self.artist or "Artiste inconnu"
        return f"{self.title} - {artist}"


class SongProviderLink(models.Model):
    STATUS_RESOLVED = "resolved"
    STATUS_NOT_FOUND = "not_found"
    STATUS_PENDING = "pending"
    STATUS_CHOICES = (
        (STATUS_RESOLVED, "Resolved"),
        (STATUS_NOT_FOUND, "Not found"),
        (STATUS_PENDING, "Pending"),
    )

    song = models.ForeignKey("Song", on_delete=models.CASCADE, related_name="provider_links")
    provider_code = models.CharField(max_length=32, db_index=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True)
    provider_track_id = models.CharField(max_length=128, blank=True, default="", db_index=True)
    provider_url = models.URLField(max_length=255, blank=True, default="")
    provider_uri = models.CharField(max_length=255, blank=True, default="")
    last_attempt_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        unique_together = (("song", "provider_code"),)
        indexes = [
            models.Index(fields=["provider_code", "provider_track_id"]),
            models.Index(fields=["song", "provider_code"]),
            models.Index(fields=["provider_code", "status"]),
        ]

    def __str__(self):
        return f"{self.song.public_key} · {self.provider_code} · {self.status}"


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
            self.filter(box_id=bid, deposit_type="box")
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
            self.filter(user_id=uid).exclude(deposit_type="favorite")
            .with_related()
            .order_by("-deposited_at")
        )
        return qs[:int(limit)] if limit else qs


class Deposit(models.Model):
    DEPOSIT_TYPE_BOX = "box"
    DEPOSIT_TYPE_FAVORITE = "favorite"
    DEPOSIT_TYPE_PINNED = "pinned"
    DEPOSIT_TYPE_CHOICES = (
        (DEPOSIT_TYPE_BOX, "Box"),
        (DEPOSIT_TYPE_FAVORITE, "Favorite"),
        (DEPOSIT_TYPE_PINNED, "Pinned"),
    )

    deposited_at = models.DateTimeField(default=timezone.now, db_index=True)

    song = models.ForeignKey("Song", on_delete=models.CASCADE, related_name="deposits")
    box = models.ForeignKey(
        "Box",
        on_delete=models.CASCADE,
        related_name="deposits",
        null=True,
        blank=True,
    )
    user = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="deposits",
    )

    deposit_type = models.CharField(
        max_length=16,
        choices=DEPOSIT_TYPE_CHOICES,
        default=DEPOSIT_TYPE_BOX,
        db_index=True,
    )

    public_key = models.CharField(
        max_length=16,
        unique=True,
        db_index=True,
        editable=False
    )
    pin_expires_at = models.DateTimeField(null=True, blank=True, db_index=True)
    pin_duration_minutes = models.PositiveIntegerField(null=True, blank=True)
    pin_points_spent = models.PositiveIntegerField(default=0)

    objects = DepositQuerySet.as_manager()

    class Meta:
        ordering = ["-deposited_at"]
        indexes = [
            models.Index(fields=["box", "deposited_at"]),
            models.Index(fields=["song", "deposited_at"]),
            models.Index(fields=["user", "deposited_at"]),
            models.Index(fields=["deposit_type", "deposited_at"]),
            models.Index(fields=["deposit_type", "box", "pin_expires_at"]),
            models.Index(fields=["public_key"]),
        ]

    def __str__(self):
        return (
            f"Deposit {self.public_key} (song={self.song.public_key}, "
            f"box={self.box_id}, type={self.deposit_type})"
        )

    def clean(self):
        if self.deposit_type in (self.DEPOSIT_TYPE_BOX, self.DEPOSIT_TYPE_PINNED) and not self.box_id:
            raise ValidationError({"box": "Une boîte est obligatoire pour ce type de dépôt."})
        if self.deposit_type == self.DEPOSIT_TYPE_FAVORITE:
            self.box = None
            self.pin_expires_at = None
            self.pin_duration_minutes = None
            self.pin_points_spent = 0
        if self.deposit_type == self.DEPOSIT_TYPE_BOX:
            self.pin_expires_at = None
            self.pin_duration_minutes = None
            self.pin_points_spent = 0
        if self.deposit_type == self.DEPOSIT_TYPE_PINNED:
            if not self.pin_expires_at:
                raise ValidationError({"pin_expires_at": "La date de fin est obligatoire pour un dépôt épinglé."})
            if not self.pin_duration_minutes:
                raise ValidationError({"pin_duration_minutes": "La durée est obligatoire pour un dépôt épinglé."})
            if int(self.pin_points_spent or 0) <= 0:
                raise ValidationError({"pin_points_spent": "Le coût doit être strictement positif pour un dépôt épinglé."})

    def save(self, *args, **kwargs):
        if not self.public_key:
            self.public_key = self._generate_unique_key()
        self.full_clean()
        super().save(*args, **kwargs)

    @property
    def is_pin_active(self):
        return (
            self.deposit_type == self.DEPOSIT_TYPE_PINNED
            and bool(self.pin_expires_at)
            and self.pin_expires_at > timezone.now()
        )

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
        ("link", "Link"),
    )
    context = models.CharField(
        max_length=10,
        choices=CONTEXT_CHOICES,
        default="box",
        blank=False,
        null=False,
        db_index=True,
    )
    link_sender = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="link_discoveries_received",
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
            models.Index(fields=["link_sender"]),
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
    Une réaction = un user + un dépôt.
    L'emoji est modifiable (upsert côté API) : un user ne peut avoir qu'une seule
    réaction active par dépôt.
    """
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name="reactions")
    deposit = models.ForeignKey(Deposit, on_delete=models.CASCADE, related_name="reactions")
    emoji = models.ForeignKey(Emoji, on_delete=models.CASCADE, related_name="reactions")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "deposit"], name="uniq_user_deposit_reaction"),
        ]
        indexes = [
            models.Index(fields=["deposit", "emoji"]),
            models.Index(fields=["user", "deposit"]),
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user_id} -> {self.deposit_id} {self.emoji.char}"


class Comment(models.Model):
    STATUS_PUBLISHED = "published"
    STATUS_QUARANTINED = "quarantined"
    STATUS_REMOVED_MODERATION = "removed_moderation"
    STATUS_DELETED_BY_AUTHOR = "deleted_by_author"

    STATUS_CHOICES = (
        (STATUS_PUBLISHED, "Published"),
        (STATUS_QUARANTINED, "Quarantined"),
        (STATUS_REMOVED_MODERATION, "Removed by moderation"),
        (STATUS_DELETED_BY_AUTHOR, "Deleted by author"),
    )

    client = models.ForeignKey(
        "Client",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="comments",
    )
    deposit = models.ForeignKey(
        Deposit,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="comments",
    )
    user = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="comments",
    )

    text = models.CharField(max_length=100)
    normalized_text = models.CharField(max_length=160, blank=True, default="", db_index=True)
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default=STATUS_PUBLISHED, db_index=True)
    reason_code = models.CharField(max_length=64, blank=True, default="", db_index=True)
    risk_score = models.PositiveSmallIntegerField(default=0)
    risk_flags = models.JSONField(default=list, blank=True)
    reports_count = models.PositiveIntegerField(default=0)

    deposit_public_key = models.CharField(max_length=16, blank=True, default="", db_index=True)
    deposit_box_name = models.CharField(max_length=100, blank=True, default="")
    deposit_box_url = models.CharField(max_length=100, blank=True, default="")
    deposit_deleted = models.BooleanField(default=False, db_index=True)

    deposit_owner_user_id = models.PositiveIntegerField(null=True, blank=True, db_index=True)
    deposit_owner_username = models.CharField(max_length=150, blank=True, default="")

    author_username = models.CharField(max_length=150, blank=True, default="")
    author_display_name = models.CharField(max_length=150, blank=True, default="")
    author_email = models.EmailField(blank=True, default="")
    author_avatar_url = models.CharField(max_length=500, blank=True, default="")

    author_ip = models.GenericIPAddressField(null=True, blank=True)
    author_user_agent = models.CharField(max_length=255, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at", "id"]
        constraints = [
            models.UniqueConstraint(fields=["deposit", "user"], name="unique_comment_per_user_and_deposit"),
        ]
        indexes = [
            models.Index(fields=["client", "status", "created_at"]),
            models.Index(fields=["deposit", "status", "created_at"]),
            models.Index(fields=["user", "created_at"]),
            models.Index(fields=["deposit_owner_user_id", "created_at"]),
        ]

    def __str__(self):
        return f"Comment {self.id} on {self.deposit_public_key or self.deposit_id}"


class CommentReport(models.Model):
    comment = models.ForeignKey(Comment, on_delete=models.CASCADE, related_name="reports")
    reporter = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="comment_reports",
    )
    reason_code = models.CharField(max_length=64, db_index=True)
    free_text = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    reporter_username = models.CharField(max_length=150, blank=True, default="")
    reporter_email = models.EmailField(blank=True, default="")

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["comment", "reporter"], name="unique_comment_report_per_user"),
        ]
        indexes = [
            models.Index(fields=["reason_code", "created_at"]),
        ]


class CommentModerationDecision(models.Model):
    comment = models.ForeignKey(Comment, on_delete=models.CASCADE, related_name="moderation_decisions")
    acted_by = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="comment_moderation_actions",
    )
    decision_code = models.CharField(max_length=64, db_index=True)
    reason_code = models.CharField(max_length=64, blank=True, default="", db_index=True)
    internal_note = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["decision_code", "created_at"]),
            models.Index(fields=["reason_code", "created_at"]),
        ]


class CommentUserRestriction(models.Model):
    TYPE_MUTE_24H = "comment_mute_24h"
    TYPE_MUTE_7D = "comment_mute_7d"
    TYPE_BAN = "comment_ban"

    RESTRICTION_TYPE_CHOICES = (
        (TYPE_MUTE_24H, "Comment mute 24h"),
        (TYPE_MUTE_7D, "Comment mute 7d"),
        (TYPE_BAN, "Comment ban"),
    )

    client = models.ForeignKey(
        "Client",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="comment_restrictions",
    )
    user = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="comment_restrictions",
    )
    created_by = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_comment_restrictions",
    )

    restriction_type = models.CharField(max_length=32, choices=RESTRICTION_TYPE_CHOICES, db_index=True)
    reason_code = models.CharField(max_length=64, blank=True, default="", db_index=True)
    internal_note = models.TextField(blank=True, default="")
    starts_at = models.DateTimeField(default=timezone.now, db_index=True)
    ends_at = models.DateTimeField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["client", "user", "created_at"]),
            models.Index(fields=["client", "starts_at", "ends_at"]),
        ]

    def is_active_at(self, at=None):
        current = at or timezone.now()
        if self.starts_at and self.starts_at > current:
            return False
        if self.ends_at and self.ends_at <= current:
            return False
        return True


class CommentAttemptLog(models.Model):
    client = models.ForeignKey(
        "Client",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="comment_attempt_logs",
    )
    deposit = models.ForeignKey(
        Deposit,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="comment_attempt_logs",
    )
    user = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="comment_attempt_logs",
    )

    deposit_public_key = models.CharField(max_length=16, blank=True, default="", db_index=True)
    target_owner_user_id = models.PositiveIntegerField(null=True, blank=True, db_index=True)
    target_owner_username = models.CharField(max_length=150, blank=True, default="")

    text = models.CharField(max_length=100, blank=True, default="")
    normalized_text = models.CharField(max_length=160, blank=True, default="", db_index=True)
    reason_code = models.CharField(max_length=64, db_index=True)
    meta = models.JSONField(default=dict, blank=True)
    author_ip = models.GenericIPAddressField(null=True, blank=True)
    author_user_agent = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["client", "reason_code", "created_at"]),
            models.Index(fields=["user", "reason_code", "created_at"]),
        ]




class Sticker(models.Model):
    STATUS_CREATED = "created"
    STATUS_GENERATED = "generated"
    STATUS_DOWNLOADED = "downloaded"
    STATUS_ASSIGNED = "assigned"

    STATUS_CHOICES = [
        (STATUS_CREATED, "Créé"),
        (STATUS_GENERATED, "QR généré"),
        (STATUS_DOWNLOADED, "Téléchargé"),
        (STATUS_ASSIGNED, "Assigné"),
    ]

    slug = models.CharField(
        max_length=11,
        unique=True,
        db_index=True,
        blank=True,
        validators=[
            RegexValidator(
                regex=r"^\d{11}$",
                message="Le slug du sticker doit contenir exactement 11 chiffres.",
            )
        ],
        help_text="11 chiffres. Laisse vide pour générer automatiquement un slug.",
    )
    client = models.ForeignKey(
        Client,
        on_delete=models.PROTECT,
        related_name="stickers",
        db_index=True,
        null=True,
        blank=True,
    )
    box = models.ForeignKey(
        Box,
        on_delete=models.PROTECT,
        related_name="stickers",
        null=True,
        blank=True,
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_CREATED,
        db_index=True,
    )
    is_active = models.BooleanField(default=True, db_index=True)
    qr_generated_at = models.DateTimeField(null=True, blank=True, db_index=True)
    downloaded_at = models.DateTimeField(null=True, blank=True, db_index=True)
    assigned_at = models.DateTimeField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["slug"]),
            models.Index(fields=["client", "status"]),
            models.Index(fields=["client", "is_active", "created_at"]),
            models.Index(fields=["client", "qr_generated_at"]),
            models.Index(fields=["client", "downloaded_at"]),
            models.Index(fields=["client", "assigned_at"]),
        ]

    def __str__(self):
        target = getattr(self.box, "url", None) or "non assigné"
        return f"{self.slug} → {target}"

    @staticmethod
    def generate_slug():
        return "".join(secrets.choice("0123456789") for _ in range(11))

    def get_status_from_fields(self):
        if self.box_id:
            return self.STATUS_ASSIGNED
        if self.downloaded_at:
            return self.STATUS_DOWNLOADED
        if self.qr_generated_at:
            return self.STATUS_GENERATED
        return self.STATUS_CREATED

    def sync_status(self):
        self.status = self.get_status_from_fields()
        return self.status

    def clean(self):
        errors = {}

        self.slug = (self.slug or "").strip()

        if self.slug and not re.fullmatch(r"\d{11}", self.slug):
            errors["slug"] = "Le slug du sticker doit contenir exactement 11 chiffres."

        if self.box_id and not self.client_id and getattr(self.box, "client_id", None):
            self.client = self.box.client

        if self.box_id:
            if not getattr(self.box, "client_id", None):
                errors["box"] = "La box sélectionnée n’est rattachée à aucun client."
            elif self.client_id and self.box.client_id != self.client_id:
                errors["box"] = "La box doit appartenir au même client que le sticker."

        if errors:
            raise ValidationError(errors)

    def mark_generated(self, at=None):
        if not self.qr_generated_at:
            self.qr_generated_at = at or timezone.now()
        self.sync_status()

    def mark_downloaded(self, at=None):
        if not self.qr_generated_at:
            self.qr_generated_at = at or timezone.now()
        self.downloaded_at = at or timezone.now()
        self.sync_status()

    def assign_box(self, box, at=None):
        self.box = box
        self.assigned_at = at or timezone.now()
        self.sync_status()

    def unassign_box(self):
        self.box = None
        self.assigned_at = None
        self.sync_status()

    def save(self, *args, **kwargs):
        if not self.slug:
            slug = self.generate_slug()
            while self.__class__.objects.filter(slug=slug).exists():
                slug = self.generate_slug()
            self.slug = slug

        if self.box_id and not self.client_id and getattr(self.box, "client_id", None):
            self.client = self.box.client

        if self.box_id and not self.assigned_at:
            self.assigned_at = timezone.now()
        if not self.box_id:
            self.assigned_at = None
        if self.downloaded_at and not self.qr_generated_at:
            self.qr_generated_at = self.downloaded_at

        self.sync_status()
        self.full_clean()
        return super().save(*args, **kwargs)

class Link(models.Model):
    ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"

    slug = models.CharField(
        max_length=15,
        unique=True,
        db_index=True,
        validators=[
            RegexValidator(
                regex=r"^[abcdefghjkmnpqrstuvwxyz23456789]{15}$",
                message="Le slug du lien doit contenir exactement 15 caractères alphanumériques minuscules sans caractères ambigus.",
            )
        ],
    )
    deposit = models.ForeignKey(
        Deposit,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="share_links",
    )
    created_by = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_share_links",
    )
    opened_by_users = models.ManyToManyField(
        CustomUser,
        blank=True,
        related_name="opened_share_links",
    )
    anonymous_view_count = models.PositiveIntegerField(default=0)
    expires_at = models.DateTimeField(db_index=True)
    deposit_deleted = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["deposit", "created_by"], name="unique_link_per_deposit_and_creator"),
        ]
        indexes = [
            models.Index(fields=["slug"]),
            models.Index(fields=["created_by", "created_at"]),
            models.Index(fields=["expires_at"]),
        ]

    def __str__(self):
        return f"{self.slug} → {getattr(self.deposit, 'public_key', None) or 'dépôt supprimé'}"

    @classmethod
    def generate_slug(cls):
        return "".join(secrets.choice(cls.ALPHABET) for _ in range(15))

    @staticmethod
    def default_expires_at():
        return timezone.now() + timedelta(days=90)

    def extend_expiration(self):
        self.expires_at = self.default_expires_at()
        return self.expires_at

    def save(self, *args, **kwargs):
        if not self.slug:
            slug = self.generate_slug()
            while self.__class__.objects.filter(slug=slug).exists():
                slug = self.generate_slug()
            self.slug = slug

        if not self.expires_at:
            self.expires_at = self.default_expires_at()

        self.full_clean()
        return super().save(*args, **kwargs)


@receiver(models.signals.pre_delete, sender=Deposit)
def mark_comments_when_deposit_deleted(sender, instance, **kwargs):
    Comment.objects.filter(deposit=instance).update(deposit_deleted=True)
    CommentAttemptLog.objects.filter(deposit=instance).update(deposit_public_key=instance.public_key or "")
    Link.objects.filter(deposit=instance).update(deposit_deleted=True, deposit=None)
