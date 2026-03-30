from rest_framework import serializers
from .models import (
    Article,
    Box,
    Client,
    IncitationPhrase,
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


class ClientAdminIncitationSerializer(serializers.ModelSerializer):
    client_name = serializers.SerializerMethodField()
    client_slug = serializers.SerializerMethodField()
    period_label = serializers.SerializerMethodField()
    overlap_count = serializers.SerializerMethodField()
    has_overlap_warning = serializers.SerializerMethodField()
    is_active_now = serializers.SerializerMethodField()
    is_future = serializers.SerializerMethodField()
    is_past = serializers.SerializerMethodField()

    class Meta:
        model = IncitationPhrase
        fields = [
            "id",
            "client",
            "client_name",
            "client_slug",
            "text",
            "start_date",
            "end_date",
            "period_label",
            "overlap_count",
            "has_overlap_warning",
            "is_active_now",
            "is_future",
            "is_past",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "client",
            "client_name",
            "client_slug",
            "period_label",
            "overlap_count",
            "has_overlap_warning",
            "is_active_now",
            "is_future",
            "is_past",
            "created_at",
            "updated_at",
        ]
        extra_kwargs = {
            "text": {"required": True, "allow_blank": False},
            "start_date": {"required": True},
            "end_date": {"required": True},
        }

    def _today(self):
        return self.context.get("today")

    def _overlap_counts(self):
        return self.context.get("overlap_counts") or {}

    def get_client_name(self, obj):
        return obj.client.name if obj.client else None

    def get_client_slug(self, obj):
        return obj.client.slug if obj.client else None

    def get_period_label(self, obj):
        return obj.get_period_label()

    def get_overlap_count(self, obj):
        overlap_counts = self._overlap_counts()
        if obj.pk in overlap_counts:
            return overlap_counts[obj.pk]
        return obj.get_overlap_count()

    def get_has_overlap_warning(self, obj):
        return self.get_overlap_count(obj) > 0

    def get_is_active_now(self, obj):
        return obj.is_active_on_date(self._today())

    def get_is_future(self, obj):
        return obj.is_future_on_date(self._today())

    def get_is_past(self, obj):
        return obj.is_past_on_date(self._today())

    def validate_text(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("La phrase d’incitation est obligatoire.")
        if len(value) > 100:
            raise serializers.ValidationError(
                "La phrase d’incitation ne peut pas dépasser 100 caractères."
            )
        return value

    def validate(self, attrs):
        instance = getattr(self, "instance", None)

        start_date = attrs.get("start_date")
        if start_date is None and instance is not None:
            start_date = instance.start_date

        end_date = attrs.get("end_date")
        if end_date is None and instance is not None:
            end_date = instance.end_date

        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError({
                "end_date": "La date de fin doit être postérieure ou égale à la date de début."
            })

        return attrs


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
