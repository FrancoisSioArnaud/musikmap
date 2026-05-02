from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.db.models import Count

from users.models import CustomUser, UserFollow, UserProviderConnection


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
                    "last_platform",
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
        "last_platform",
        "points",
        "last_seen_at",
        "converted_at",
        "is_staff",
        "is_active",
        "followers_count",
        "following_count",
    )
    list_filter = (
        "is_guest",
        "client_role",
        "portal_status",
        "last_platform",
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

    def get_queryset(self, request):
        queryset = super().get_queryset(request)
        return queryset.annotate(
            _followers_count=Count("follower_relations", distinct=True),
            _following_count=Count("following_relations", distinct=True),
        )

    @admin.display(description="Followers")
    def followers_count(self, obj):
        return getattr(obj, "_followers_count", obj.follower_relations.count())

    @admin.display(description="Following")
    def following_count(self, obj):
        return getattr(obj, "_following_count", obj.following_relations.count())


@admin.register(UserFollow)
class UserFollowAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "follower",
        "following",
        "created_at",
    )
    list_filter = ("created_at",)
    search_fields = (
        "follower__username",
        "following__username",
        "follower__email",
        "following__email",
    )
    autocomplete_fields = (
        "follower",
        "following",
    )
    readonly_fields = ("created_at",)
    ordering = ("-created_at",)


@admin.register(UserProviderConnection)
class UserProviderConnectionAdmin(admin.ModelAdmin):
    list_display = ("user", "provider_code", "is_active", "expires_at", "updated_at")
    list_filter = ("provider_code", "is_active")
    search_fields = ("user__username", "provider_user_id", "provider_code")
    autocomplete_fields = ("user",)
