from django.contrib import admin
from django.db.models import Count, Max

from private_messages.models import ChatMessage, ChatThread


class ChatMessageInline(admin.TabularInline):
    model = ChatMessage
    extra = 0
    can_delete = False
    fields = (
        "id",
        "sender",
        "message_type",
        "text",
        "song",
        "created_at",
    )
    readonly_fields = (
        "id",
        "sender",
        "message_type",
        "text",
        "song",
        "created_at",
    )
    autocomplete_fields = (
        "sender",
        "song",
    )
    ordering = (
        "created_at",
        "id",
    )


@admin.register(ChatThread)
class ChatThreadAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user_a",
        "user_b",
        "initiator",
        "status",
        "messages_count",
        "last_message_at",
        "created_at",
        "updated_at",
        "accepted_at",
        "refused_at",
        "expired_at",
    )
    list_filter = (
        "status",
        "created_at",
        "updated_at",
        "accepted_at",
        "refused_at",
        "expired_at",
    )
    search_fields = (
        "user_a__username",
        "user_b__username",
        "initiator__username",
        "user_a__email",
        "user_b__email",
        "initiator__email",
        "messages__text",
    )
    autocomplete_fields = (
        "user_a",
        "user_b",
        "initiator",
    )
    readonly_fields = (
        "created_at",
        "updated_at",
        "accepted_at",
        "refused_at",
        "expired_at",
        "expires_at",
        "user_a_last_read_at",
        "user_b_last_read_at",
    )
    inlines = (ChatMessageInline,)
    ordering = ("-updated_at",)

    def get_queryset(self, request):
        queryset = super().get_queryset(request)
        return queryset.annotate(
            _messages_count=Count("messages", distinct=True),
            _last_message_at=Max("messages__created_at"),
        )

    @admin.display(description="Messages")
    def messages_count(self, obj):
        return getattr(obj, "_messages_count", obj.messages.count())

    @admin.display(description="Last message")
    def last_message_at(self, obj):
        return getattr(obj, "_last_message_at", None)


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "thread",
        "sender",
        "message_type",
        "short_text",
        "song",
        "created_at",
    )
    list_filter = (
        "message_type",
        "created_at",
    )
    search_fields = (
        "text",
        "sender__username",
        "sender__email",
        "thread__user_a__username",
        "thread__user_b__username",
        "song__title",
        "song__artist",
    )
    autocomplete_fields = (
        "thread",
        "sender",
        "song",
    )
    readonly_fields = ("created_at",)
    ordering = ("-created_at",)

    @admin.display(description="Text")
    def short_text(self, obj):
        if not obj.text:
            return ""
        return obj.text[:80] + ("…" if len(obj.text) > 80 else "")
