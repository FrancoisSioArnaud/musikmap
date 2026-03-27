from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from users.models import CustomUser


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
        ("Important dates", {"fields": ("last_login", "date_joined")}),
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
        "client",
        "client_role",
        "portal_status",
        "preferred_platform",
        "points",
        "is_staff",
        "is_active",
    )
    list_filter = (
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
    )
    autocomplete_fields = ("client",)
    ordering = ("username",)
