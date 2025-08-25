from django.contrib.auth.models import AbstractUser
from django.db import models
from django.dispatch import receiver
from utils import generate_unique_filename


class CustomUser(AbstractUser):

    # Overriding of the save() method in order to delete older profile pic when it is changed.
    def save(self, *args, **kwargs):
        if self.pk:  # if the user already exists in the db (not a new user registering)
            existing_user = CustomUser.objects.get(pk=self.pk)  # pk = Primary Key
            if existing_user.profile_picture != self.profile_picture:
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
        ('spotify', 'Spotify'),
        ('deezer', 'Deezer'),
    ]

    preferred_platform = models.CharField(max_length=10, choices=PLATFORM_CHOICES, blank=True)


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
        existing_user = CustomUser.objects.get(pk=instance.pk)
        # Check if the profile picture has changed
        if existing_user.profile_picture != instance.profile_picture:
            # Delete the old profile picture from the database
            if existing_user.profile_picture:
                existing_user.profile_picture.delete(False)
                
