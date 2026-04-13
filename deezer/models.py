from django.conf import settings
from django.db import models


class DeezerToken(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    access_token = models.CharField(max_length=255)

    def __str__(self):
        return f"DeezerToken(user={self.user_id})"
