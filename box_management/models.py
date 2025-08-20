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
    max_deposits = models.IntegerField(default=5)

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
        platform_id: The id of the platform on which the song is available.
        n_deposits: The number of deposits of the song.
    """
    song_id = models.CharField(max_length=15)
    title = models.CharField(max_length=50)
    artist = models.CharField(max_length=50)
    spotify_url = models.CharField(max_length=255, null=True, blank=True)
    deezer_url  = models.CharField(max_length=255, null=True, blank=True)
    platform_id = models.IntegerField(default=1)
    image_url = models.URLField(max_length=200, blank=True)
    duration = models.IntegerField(default=0)  # Duration in seconds
    n_deposits = models.IntegerField(default=0)

    def __str__(self):
        """
        Method goal: Returns the title and the artist of the song used to display it in the admin interface.
        """
        return self.title + ' - ' + str(self.artist) + ' - ' + str(self.platform_id)

class Deposit(models.Model):
    # Overriding of the save() method in order to avoid 'auto_now_add=True' which makes DateTimeField uneditable
    def save(self, *args, **kwargs):
        if not self.pk:  # Check if it's the first save
            self.deposited_at = timezone.now()

        super().save(*args, **kwargs)  # calling the save() method of the parent class (which is User)


    song_id = models.ForeignKey(Song, on_delete=models.CASCADE)
    box_id = models.ForeignKey(Box, on_delete=models.CASCADE)
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, null=True)
    # user_id = models.IntegerField()
    deposited_at = models.DateTimeField()

    def __str__(self):
        return str(self.song_id) + ' - ' + str(self.box_id)


class LocationPoint(models.Model):
    """
    Class goal: This class represents a location point.

    Attributes:
        box_id       : The id of the box.
        latitude     : The latitude of the location point.
        longitude    : The longitude of the location point.
        dist_location: The maximum distance between the user and the location point.
    """
    box_id = models.ForeignKey(Box, on_delete=models.CASCADE)
    latitude = models.FloatField()
    longitude = models.FloatField()
    dist_location = models.IntegerField(default=100)

    def __str__(self):
        """
        Method goal: Returns the name of the box, the latitude and the longitude of the location point
        used to display it in the admin interface.
        """
        box_name = Box.objects.get(id=self.box_id_id).name
        return box_name + ' - ' + str(self.latitude) + ' - ' + str(self.longitude)


class DiscoveredSong(models.Model):
    """
    Class goal: This class represents a discovered song.

    Attributes:
        song_id   : The id of the song.
        user_id   : The id of the user.
    """
    deposit_id = models.ForeignKey(Deposit, on_delete=models.CASCADE)
    user_id = models.ForeignKey(CustomUser, on_delete=models.CASCADE)
    discovered_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        """
        Method goal: Returns the id of the user and the id of the deposit used to display it in the admin interface.
        """
        return str(self.user_id) + ' - ' + str(self.deposit_id)










