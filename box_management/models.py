# box_management/models.py

from django.db import models
from django.utils import timezone
from users.models import CustomUser


class Box(models.Model):
    name = models.CharField(max_length=50, unique=True, db_index=True)
    description = models.CharField(max_length=150, blank=True)
    url = models.SlugField(blank=True, unique=True)
    image_url = models.URLField(max_length=200, blank=True)
    client_name = models.CharField(max_length=50, blank=True)

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


class Deposit(models.Model):
    deposited_at = models.DateTimeField(default=timezone.now, db_index=True)

    song = models.ForeignKey(
        Song,
        on_delete=models.CASCADE,
        related_name="deposits",
    )
    box = models.ForeignKey(
        Box,
        on_delete=models.CASCADE,
        related_name="deposits",
    )
    user = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="deposits",
    )

    class Meta:
        ordering = ["-deposited_at"]
        indexes = [
            models.Index(fields=["box", "deposited_at"]),
            models.Index(fields=["song", "deposited_at"]),
            models.Index(fields=["user", "deposited_at"]),
        ]

    def __str__(self):
        return f"Deposit #{self.pk} · song={self.song_id} · box={self.box_id}"


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
    discovered_type = models.CharField(max_length=8, choices=DISCOVERED_TYPES, default="revealed")
    discovered_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "deposit"], name="unique_discovery_per_user_and_deposit"),
        ]
        ordering = ["-discovered_at"]
        indexes = [
            models.Index(fields=["user", "deposit"]),
        ]

    def __str__(self):
        return f"{self.user_id} - {self.deposit_id}"


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

    def __str__(self):
        return f"{self.user} → {self.emoji}"


class Reaction(models.Model):
    """Une réaction d’un user sur un dépôt (un seul par couple user/deposit)."""
    deposit = models.ForeignKey(Deposit, on_delete=models.CASCADE, related_name="reactions")
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name="reactions")
    # PROTECT = on ne supprime pas un emoji utilisé, tu as raison
    emoji = models.ForeignKey(Emoji, on_delete=models.PROTECT, related_name="reactions")

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "deposit"], name="unique_reaction_per_user_and_deposit"),
        ]
        indexes = [
            models.Index(fields=["deposit", "emoji"]),
            models.Index(fields=["user", "deposit"]),
        ]
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.deposit_id} {self.user_id} {self.emoji_id}"
