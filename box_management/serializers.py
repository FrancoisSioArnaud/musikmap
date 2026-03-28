from rest_framework import serializers
from .models import (
    Article,
    Box,
    Client,
    Song,
    Deposit,
    LocationPoint,
    DiscoveredSong,
    Emoji,
    EmojiRight,
    Reaction,
)


class ClientSerializer(serializers.ModelSerializer):
    background_picture_url = serializers.SerializerMethodField()

    class Meta:
        model = Client
        fields = [
            "id",
            "name",
            "slug",
            "background_picture",
            "background_picture_url",
            "created_at",
            "updated_at",
        ]

    def get_background_picture_url(self, obj):
        if not obj.background_picture:
            return None
        try:
            return obj.background_picture.url
        except Exception:
            return None


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
        fields = "__all__"


class DepositSerializer(serializers.ModelSerializer):
    song_detail = SongSerializer(source="song", read_only=True)
    box_detail = BoxSerializer(source="box", read_only=True)

    class Meta:
        model = Deposit
        fields = [
            "id",
            "public_key",
            "deposited_at",
            "song",
            "song_detail",
            "box",
            "box_detail",
            "user",
        ]


class LocationPointSerializer(serializers.ModelSerializer):
    class Meta:
        model = LocationPoint
        fields = "__all__"


class DiscoveredSongSerializer(serializers.ModelSerializer):
    deposit_detail = DepositSerializer(source="deposit", read_only=True)

    class Meta:
        model = DiscoveredSong
        fields = [
            "id",
            "deposit",
            "deposit_detail",
            "user",
            "discovered_type",
            "discovered_at",
            "context",
        ]


class EmojiSerializer(serializers.ModelSerializer):
    class Meta:
        model = Emoji
        fields = [
            "id",
            "char",
            "active",
            "cost",
        ]


class EmojiRightSerializer(serializers.ModelSerializer):
    emoji_detail = EmojiSerializer(source="emoji", read_only=True)

    class Meta:
        model = EmojiRight
        fields = [
            "id",
            "user",
            "emoji",
            "emoji_detail",
        ]


class ReactionSerializer(serializers.ModelSerializer):
    emoji_detail = EmojiSerializer(source="emoji", read_only=True)

    class Meta:
        model = Reaction
        fields = [
            "id",
            "user",
            "deposit",
            "emoji",
            "emoji_detail",
            "created_at",
            "updated_at",
        ]


class ClientAdminArticleSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()
    author_username = serializers.SerializerMethodField()
    client_name = serializers.SerializerMethodField()
    client_slug = serializers.SerializerMethodField()

    class Meta:
        model = Article
        fields = [
            "id",
            "client",
            "client_name",
            "client_slug",
            "author",
            "author_name",
            "author_username",
            "title",
            "link",
            "short_text",
            "cover_image",
            "status",
            "created_at",
            "updated_at",
            "published_at",
        ]
        read_only_fields = [
            "id",
            "client",
            "client_name",
            "client_slug",
            "author",
            "author_name",
            "author_username",
            "created_at",
            "updated_at",
            "published_at",
        ]

    def get_author_name(self, obj):
        if not obj.author:
            return None
        full_name = obj.author.get_full_name().strip()
        return full_name or obj.author.username

    def get_author_username(self, obj):
        return obj.author.username if obj.author else None

    def get_client_name(self, obj):
        return obj.client.name if obj.client else None

    def get_client_slug(self, obj):
        return obj.client.slug if obj.client else None

    def validate_title(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Le titre est obligatoire.")
        return value

    def validate_link(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Le lien est obligatoire.")
        return value

    def validate_short_text(self, value):
        value = (value or "").strip()
        if len(value) > 300:
            raise serializers.ValidationError(
                "Le texte court ne peut pas dépasser 300 caractères."
            )
        return value

    def validate_cover_image(self, value):
        return (value or "").strip()
