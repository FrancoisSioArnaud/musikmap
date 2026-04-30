from django.urls import path

from private_messages.views import (
    MessageSettingsView,
    MessageSummaryView,
    MessageThreadByUsernameDetailView,
    MessageThreadDetailView,
    MessageThreadRefuseView,
    MessageThreadReplyView,
    MessageThreadStartView,
    MessageThreadStatusView,
)

urlpatterns = [
    path("summary", MessageSummaryView.as_view(), name="messages-summary"),
    path("thread/<int:thread_id>", MessageThreadDetailView.as_view(), name="messages-thread-detail"),
    path("threads/by-username/<str:username>", MessageThreadByUsernameDetailView.as_view(), name="messages-thread-by-username"),
    path("thread/start", MessageThreadStartView.as_view(), name="messages-thread-start"),
    path("thread/<int:thread_id>/reply", MessageThreadReplyView.as_view(), name="messages-thread-reply"),
    path("thread/<int:thread_id>/refuse", MessageThreadRefuseView.as_view(), name="messages-thread-refuse"),
    path("settings", MessageSettingsView.as_view(), name="messages-settings"),
    path("status/<str:username>", MessageThreadStatusView.as_view(), name="messages-status"),
]
