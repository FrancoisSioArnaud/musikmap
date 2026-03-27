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

    # Preferred platform choice
    PLATFORM_CHOICES = [
        ("spotify", "Spotify"),
        ("deezer", "Deezer"),
    ]

    preferred_platform = models.CharField(max_length=10, choices=PLATFORM_CHOICES, blank=True)

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
        return self.client_id is not None and self.portal_status == "active"

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
