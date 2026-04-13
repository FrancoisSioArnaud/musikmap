from django.contrib.auth.models import AbstractUser
from django.db import models
from django.dispatch import receiver
from utils import generate_unique_filename


class CustomUser(AbstractUser):

    # Overriding of the save() method in order to delete older profile pic when it is changed.
    def save(self, *args, **kwargs):
        if self.pk:  # if the user already exists in the db (not a new user registering)
            existing_user = CustomUser.objects.filter(pk=self.pk).first()
            if existing_user and existing_user.profile_picture != self.profile_picture:
                # Delete the old profile picture from the database
                if existing_user.profile_picture:
                    existing_user.profile_picture.delete(False)

        super().save(*args, **kwargs)  # calling the save() method of the parent class (which is User)

    def profile_picture_path(instance, filename):
        # Modify the file name to ensure uniqueness
        filename = generate_unique_filename(instance, filename)
        return filename

    # Add profile_picture field
    profile_picture = models.ImageField(upload_to=profile_picture_path, blank=True, null=True)

    points = models.IntegerField(default=0)
    favorite_deposit = models.ForeignKey(
        "box_management.Deposit",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="favorited_by_users",
    )
    is_guest = models.BooleanField(default=False, db_index=True)
    guest_device_token = models.CharField(max_length=128, unique=True, null=True, blank=True, db_index=True)
    last_seen_at = models.DateTimeField(null=True, blank=True, db_index=True)
    converted_at = models.DateTimeField(null=True, blank=True)

    last_platform = models.CharField(max_length=32, blank=True, default="", db_index=True)

    # -----------------------------
    # Client portal fields
    # -----------------------------
    client = models.ForeignKey(
        "box_management.Client",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="users",
    )

    CLIENT_ROLE_CHOICES = [
        ("client_owner", "Client owner"),
        ("client_editor", "Client editor"),
    ]
    client_role = models.CharField(
        max_length=20,
        choices=CLIENT_ROLE_CHOICES,
        blank=True,
        default="",
        db_index=True,
        help_text="Role of the user in the client portal.",
    )

    PORTAL_STATUS_CHOICES = [
        ("invited", "Invited"),
        ("active", "Active"),
        ("suspended", "Suspended"),
    ]
    portal_status = models.CharField(
        max_length=12,
        choices=PORTAL_STATUS_CHOICES,
        default="active",
        db_index=True,
        help_text="Access status for the client portal.",
    )

    class Meta:
        indexes = [
            models.Index(fields=["favorite_deposit"]),
            models.Index(fields=["client"]),
            models.Index(fields=["client_role"]),
            models.Index(fields=["portal_status"]),
            models.Index(fields=["client", "client_role"]),
        ]

    @property
    def is_client_user(self):
        return bool(self.client_id)

    @property
    def can_access_client_portal(self):
        return (not self.is_guest) and self.client_id is not None and self.portal_status == "active"

    @property
    def display_name(self):
        return "Invité" if self.is_guest else self.username

    @property
    def can_manage_articles(self):
        return self.client_role in {"client_owner", "client_editor"} and self.can_access_client_portal


@receiver(models.signals.pre_delete, sender=CustomUser)
# When a user is deleted, his profile picture is deleted from the database
def delete_profile_picture(sender, instance, **kwargs):
    # Delete the profile picture file from storage
    if instance.profile_picture:
        instance.profile_picture.delete(False)


@receiver(models.signals.pre_save, sender=CustomUser)
def delete_old_profile_picture(sender, instance, **kwargs):
    # Check if the user object already exists in the database
    if instance.pk:
        # Retrieve the existing user object from the database
        existing_user = CustomUser.objects.filter(pk=instance.pk).first()
        if not existing_user:
            return

        # Check if the profile picture has changed
        if existing_user.profile_picture != instance.profile_picture:
            # Delete the old profile picture from the database
            if existing_user.profile_picture:
                existing_user.profile_picture.delete(False)


class UserProviderConnection(models.Model):
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name="provider_connections")
    provider_code = models.CharField(max_length=32, db_index=True)
    provider_user_id = models.CharField(max_length=128, blank=True, default="")
    access_token = models.TextField(blank=True, default="")
    refresh_token = models.TextField(blank=True, default="")
    expires_at = models.DateTimeField(null=True, blank=True)
    scopes = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = (("user", "provider_code"),)
        indexes = [
            models.Index(fields=["user", "provider_code"]),
            models.Index(fields=["provider_code", "is_active"]),
        ]

    def __str__(self):
        return f"{self.user_id} · {self.provider_code}"
