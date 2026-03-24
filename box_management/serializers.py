from rest_framework import serializers
from .models import Box, Client, Song, Deposit, LocationPoint, DiscoveredSong, Emoji, EmojiRight, Reaction


class ClientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = ["id", "name", "slug", "background_picture", "created_at", "updated_at"]
        

class BoxSerializer(serializers.ModelSerializer):
    client_detail = ClientSerializer(source="client", read_only=True)

    class Meta:
        model = Box
        fields = [
            "id",
            "name",
            "description",
            "url",
            "image_url",
            "client",
            "client_detail",
            "created_at",
            "updated_at",
        ]


class SongSerializer(serializers.ModelSerializer):
    class Meta:
        model = Song
        fields = '__all__'


class DepositSerializer(serializers.ModelSerializer):
    class Meta:
        model = Deposit
        fields = '__all__'


class LocationPointSerializer(serializers.ModelSerializer):
    class Meta:
        model = LocationPoint
        fields = '__all__'


class DiscoveredSongSerializer(serializers.ModelSerializer):
    class Meta:
        model = DiscoveredSong
        fields = '__all__'


# ======= NOUVEAUX =======

class EmojiSerializer(serializers.ModelSerializer):
    class Meta:
        model = Emoji
        fields = '__all__'


class EmojiRightSerializer(serializers.ModelSerializer):
    emoji = EmojiSerializer()

    class Meta:
        model = EmojiRight
        fields = '__all__'


class ReactionSerializer(serializers.ModelSerializer):
    emoji = EmojiSerializer()

    class Meta:
        model = Reaction
        fields = '__all__'
