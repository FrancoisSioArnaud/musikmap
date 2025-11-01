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

    song = models.ForeignKey(
        "Song",
        on_delete=models.CASCADE,
        related_name="deposits",
    )
    box = models.ForeignKey(
        "Box",
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

    objects = DepositQuerySet.as_manager()

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

class ReactionQuerySet(models.QuerySet):
    def with_related(self):
        # FK simples → JOIN en 1 requête pour emoji et user
        return self.select_related("emoji", "user")

    def recent(self):
        return self.order_by("-created_at")

    def for_deposit(self, dep_or_id: Union[int, "Deposit"]):
        dep_id = getattr(dep_or_id, "pk", dep_or_id)
        return self.filter(deposit_id=dep_id)

    def for_deposits(self, dep_ids: Iterable[int]):
        return self.filter(deposit_id__in=list(dep_ids))

    def summary_by_emoji(self):
        """
        Compte par emoji pour un set courant (ex: un dépôt)
        Renvoie : [{'emoji': '🔥', 'count': 3}, ...]
        """
        return (
            self.values("emoji__char")
            .annotate(count=Count("id"))
            .order_by("-count", "emoji__char")
        )


class Reaction(models.Model):
    deposit = models.ForeignKey("Deposit", on_delete=models.CASCADE, related_name="reactions")
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name="reactions")
    emoji = models.ForeignKey("Emoji", on_delete=models.PROTECT, related_name="reactions")

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    # branchement du QuerySet custom
    objects = ReactionQuerySet.as_manager()

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

