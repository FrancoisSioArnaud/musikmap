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
        extra_kwargs = {
            "title": {"required": False, "allow_blank": True},
            "link": {"required": False, "allow_blank": True},
            "short_text": {"required": False, "allow_blank": True},
            "cover_image": {"required": False, "allow_blank": True},
            "status": {"required": False},
        }

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
        return (value or "").strip()

    def validate_link(self, value):
        return (value or "").strip()

    def validate_short_text(self, value):
        value = (value or "").strip()
        if len(value) > 300:
            raise serializers.ValidationError(
                "Le texte court ne peut pas dépasser 300 caractères."
            )
        return value

    def validate_cover_image(self, value):
        return (value or "").strip()

    def validate(self, attrs):
        instance = getattr(self, "instance", None)

        status_value = attrs.get("status")
        if status_value is None:
            status_value = getattr(instance, "status", "draft") or "draft"

        title = attrs.get("title")
        if title is None:
            title = getattr(instance, "title", "") if instance else ""
        title = (title or "").strip()

        link = attrs.get("link")
        if link is None:
            link = getattr(instance, "link", "") if instance else ""
        link = (link or "").strip()

        short_text = attrs.get("short_text")
        if short_text is None:
            short_text = getattr(instance, "short_text", "") if instance else ""
        short_text = (short_text or "").strip()

        cover_image = attrs.get("cover_image")
        if cover_image is None:
            cover_image = getattr(instance, "cover_image", "") if instance else ""
        cover_image = (cover_image or "").strip()

        attrs["title"] = title
        attrs["link"] = link
        attrs["short_text"] = short_text
        attrs["cover_image"] = cover_image

        if status_value == "published":
            if not title:
                raise serializers.ValidationError(
                    {"title": "Le titre est obligatoire pour publier un article."}
                )
            if not link and not short_text:
                raise serializers.ValidationError(
                    {
                        "non_field_errors": [
                            "Pour publier un article, renseigne au moins un lien externe ou un texte court."
                        ]
                    }
                )

        return attrs
