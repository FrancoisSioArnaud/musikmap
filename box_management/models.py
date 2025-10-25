from django.db import models
from django.utils import timezone
from django.utils.text import slugify
from users.models import CustomUser


class Box(models.Model):
    """
    Class goal: This class represents a Music Box.

    Attributes:
        name        : The name of the box.
        description : The description of the box.
        url         : The URL of the box.
        image_url   : The URL of the image of the box.
        created_at  : The date of creation of the box.
        updated_at  : The date of the last update of the box.
        client_name : The name of the client.
        max_deposits: The maximum number of deposits allowed in the box.
    """
    name = models.CharField(max_length=50, unique=True)
    description = models.CharField(max_length=150, blank=True)
    url = models.SlugField(blank=True)
    image_url = models.URLField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    client_name = models.CharField(max_length=50)

    def __str__(self):
        """
        Method goal: Returns the name of the box used to display it in the admin interface.
        """
        return self.name


class Song(models.Model):
    """
    Class goal: This class represents a song.

    Attributes:
        song_id   : The id of the song.
        title     : The title of the song.
        artist    : The artist of the song.
        url       : The URL of the song.
        image_url : The URL of the image of the song.
        duration  : The duration of the song.
        n_deposits: The number of deposits of the song.
    """
    song_id = models.CharField(max_length=15)
    title = models.CharField(max_length=50)
    artist = models.CharField(max_length=50)
    spotify_url = models.CharField(max_length=255, null=True, blank=True)
    deezer_url = models.CharField(max_length=255, null=True, blank=True)
    image_url = models.URLField(max_length=200, blank=True)
    duration = models.IntegerField(default=0)  # Duration in seconds
    n_deposits = models.IntegerField(default=0)

    def __str__(self):
        """
        Method goal: Returns the title and the artist of the song used to display it in the admin interface.
        """
        return self.title + " - " + str(self.artist)


class Deposit(models.Model):
    # Overriding of the save() method in order to avoid 'auto_now_add=True' which makes DateTimeField uneditable
    def save(self, *args, **kwargs):
        if not self.pk:  # Check if it's the first save
            self.deposited_at = timezone.now()
        super().save(*args, **kwargs)

    song_id = models.ForeignKey(Song, on_delete=models.CASCADE)
    box_id = models.ForeignKey(Box, on_delete=models.CASCADE)
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, null=True)
    deposited_at = models.DateTimeField()

    def __str__(self):
        return str(self.song_id) + " - " + str(self.box_id)


class LocationPoint(models.Model):
    """
    Class goal: This class represents a location point.
    """
    box_id = models.ForeignKey(Box, on_delete=models.CASCADE)
    latitude = models.FloatField()
    longitude = models.FloatField()
    dist_location = models.IntegerField(default=100)

    def __str__(self):
        box_name = Box.objects.get(id=self.box_id_id).name
        return box_name + " - " + str(self.latitude) + " - " + str(self.longitude)


class DiscoveredSong(models.Model):
    """
    Représente un dépôt découvert par un utilisateur.
    - discovered_type : "main" (gros bloc) ou "revealed" (dépôt révélé)
    - Un dépôt ne peut être découvert qu'une seule fois par un même utilisateur.
    """
    deposit_id = models.ForeignKey("box_management.Deposit", on_delete=models.CASCADE)
    user_id = models.ForeignKey(CustomUser, on_delete=models.CASCADE)

    DISCOVERED_TYPES = (
        ("main", "Main"),
        ("revealed", "Revealed"),
    )
    discovered_type = models.CharField(max_length=8, choices=DISCOVERED_TYPES, default="revealed")
    discovered_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user_id", "deposit_id"], name="unique_discovery_per_user_and_deposit"),
        ]

    def __str__(self):
        return f"{self.user_id} - {self.deposit_id}"


# =========================================================
#                 NOUVEAUX MODÈLES : EMOJI & RÉACTIONS
# =========================================================

class Emoji(models.Model):
    char = models.CharField(max_length=8, unique=True)  # unicode courte (un ou deux code points)
    active = models.BooleanField(default=True)
    basic = models.BooleanField(default=False)          # dispo par défaut sans achat
    cost = models.IntegerField(default=0)               # coût en points (si non-basic)

    def __str__(self):
        return self.char


class EmojiRight(models.Model):
    """Emoji débloqué/acheté par un utilisateur (droit global)."""
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE)
    emoji = models.ForeignKey(Emoji, on_delete=models.CASCADE)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "emoji"], name="unique_emoji_right_per_user"),
        ]

    def __str__(self):
        return f"{self.user_id} -> {self.emoji_id}"


class Reaction(models.Model):
    """Une réaction (un seul emoji) d’un user sur un dépôt donné."""
    deposit = models.ForeignKey("box_management.Deposit", on_delete=models.CASCADE)
    emoji = models.ForeignKey(Emoji, on_delete=models.PROTECT)
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE)

    created_at = models.DateTimeField(auto_now_add=True)  # date de première réaction
    updated_at = models.DateTimeField(auto_now=True)      # date de dernier changement

    class Meta:
        constraints = [
            # Un user et un dépôt ne peut avoir qu’une réaction en commun
            models.UniqueConstraint(fields=["user", "deposit"], name="unique_reaction_per_user_and_deposit"),
        ]
        indexes = [
            models.Index(fields=["deposit", "emoji"]),
        ]

    def __str__(self):
        return f"{self.deposit_id} [{self.user_id}] {self.emoji_id}"
