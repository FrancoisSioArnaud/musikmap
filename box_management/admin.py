import csv

from django import forms
from django.contrib import admin, messages
from django.http import HttpResponse
from django.shortcuts import redirect
from django.template.response import TemplateResponse
from django.urls import path, reverse
from django.utils import timezone
from django.db.models import Count
from django.db.models.functions import TruncMonth, TruncWeek, TruncDay
from import_export.admin import ImportExportModelAdmin

from users.models import CustomUser
from .models import (
    Article,
    Box,
    Client,
    Comment,
    CommentAttemptLog,
    CommentModerationDecision,
    CommentReport,
    CommentUserRestriction,
    Deposit,
    DiscoveredSong,
    Emoji,
    EmojiRight,
    LocationPoint,
    Reaction,
    Song,
    Sticker,
    Link,
)


@admin.register(Client)
class ClientAdmin(ImportExportModelAdmin, admin.ModelAdmin):
    list_display = ("name", "slug", "background_picture", "created_at", "updated_at")
    search_fields = ("name", "slug")
    ordering = ("name",)


@admin.register(Box)
class BoxAdmin(ImportExportModelAdmin, admin.ModelAdmin):
    """
    Class goal: This class represents a Music Box used in the admin interface to import/export data.
    """

    list_display = ("name", "description", "url", "image_url", "client")
    list_filter = ("client",)
    search_fields = ("name", "description", "url", "client__name")
    autocomplete_fields = ("client",)


@admin.register(Article)
class ArticleAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "client",
        "author",
        "status",
        "visibility_state_admin",
        "display_date_window_admin",
        "display_time_window_admin",
        "created_at",
        "updated_at",
        "published_at",
    )
    list_filter = (
        "status",
        "client",
        "created_at",
        "published_at",
        "display_start_date",
        "display_end_date",
    )
    search_fields = (
        "title",
        "short_text",
        "link",
        "client__name",
        "author__username",
        "author__email",
    )
    autocomplete_fields = ("client", "author")
    ordering = ("-created_at",)
    readonly_fields = (
        "created_at",
        "updated_at",
        "published_at",
        "visibility_state_admin",
        "display_window_summary_admin",
    )
    fieldsets = (
        (
            None,
            {
                "fields": (
                    "client",
                    "author",
                    "title",
                    "link",
                    "short_text",
                    "cover_image",
                    "status",
                )
            },
        ),
        (
            "Fenêtre d’affichage",
            {
                "fields": (
                    ("display_start_date", "display_end_date"),
                    ("display_start_time", "display_end_time"),
                    "visibility_state_admin",
                    "display_window_summary_admin",
                )
            },
        ),
        (
            "Dates",
            {
                "fields": (
                    "created_at",
                    "updated_at",
                    "published_at",
                )
            },
        ),
    )

    @admin.display(description="Diffusion")
    def visibility_state_admin(self, obj):
        return obj.get_visibility_state_label(at=timezone.now())

    @admin.display(description="Dates affichage")
    def display_date_window_admin(self, obj):
        return obj.get_display_date_range_label()

    @admin.display(description="Heures affichage")
    def display_time_window_admin(self, obj):
        return obj.get_display_time_range_label()

    @admin.display(description="Résumé fenêtre")
    def display_window_summary_admin(self, obj):
        return obj.get_display_window_summary()


@admin.register(LocationPoint)
class LocationPointAdmin(ImportExportModelAdmin, admin.ModelAdmin):
    """
    Class goal: This class represents a Location Point used in the admin interface to import/export data.
    """

    list_display = ("box", "latitude", "longitude", "dist_location")
    search_fields = ("box__name",)
    autocomplete_fields = ("box",)


@admin.register(Deposit)
class DepositAdmin(ImportExportModelAdmin, admin.ModelAdmin):
    """
    Class goal: This class represents a Deposit used in the admin interface to import/export data.
    From the admin interface, it is possible to export the deposits by box and month in order to study the statistics
    and create graphs.
    """

    list_display = ("id", "public_key", "song", "box", "deposited_at", "user")
    list_filter = ("box", "song", "user")
    search_fields = (
        "id",
        "public_key",
        "song__title",
        "song__artist",
        "box__name",
        "user__username",
        "user__email",
    )
    ordering = ("-deposited_at",)
    readonly_fields = ("public_key",)
    autocomplete_fields = ("song", "box", "user")

    def export_deposits_global(self, request, queryset):
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="deposits_global.csv"'

        writer = csv.writer(response)
        writer.writerow(["Box", "Period", "Number of Deposits"])

        deposits_month = (
            Deposit.objects.values("box__name")
            .annotate(period=TruncMonth("deposited_at"))
            .values("box__name", "period")
            .annotate(count=Count("id"))
        )
        for deposit in deposits_month:
            writer.writerow([deposit["box__name"], deposit["period"].strftime("%Y-%m"), deposit["count"]])

        deposits_week = (
            Deposit.objects.values("box__name")
            .annotate(period=TruncWeek("deposited_at"))
            .values("box__name", "period")
            .annotate(count=Count("id"))
        )
        for deposit in deposits_week:
            writer.writerow([deposit["box__name"], deposit["period"].strftime("%Y-%W"), deposit["count"]])

        deposits_day = (
            Deposit.objects.values("box__name")
            .annotate(period=TruncDay("deposited_at"))
            .values("box__name", "period")
            .annotate(count=Count("id"))
        )
        for deposit in deposits_day:
            writer.writerow([deposit["box__name"], deposit["period"].strftime("%Y-%m-%d"), deposit["count"]])

        return response

    export_deposits_global.short_description = "Export deposits as CSV"

    def export_deposits_distribution(self, request, queryset):
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="deposits_distribution_by_box.csv"'

        writer = csv.writer(response)
        writer.writerow(["Box", "Week", "Day", "Number of Deposits"])

        deposits = (
            Deposit.objects.values("box__name")
            .annotate(
                week=TruncWeek("deposited_at"),
                day=TruncDay("deposited_at"),
            )
            .values("box__name", "week", "day")
            .annotate(count=Count("id"))
        )

        for deposit in deposits:
            writer.writerow(
                [
                    deposit["box__name"],
                    deposit["week"].strftime("%Y-%W"),
                    deposit["day"].strftime("%Y-%m-%d"),
                    deposit["count"],
                ]
            )

        return response

    export_deposits_distribution.short_description = "Export deposits distribution as CSV"

    def export_active_users_csv(self, request, queryset):
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="active_users.csv"'

        writer = csv.writer(response)
        writer.writerow(["User", "Box", "Month", "Week", "Number of Deposits"])

        active_users = (
            CustomUser.objects.values("username", "deposits__box__name")
            .annotate(
                month=TruncMonth("deposits__deposited_at"),
                week=TruncWeek("deposits__deposited_at"),
            )
            .values("username", "deposits__box__name", "month", "week")
            .annotate(count=Count("deposits__id"))
            .filter(count__gt=0)
        )

        for user in active_users:
            month = user["month"].strftime("%Y-%m") if user["month"] is not None else ""
            week = user["week"].strftime("%Y-%W") if user["week"] is not None else ""
            writer.writerow(
                [
                    user["username"],
                    user["deposits__box__name"],
                    month,
                    week,
                    user["count"],
                ]
            )

        return response

    export_active_users_csv.short_description = "Export active users as CSV"

    def export_popular_songs_csv(self, request, queryset):
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="popular_songs.csv"'

        writer = csv.writer(response)
        writer.writerow(["Song", "Box", "Month", "Week", "Day", "Number of Deposits"])

        popular_songs = (
            Song.objects.values("title", "deposits__box__name")
            .annotate(
                month=TruncMonth("deposits__deposited_at"),
                week=TruncWeek("deposits__deposited_at"),
                day=TruncDay("deposits__deposited_at"),
            )
            .values("title", "deposits__box__name", "month", "week", "day")
            .annotate(count=Count("deposits__id"))
        )

        for song in popular_songs:
            writer.writerow(
                [
                    song["title"],
                    song["deposits__box__name"],
                    song["month"].strftime("%Y-%m"),
                    song["week"].strftime("%Y-%W"),
                    song["day"].strftime("%Y-%m-%d"),
                    song["count"],
                ]
            )

        return response

    export_popular_songs_csv.short_description = "Export popular songs as CSV"

    actions = [
        "export_deposits_global",
        "export_deposits_distribution",
        "export_active_users_csv",
        "export_popular_songs_csv",
    ]


@admin.register(Song)
class SongAdmin(admin.ModelAdmin):
    list_display = ("title", "artist", "song_id", "accent_color", "image_url_small", "n_deposits", "duration")
    search_fields = ("title", "artist", "song_id")
    ordering = ("title", "artist")


@admin.register(DiscoveredSong)
class DiscoveredSongAdmin(admin.ModelAdmin):
    list_display = ("user", "deposit", "discovered_type", "discovered_at", "context", "link_sender")
    list_filter = ("discovered_type", "context", "discovered_at")
    search_fields = (
        "user__username",
        "deposit__song__title",
        "deposit__song__artist",
        "deposit__box__name",
    )
    autocomplete_fields = ("user", "deposit")


@admin.register(Emoji)
class EmojiAdmin(admin.ModelAdmin):
    list_display = ("char", "active", "cost")
    list_filter = ("active",)
    search_fields = ("char",)
    ordering = ("cost", "char")


@admin.register(EmojiRight)
class EmojiRightAdmin(admin.ModelAdmin):
    list_display = ("user", "emoji")
    list_filter = ("emoji",)
    search_fields = ("user__username", "user__email", "emoji__char")
    autocomplete_fields = ("user", "emoji")


@admin.register(Reaction)
class ReactionAdmin(admin.ModelAdmin):
    list_display = ("user", "deposit", "emoji", "created_at", "updated_at")
    list_filter = ("emoji", "created_at", "updated_at")
    search_fields = (
        "user__username",
        "user__email",
        "deposit__public_key",
        "deposit__song__title",
        "deposit__song__artist",
        "deposit__box__name",
    )
    autocomplete_fields = ("user", "deposit", "emoji")


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "status",
        "reason_code",
        "client",
        "deposit_public_key",
        "deposit_deleted",
        "deposit_owner_username",
        "user",
        "author_email",
        "reports_count",
        "risk_score",
        "created_at",
    )
    list_filter = (
        "status",
        "reason_code",
        "deposit_deleted",
        "client",
        "created_at",
        "updated_at",
    )
    search_fields = (
        "id",
        "text",
        "normalized_text",
        "reason_code",
        "deposit_public_key",
        "deposit_box_name",
        "deposit_box_url",
        "deposit_owner_username",
        "user__username",
        "user__email",
        "author_username",
        "author_display_name",
        "author_email",
    )
    ordering = ("-created_at", "-id")
    autocomplete_fields = ("client", "deposit", "user")
    readonly_fields = (
        "normalized_text",
        "reports_count",
        "risk_score",
        "risk_flags",
        "deposit_public_key",
        "deposit_box_name",
        "deposit_box_url",
        "deposit_deleted",
        "deposit_owner_user_id",
        "deposit_owner_username",
        "author_username",
        "author_display_name",
        "author_email",
        "author_avatar_url",
        "author_ip",
        "author_user_agent",
        "created_at",
        "updated_at",
    )


@admin.register(CommentReport)
class CommentReportAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "comment",
        "reason_code",
        "reporter",
        "reporter_email",
        "created_at",
    )
    list_filter = ("reason_code", "created_at")
    search_fields = (
        "comment__id",
        "comment__text",
        "comment__deposit_public_key",
        "reporter__username",
        "reporter__email",
        "reporter_username",
        "reporter_email",
        "free_text",
    )
    ordering = ("-created_at", "-id")
    autocomplete_fields = ("comment", "reporter")
    readonly_fields = ("reporter_username", "reporter_email", "created_at")


@admin.register(CommentModerationDecision)
class CommentModerationDecisionAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "comment",
        "decision_code",
        "reason_code",
        "acted_by",
        "created_at",
    )
    list_filter = ("decision_code", "reason_code", "created_at")
    search_fields = (
        "comment__id",
        "comment__text",
        "comment__deposit_public_key",
        "decision_code",
        "reason_code",
        "acted_by__username",
        "acted_by__email",
        "internal_note",
    )
    ordering = ("-created_at", "-id")
    autocomplete_fields = ("comment", "acted_by")
    readonly_fields = ("created_at",)


@admin.register(CommentUserRestriction)
class CommentUserRestrictionAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "restriction_type",
        "client",
        "user",
        "reason_code",
        "starts_at",
        "ends_at",
        "created_by",
        "created_at",
    )
    list_filter = ("restriction_type", "reason_code", "client", "created_at")
    search_fields = (
        "user__username",
        "user__email",
        "client__name",
        "reason_code",
        "internal_note",
        "created_by__username",
        "created_by__email",
    )
    ordering = ("-created_at", "-id")
    autocomplete_fields = ("client", "user", "created_by")
    readonly_fields = ("created_at",)


@admin.register(CommentAttemptLog)
class CommentAttemptLogAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "reason_code",
        "client",
        "deposit_public_key",
        "target_owner_username",
        "user",
        "created_at",
    )
    list_filter = ("reason_code", "client", "created_at")
    search_fields = (
        "deposit_public_key",
        "target_owner_username",
        "user__username",
        "user__email",
        "text",
        "normalized_text",
        "reason_code",
    )
    ordering = ("-created_at", "-id")
    autocomplete_fields = ("client", "deposit", "user")
    readonly_fields = (
        "deposit_public_key",
        "target_owner_user_id",
        "target_owner_username",
        "normalized_text",
        "meta",
        "author_ip",
        "author_user_agent",
        "created_at",
    )




@admin.register(Link)
class LinkAdmin(admin.ModelAdmin):
    list_display = (
        "slug",
        "deposit",
        "created_by",
        "expires_at",
        "deposit_deleted",
        "anonymous_view_count",
        "created_at",
    )
    list_filter = ("deposit_deleted", "created_at", "expires_at")
    search_fields = ("slug", "deposit__public_key", "created_by__username")
    autocomplete_fields = ("deposit", "created_by", "opened_by_users")
    readonly_fields = ("created_at", "updated_at")

class StickerBatchCreateForm(forms.Form):
    client = forms.ModelChoiceField(
        queryset=Client.objects.order_by("name"),
        label="Client",
    )
    quantity = forms.IntegerField(
        label="Nombre de stickers",
        min_value=1,
        max_value=500,
        initial=50,
        help_text="Maximum 500 stickers par lot.",
    )


@admin.register(Sticker)
class StickerAdmin(admin.ModelAdmin):
    change_list_template = "admin/box_management/sticker/change_list.html"
    list_display = (
        "slug",
        "client",
        "box",
        "status",
        "is_active",
        "sticker_path",
        "flowbox_path",
        "qr_generated_at",
        "downloaded_at",
        "assigned_at",
        "created_at",
    )
    list_filter = ("status", "is_active", "client", "created_at")
    search_fields = ("slug", "client__name", "client__slug", "box__name", "box__url")
    ordering = ("-created_at", "-id")
    autocomplete_fields = ("client", "box")
    readonly_fields = (
        "status",
        "sticker_path",
        "flowbox_path",
        "qr_generated_at",
        "downloaded_at",
        "assigned_at",
        "created_at",
        "updated_at",
    )
    fields = (
        "client",
        "slug",
        "box",
        "is_active",
        "status",
        "sticker_path",
        "flowbox_path",
        "qr_generated_at",
        "downloaded_at",
        "assigned_at",
        "created_at",
        "updated_at",
    )

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                "batch-create/",
                self.admin_site.admin_view(self.batch_create_view),
                name="box_management_sticker_batch_create",
            ),
        ]
        return custom_urls + urls

    def changelist_view(self, request, extra_context=None):
        extra_context = extra_context or {}
        extra_context["sticker_batch_create_url"] = reverse("admin:box_management_sticker_batch_create")
        return super().changelist_view(request, extra_context=extra_context)

    def batch_create_view(self, request):
        if request.method == "POST":
            form = StickerBatchCreateForm(request.POST)
            if form.is_valid():
                client = form.cleaned_data["client"]
                quantity = form.cleaned_data["quantity"]
                created_count = 0

                for _ in range(quantity):
                    Sticker.objects.create(client=client)
                    created_count += 1

                messages.success(
                    request,
                    f"{created_count} stickers ont été créés pour {client.name}.",
                )
                return redirect(reverse("admin:box_management_sticker_changelist"))
        else:
            form = StickerBatchCreateForm()

        context = {
            **self.admin_site.each_context(request),
            "opts": self.model._meta,
            "title": "Créer un lot de stickers",
            "form": form,
        }
        return TemplateResponse(
            request,
            "admin/box_management/sticker/batch_create.html",
            context,
        )

    @admin.display(description="URL sticker")
    def sticker_path(self, obj):
        if not obj or not obj.slug:
            return "—"
        return f"/s/{obj.slug}"

    @admin.display(description="URL box")
    def flowbox_path(self, obj):
        box_url = getattr(getattr(obj, "box", None), "url", "")
        if not box_url:
            return "—"
        return f"/flowbox/{box_url}"


admin.site.site_header = "Administration de la Boîte à Son"
