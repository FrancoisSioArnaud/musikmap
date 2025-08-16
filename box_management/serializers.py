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
    note_display = serializers.SerializerMethodField()

    class Meta:
        model = Deposit
        fields = '__all__'

    def get_note_display(self, obj):
        return obj.get_note_display()


class LocationPointSerializer(serializers.ModelSerializer):
    class Meta:
        model = LocationPoint
        fields = '__all__'


class VisibleDepositsSerializer(serializers.ModelSerializer):
    class Meta:
        model = VisibleDeposit
        fields = '__all__'


class DiscoveredSongSerializer(serializers.ModelSerializer):
    class Meta:
        model = DiscoveredSong
        fields = '__all__'
