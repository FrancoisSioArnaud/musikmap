from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from users.models import CustomUser, UserProviderConnection


@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    fieldsets = (
        (None, {"fields": ("username", "password")}),
        (
            "Personal info",
            {
                "fields": (
                    "email",
                    "profile_picture",
                    "preferred_platform",
                    "points",
                    "is_guest",
                    "guest_device_token",
                    "client",
                    "client_role",
                    "portal_status",
                )
            },
        ),
        (
            "Permissions",
            {
                "fields": (
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                )
            },
        ),
        ("Important dates", {"fields": ("last_login", "date_joined", "last_seen_at", "converted_at")}),
    )

    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": (
                    "username",
                    "email",
                    "password1",
                    "password2",
                    "is_guest",
                    "guest_device_token",
                    "client",
                    "client_role",
                    "portal_status",
                    "is_staff",
                    "is_superuser",
                    "is_active",
                    "groups",
                    "user_permissions",
                ),
            },
        ),
    )

    list_display = (
        "username",
        "email",
        "is_guest",
        "client",
        "client_role",
        "portal_status",
        "preferred_platform",
        "points",
        "last_seen_at",
        "converted_at",
        "is_staff",
        "is_active",
    )
    list_filter = (
        "is_guest",
        "client_role",
        "portal_status",
        "preferred_platform",
        "is_staff",
        "is_superuser",
        "is_active",
        "groups",
        "client",
    )
    search_fields = (
        "username",
        "email",
        "client__name",
        "guest_device_token",
    )
    autocomplete_fields = ("client",)
    readonly_fields = ("guest_device_token", "last_seen_at", "converted_at")
    ordering = ("username",)


@admin.register(UserProviderConnection)
class UserProviderConnectionAdmin(admin.ModelAdmin):
    list_display = ("user", "provider_code", "is_active", "expires_at", "updated_at")
    list_filter = ("provider_code", "is_active")
    search_fields = ("user__username", "provider_user_id", "provider_code")
    autocomplete_fields = ("user",)
