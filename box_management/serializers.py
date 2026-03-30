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


class PublicVisibleArticleSerializer(serializers.ModelSerializer):
    client_slug = serializers.CharField(source="client.slug", read_only=True)
    short_text = serializers.SerializerMethodField()

    class Meta:
        model = Article
        fields = [
            "id",
            "title",
            "link",
            "short_text",
            "cover_image",
            "favicon",
            "client_slug",
            "published_at",
        ]
        read_only_fields = fields

    def get_short_text(self, obj):
        value = (obj.short_text or "").strip()
        if len(value) <= 100:
            return value
        return value[:100]


class PublicVisibleArticleDetailSerializer(serializers.ModelSerializer):
    client_slug = serializers.CharField(source="client.slug", read_only=True)

    class Meta:
        model = Article
        fields = [
            "id",
            "title",
            "link",
            "short_text",
            "cover_image",
            "favicon",
            "client_slug",
            "published_at",
        ]
        read_only_fields = fields


class ClientAdminArticleSerializer(serializers.ModelSerializer):
    display_start_date = serializers.DateField(required=False, allow_null=True)
    display_end_date = serializers.DateField(required=False, allow_null=True)
    display_start_time = serializers.TimeField(
        required=False,
        allow_null=True,
        format="%H:%M",
        input_formats=["%H:%M", "%H:%M:%S"],
    )
    display_end_time = serializers.TimeField(
        required=False,
        allow_null=True,
        format="%H:%M",
        input_formats=["%H:%M", "%H:%M:%S"],
    )
    author_name = serializers.SerializerMethodField()
    author_username = serializers.SerializerMethodField()
    client_name = serializers.SerializerMethodField()
    client_slug = serializers.SerializerMethodField()
    visibility_state = serializers.SerializerMethodField()
    visibility_state_label = serializers.SerializerMethodField()
    is_visible_now = serializers.SerializerMethodField()
    display_date_range_label = serializers.SerializerMethodField()
    display_time_range_label = serializers.SerializerMethodField()
    display_window_summary = serializers.SerializerMethodField()

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
            "favicon",
            "cover_image",
            "status",
            "display_start_date",
            "display_end_date",
            "display_start_time",
            "display_end_time",
            "visibility_state",
            "visibility_state_label",
            "is_visible_now",
            "display_date_range_label",
            "display_time_range_label",
            "display_window_summary",
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
            "visibility_state",
            "visibility_state_label",
            "is_visible_now",
            "display_date_range_label",
            "display_time_range_label",
            "display_window_summary",
            "created_at",
            "updated_at",
            "published_at",
        ]
        extra_kwargs = {
            "title": {"required": False, "allow_blank": True},
            "link": {"required": False, "allow_blank": True},
            "short_text": {"required": False, "allow_blank": True},
            "favicon": {"required": False, "allow_blank": True},
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

    def get_visibility_state(self, obj):
        return obj.get_visibility_state()

    def get_visibility_state_label(self, obj):
        return obj.get_visibility_state_label()

    def get_is_visible_now(self, obj):
        return obj.is_visible_now()

    def get_display_date_range_label(self, obj):
        return obj.get_display_date_range_label()

    def get_display_time_range_label(self, obj):
        return obj.get_display_time_range_label()

    def get_display_window_summary(self, obj):
        return obj.get_display_window_summary()

    def validate_title(self, value):
        return (value or "").strip()

    def validate_link(self, value):
        return (value or "").strip()

    def validate_short_text(self, value):
        value = (value or "").strip()
        if len(value) > 10000:
            raise serializers.ValidationError(
                "Le texte de l’article ne peut pas dépasser 10000 caractères."
            )
        return value

    def validate_favicon(self, value):
        return (value or "").strip()

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

        favicon = attrs.get("favicon")
        if favicon is None:
            favicon = getattr(instance, "favicon", "") if instance else ""
        favicon = (favicon or "").strip()

        cover_image = attrs.get("cover_image")
        if cover_image is None:
            cover_image = getattr(instance, "cover_image", "") if instance else ""
        cover_image = (cover_image or "").strip()

        display_start_date = (
            attrs["display_start_date"]
            if "display_start_date" in attrs
            else (instance.display_start_date if instance else None)
        )

        display_end_date = (
            attrs["display_end_date"]
            if "display_end_date" in attrs
            else (instance.display_end_date if instance else None)
        )

        attrs["title"] = title
        attrs["link"] = link
        attrs["short_text"] = short_text
        attrs["favicon"] = favicon
        attrs["cover_image"] = cover_image

        errors = {}

        if display_start_date and display_end_date and display_end_date < display_start_date:
            errors["display_end_date"] = (
                "La date de fin d’affichage doit être postérieure ou égale à la date de début."
            )

        if status_value == "published":
            if not title:
                errors["title"] = "Le titre est obligatoire pour publier un article."
            if not link and not short_text:
                errors["non_field_errors"] = [
                    "Pour publier un article, renseigne au moins un lien externe ou un texte court."
                ]

        if errors:
            raise serializers.ValidationError(errors)

        return attrs
