from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from private_messages.models import ChatThread
from users.models import CustomUser


def song_option():
    return {
        "provider_code": "spotify",
        "provider_track_id": "abc123",
        "title": "Song A",
        "artists": ["Artist A"],
        "image_url": "https://example.com/a.jpg",
        "image_url_small": "https://example.com/a_small.jpg",
    }


class MessagingFlowTests(APITestCase):
    def setUp(self):
        self.sender = CustomUser.objects.create_user(username="alice", password="pass1234")
        self.receiver = CustomUser.objects.create_user(username="bob", password="pass1234")

    def test_start_requires_song(self):
        self.client.force_authenticate(self.sender)
        response = self.client.post(
            reverse("messages-thread-start"), {"target_user_id": self.receiver.id}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pending_then_reply_accepts(self):
        self.client.force_authenticate(self.sender)
        start = self.client.post(
            reverse("messages-thread-start"),
            {"target_user_id": self.receiver.id, "song": song_option(), "text": "hello"},
            format="json",
        )
        self.assertEqual(start.status_code, status.HTTP_201_CREATED)
        thread_id = start.data["thread_id"]

        thread = ChatThread.objects.get(pk=thread_id)
        self.assertEqual(thread.status, ChatThread.STATUS_PENDING)

        self.client.force_authenticate(self.receiver)
        reply = self.client.post(
            reverse("messages-thread-reply", kwargs={"thread_id": thread_id}),
            {"text": "ok"},
            format="json",
        )
        self.assertEqual(reply.status_code, status.HTTP_200_OK)
        thread.refresh_from_db()
        self.assertEqual(thread.status, ChatThread.STATUS_ACCEPTED)

    def test_sender_cannot_reply_when_pending(self):
        self.client.force_authenticate(self.sender)
        start = self.client.post(
            reverse("messages-thread-start"),
            {"target_user_id": self.receiver.id, "song": song_option()},
            format="json",
        )
        thread_id = start.data["thread_id"]
        blocked = self.client.post(
            reverse("messages-thread-reply", kwargs={"thread_id": thread_id}),
            {"text": "again"},
            format="json",
        )
        self.assertEqual(blocked.status_code, status.HTTP_409_CONFLICT)

    def test_settings_toggle_updates_user(self):
        self.client.force_authenticate(self.receiver)
        response = self.client.post(
            reverse("messages-settings"), {"allow_private_message_requests": False}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.receiver.refresh_from_db()
        self.assertFalse(self.receiver.allow_private_message_requests)
