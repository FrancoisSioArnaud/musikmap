from django.db import models
from django.utils import timezone
from django.db.models import Count
from django.dispatch import receiver
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
    user = models.ForeignKey(CustomUser, on_delete=models.SET_NULL, null=True, blank=True, related_name="deposits")

    # 🚨 La nouvelle clé publique (exposée au front)
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
            # ⚡ index supplémentaire pour rechercher rapidement
            models.Index(fields=["public_key"]),
        ]

    def __str__(self):
        return f"Deposit {self.public_key} (song={self.song_id}, box={self.box_id})"

    # --------------------------------------------
    # 🔑 Génération automatique d'une clé unique
    # --------------------------------------------
    def save(self, *args, **kwargs):
        if not self.public_key:
            # on génère une clé unique de 16 chars
            self.public_key = self._generate_unique_key()
        super().save(*args, **kwargs)

    @staticmethod
    def _generate_key():
        # 16 caractères safe (A-Za-z0-9)
        return secrets.token_urlsafe(12)[:16]

    @classmethod
    def _generate_unique_key(cls):
        """Génère une clé qui n'existe pas déjà en base."""
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
        # ✅ Pas de requête supplémentaire : on utilise la FK déjà chargée
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

    # ✅ CONTEXTE SIMPLIFIÉ
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
    char = models.CharField(max_length=8, unique=True, db_index=True)  # ex "🔥", "😂"
    active = models.BooleanField(default=True)
    cost = models.PositiveIntegerField(default=0)  # coût en points

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
