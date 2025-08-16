from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from users.models import CustomUser


class CustomUserAdmin(UserAdmin):
    fieldsets = (
        (None, {'fields': ('username', 'password')}),
        # ('Personal Info', {'fields': ('first_name', 'last_name', 'email', 'profile_picture')}),
        ('Personal Info', {'fields': ('email', 'profile_picture', 'preferred_platform', 'points', 'favorite_song')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Important dates', {'fields': ('last_login', 'date_joined')}),
    )

    # Remove the 'first_name' and 'last_name' fields from list_display
    list_display = ('username', 'email', 'preferred_platform', 'points', 'is_staff')


admin.site.register(CustomUser, CustomUserAdmin)
