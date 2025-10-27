from django.db import models
from django.utils import timezone
from users.models import CustomUser


class Box(models.Model):
    name = models.CharField(max_length=50, unique=True)
    description = models.CharField(max_length=150, blank=True)
    url = models.SlugField(blank=True)
    image_url = models.URLField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    client_name = models.CharField(max_length=50)

    def __str__(self):
        return self.name


class Song(models.Model):
    song_id = models.CharField(max_length=15)
    title = models.CharField(max_length=50)
    artist = models.CharField(max_length=50)
    spotify_url = models.CharField(max_length=255, null=True, blank=True)
    deezer_url  = models.CharField(max_length=255, null=True, blank=True)
    image_url = models.URLField(max_length=200, blank=True)
    duration = models.IntegerField(default=0)
    n_deposits = models.IntegerField(default=0)

    def __str__(self):
        return f"{self.title} - {self.artist}"


class Deposit(models.Model):
    def save(self, *args, **kwargs):
        if not self.pk:
            self.deposited_at = timezone.now()
        super().save(*args, **kwargs)

    song_id = models.ForeignKey(Song, on_delete=models.CASCADE)
    box_id = models.ForeignKey(Box, on_delete=models.CASCADE)
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, null=True)
    deposited_at = models.DateTimeField()

    def __str__(self):
        return f"{self.song_id} - {self.box_id}"


class LocationPoint(models.Model):
    box_id = models.ForeignKey(Box, on_delete=models.CASCADE)
    latitude = models.FloatField()
    longitude = models.FloatField()
    dist_location = models.IntegerField(default=100)

    def __str__(self):
        box_name = Box.objects.get(id=self.box_id_id).name
        return f"{box_name} - {self.latitude} - {self.longitude}"


class DiscoveredSong(models.Model):
    deposit_id = models.ForeignKey('box_management.Deposit', on_delete=models.CASCADE)
    user_id = models.ForeignKey(CustomUser, on_delete=models.CASCADE)

    DISCOVERED_TYPES = (
        ("main", "Main"),
        ("revealed", "Revealed"),
    )
    discovered_type = models.CharField(max_length=8, choices=DISCOVERED_TYPES, default="revealed")
    discovered_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['user_id', 'deposit_id'], name='unique_discovery_per_user_and_deposit'),
        ]

    def __str__(self):
        return f"{self.user_id} - {self.deposit_id}"


# =========================
# NOUVEAUX MODÈLES REACTIONS
# =========================

class Emoji(models.Model):
    """Catalogue des emojis (Unicode)"""
    char = models.CharField(max_length=8, unique=True)  # ex "🔥", "😂"
    active = models.BooleanField(default=True)
    basic = models.BooleanField(default=False)  # accessible à tous sans achat
    cost = models.PositiveIntegerField(default=0)  # coût en points (si non-basic)

    def __str__(self):
        flags = []
        if self.basic: flags.append("basic")
        if not self.active: flags.append("inactive")
        fl = f" ({', '.join(flags)})" if flags else ""
        return f"{self.char}{fl}"


class EmojiRight(models.Model):
    """Droit global d'utiliser un emoji (achat par user)"""
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE)
    emoji = models.ForeignKey(Emoji, on_delete=models.CASCADE)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['user', 'emoji'], name='unique_user_emoji_right'),
        ]

    def __str__(self):
        return f"{self.user} → {self.emoji}"



class Reaction(models.Model):
    """Une réaction d’un user sur un dépôt (un seul par couple user/deposit)."""
    deposit = models.ForeignKey(Deposit, on_delete=models.CASCADE)
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE)
    emoji = models.ForeignKey(Emoji, on_delete=models.PROTECT)  # pas de cascade, on garde l’historique
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)  # maj si on change d’emoji

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['user', 'deposit'], name='unique_reaction_per_user_and_deposit'),
        ]
        indexes = [
            models.Index(fields=['deposit', 'emoji']),  # agrégats rapides par dépôt/emoji
            models.Index(fields=['user', 'deposit']),   # recherche de ma réaction
        ]

    def __str__(self):
        return f"{self.deposit_id} {self.user_id} {self.emoji_id}"
