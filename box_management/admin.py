import csv
from django.contrib import admin
from django.db.models import Count
from django.db.models.functions import TruncMonth, TruncWeek, TruncDay, TruncDate
from django.http import HttpResponse
from import_export.admin import ImportExportModelAdmin
from .models import *
from users.models import CustomUser


class BoxAdmin(ImportExportModelAdmin, admin.ModelAdmin):
    """
    Class goal: This class represents a Music Box used in the admin interface to import/export data.
    """
    list_display = ('name', 'description', 'url', 'image_url', 'client_name')

class SongAdmin(ImportExportModelAdmin, admin.ModelAdmin):
    """
    Class goal: This class represents a Music Box used in the admin interface to import/export data.
    """
    list_display = ('id', 'title', 'artist', 'image_url', 'spotify_id', 'deezer_id', 'n_deposits')
 
class LocationPointAdmin(ImportExportModelAdmin, admin.ModelAdmin):
    """
    Class goal: This class represents a Location Point used in the admin interface to import/export data.
    """
    list_display = ('box_id', 'latitude', 'longitude', 'dist_location')


class DepositAdmin(ImportExportModelAdmin, admin.ModelAdmin):
    """
    Class goal: This class represents a Deposit used in the admin interface to import/export data.
    From the admin interface, it is possible to export the deposits by box and month in order to study the statistics
    and create graphs.
    """
    list_display = ('id', 'song', 'box_id', 'deposited_at', 'user', 'note')
    list_filter = ('id', 'song_id', 'box_id', 'deposited_at', 'user', 'note')
    search_fields = ('id', 'song_id__title', 'box_id__name', 'user')
    ordering = ('-deposited_at',)

    def export_deposits_global(self, request, queryset):
        """
        Method goal: Export the deposits by box and month in order to study the statistics and create graphs.
        Args:
            request: empty
            queryset: empty

        Returns:
            response: the response containing the csv file
        """

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="deposits_global.csv"'

        writer = csv.writer(response)
        writer.writerow(['Box', 'Period', 'Number of Deposits'])

        # Export by box and month
        deposits_month = Deposit.objects.values('box_id__name').annotate(period=TruncMonth('deposited_at')).values(
            'box_id__name', 'period').annotate(count=Count('id'))
        for deposit in deposits_month:
            writer.writerow([deposit['box_id__name'], deposit['period'].strftime('%Y-%m'), deposit['count']])

        # Export by box and week
        deposits_week = Deposit.objects.values('box_id__name').annotate(period=TruncWeek('deposited_at')).values(
            'box_id__name', 'period').annotate(count=Count('id'))
        for deposit in deposits_week:
            writer.writerow([deposit['box_id__name'], deposit['period'].strftime('%Y-%W'), deposit['count']])

        # Export by box and day
        deposits_day = Deposit.objects.values('box_id__name').annotate(period=TruncDay('deposited_at')).values(
            'box_id__name', 'period').annotate(count=Count('id'))
        for deposit in deposits_day:
            writer.writerow([deposit['box_id__name'], deposit['period'].strftime('%Y-%m-%d'), deposit['count']])

        return response

    export_deposits_global.short_description = "Export deposits as CSV"

    def export_deposits_distribution(self, request, queryset):
        """
        Method goal: Export the deposits by box, week and day in order to study the statistics and create graphs.
        Args:
            request: empty
            queryset: empty

        Returns:
            response: the response containing the csv file
        """

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="deposits_distribution_by_box.csv"'

        writer = csv.writer(response)
        writer.writerow(['Box', 'Week', 'Day', 'Number of Deposits'])

        # Export by box, week and day
        deposits = Deposit.objects.values('box_id__name').annotate(week=TruncWeek('deposited_at'),
                                                                   day=TruncDay('deposited_at')).values('box_id__name',
                                                                                                        'week',
                                                                                                        'day').annotate(
            count=Count('id'))
        for deposit in deposits:
            writer.writerow(
                [deposit['box_id__name'], deposit['week'].strftime('%Y-%W'), deposit['day'].strftime('%Y-%m-%d'),
                 deposit['count']])

        return response

    export_deposits_distribution.short_description = "Export deposits distribution as CSV"

    def export_active_users_csv(self, request, queryset):
        """
        Method goal: Export the active users by box, month and week in order to study the statistics and create graphs.
        Args:
            request: empty
            queryset: empty

        Returns:
            response: the response containing the csv file
        """
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="active_users.csv"'

        writer = csv.writer(response)
        writer.writerow(['User', 'Box', 'Month', 'Week', 'Number of Deposits'])

        # Export users by box, month and week
        active_users = CustomUser.objects.values('username', 'deposit__box_id__name').annotate(
            month=TruncMonth('deposit__deposited_at'),
            week=TruncWeek('deposit__deposited_at')).values(
            'username', 'deposit__box_id__name', 'month', 'week').annotate(count=Count('deposit__id'))

        # Filter users with deposits
        active_users = active_users.filter(count__gt=0)

        for user in active_users:
            month = user['month'].strftime('%Y-%m') if user['month'] is not None else ''
            week = user['week'].strftime('%Y-%W') if user['week'] is not None else ''
            writer.writerow(
                [user['username'], user['deposit__box_id__name'], month, week, user['count']])

        return response

    export_active_users_csv.short_description = "Export active users as CSV"

    def export_popular_songs_csv(self, request, queryset):
        """
        Method goal: Export the popular songs by box, month, week and day in order to study the statistics and create
        graphs.
        Args:
            request: empty
            queryset: empty

        Returns:
            response: the response containing the csv file
        """
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="popular_songs.csv"'

        writer = csv.writer(response)
        writer.writerow(['Song', 'Box', 'Month', 'Week', 'Day', 'Number of Deposits'])

        # Export popular songs by box, month, week, and day
        popular_songs = Song.objects.values('title', 'deposit__box_id__name').annotate(
            month=TruncMonth('deposit__deposited_at'),
            week=TruncWeek('deposit__deposited_at'),
            day=TruncDay('deposit__deposited_at')).values(
            'title', 'deposit__box_id__name', 'month', 'week', 'day').annotate(count=Count('deposit__id'))

        for song in popular_songs:
            writer.writerow(
                [song['title'], song['deposit__box_id__name'], song['month'].strftime('%Y-%m'),
                 song['week'].strftime('%Y-%W'), song['day'].strftime('%Y-%m-%d'), song['count']])

        return response

    export_popular_songs_csv.short_description = "Export popular songs as CSV"

    # Add custom actions to admin to export data
    actions = ['export_deposits_global', 'export_deposits_distribution', 'export_active_users_csv',
               'export_popular_songs_csv']


# Models accessible in the admin interface
admin.site.site_header = "Administration de la Boîte à Son"
admin.site.register(Box, BoxAdmin)
admin.site.register(Deposit, DepositAdmin)
admin.site.register(Song, SongAdmin)
admin.site.register(LocationPoint, LocationPointAdmin)
admin.site.register(VisibleDeposit)
admin.site.register(DiscoveredSong)

@admin.register(Cardboard)
class CardboardAdmin(admin.ModelAdmin):
    list_display = ('box', 'unique_url')
    search_fields = ('box__name', 'unique_url')
