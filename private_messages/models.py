from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


class ChatThread(models.Model):
    STATUS_PENDING = "pending"
    STATUS_ACCEPTED = "accepted"
    STATUS_REFUSED = "refused"
    STATUS_EXPIRED = "expired"

    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_ACCEPTED, "Accepted"),
        (STATUS_REFUSED, "Refused"),
        (STATUS_EXPIRED, "Expired"),
    ]

    user_a = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="chat_threads_a")
    user_b = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="chat_threads_b")
    initiator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chat_threads_initiated",
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    refused_at = models.DateTimeField(null=True, blank=True)
    expired_at = models.DateTimeField(null=True, blank=True)
    user_a_last_read_at = models.DateTimeField(null=True, blank=True)
    user_b_last_read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["user_a", "user_b"]),
            models.Index(fields=["status", "updated_at"]),
        ]
        constraints = [
            models.UniqueConstraint(fields=["user_a", "user_b"], name="unique_chat_thread_pair"),
        ]

    @property
    def expires_at(self):
        if self.status != self.STATUS_PENDING:
            return None
        return self.created_at + timedelta(days=30)

    def ensure_not_expired(self):
        if self.status == self.STATUS_PENDING and self.expires_at and self.expires_at <= timezone.now():
            self.status = self.STATUS_EXPIRED
            self.expired_at = timezone.now()
            self.save(update_fields=["status", "expired_at", "updated_at"])
        return self

    def other_user(self, user):
        if user.id == self.user_a_id:
            return self.user_b
        return self.user_a


class ChatMessage(models.Model):
    TYPE_TEXT = "text"
    TYPE_SONG = "song"
    TYPE_SYSTEM = "system"

    MESSAGE_TYPE_CHOICES = [
        (TYPE_TEXT, "Text"),
        (TYPE_SONG, "Song"),
        (TYPE_SYSTEM, "System"),
    ]

    thread = models.ForeignKey(ChatThread, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="chat_messages")
    message_type = models.CharField(max_length=20, choices=MESSAGE_TYPE_CHOICES, db_index=True)
    text = models.TextField(blank=True, default="")
    song = models.ForeignKey(
        "box_management.Song",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="chat_messages",
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["created_at", "id"]
        indexes = [models.Index(fields=["thread", "created_at"])]
