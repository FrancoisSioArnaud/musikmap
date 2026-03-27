import csv

from django.contrib import admin
from django.http import HttpResponse
from django.db.models import Count
from django.db.models.functions import TruncMonth, TruncWeek, TruncDay
from import_export.admin import ImportExportModelAdmin

from users.models import CustomUser
from .models import (
    Article,
    Box,
    Client,
    Deposit,
    DiscoveredSong,
    Emoji,
    EmojiRight,
    LocationPoint,
    Reaction,
    Song,
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
        "created_at",
        "updated_at",
        "published_at",
    )
    list_filter = ("status", "client", "created_at", "published_at")
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
    readonly_fields = ("created_at", "updated_at", "published_at")
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
    list_display = ("title", "artist", "song_id", "n_deposits", "duration")
    search_fields = ("title", "artist", "song_id")
    ordering = ("title", "artist")


@admin.register(DiscoveredSong)
class DiscoveredSongAdmin(admin.ModelAdmin):
    list_display = ("user", "deposit", "discovered_type", "discovered_at", "context")
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


admin.site.site_header = "Administration de la Boîte à Son"
