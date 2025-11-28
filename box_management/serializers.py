from rest_framework import serializers
from .models import Box, Song, Deposit, LocationPoint, DiscoveredSong, Emoji, EmojiRight, Reaction


class BoxSerializer(serializers.ModelSerializer):
    class Meta:
        model = Box
        fields = '__all__'


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
        fields = ['id', 'char', 'active', 'cost']


class EmojiRightSerializer(serializers.ModelSerializer):
    emoji = EmojiSerializer()
    class Meta:
        model = EmojiRight
        fields = ['emoji', 'granted_at']


class ReactionSerializer(serializers.ModelSerializer):
    emoji = EmojiSerializer()
    class Meta:
        model = Reaction
        fields = ['deposit', 'emoji', 'created_at', 'updated_at']

