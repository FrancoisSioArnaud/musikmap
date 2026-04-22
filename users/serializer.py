from rest_framework import serializers

from .models import CustomUser


class CustomUserSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(read_only=True)

    class Meta:
        model = CustomUser
        fields = [
            "id",
            "username",
            "display_name",
            "email",
            "profile_picture",
            "points",
            "last_platform",
            "is_guest",
            "last_seen_at",
            "converted_at",
        ]
