from rest_framework import serializers
from .models import *


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

