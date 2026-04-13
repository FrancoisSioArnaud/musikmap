from django.conf import settings
from django.db import models


class SpotifyToken(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    refresh_token = models.CharField(max_length=255)
    access_token = models.CharField(max_length=255)
    expires_in = models.DateTimeField()
    token_type = models.CharField(max_length=50)

    def __str__(self):
        return f"SpotifyToken(user={self.user_id})"
