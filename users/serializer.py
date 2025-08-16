from box_management.serializers import SongSerializer
from rest_framework import serializers
from .models import CustomUser


class CustomUserSerializer(serializers.ModelSerializer):
    favorite_song = SongSerializer()
    class Meta:
        model = CustomUser
        fields = ['id', 'username', 'email', 'profile_picture', 'points', 'preferred_platform', 'favorite_song']
