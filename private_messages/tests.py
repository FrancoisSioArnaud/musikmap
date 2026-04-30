from django.urls import reverse
from django.utils import timezone
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

    def start_thread(self):
        self.client.force_authenticate(self.sender)
        response = self.client.post(
            reverse("messages-thread-start"),
            {"target_user_id": self.receiver.id, "song": song_option(), "text": "hello"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        return response.data["thread_id"]

    def test_start_requires_song(self):
        self.client.force_authenticate(self.sender)
        response = self.client.post(
            reverse("messages-thread-start"), {"target_user_id": self.receiver.id}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_creation_initializes_read_state(self):
        thread_id = self.start_thread()
        thread = ChatThread.objects.get(pk=thread_id)
        self.assertIsNotNone(thread.user_a_last_read_at if thread.user_a_id == self.sender.id else thread.user_b_last_read_at)
        self.assertIsNone(thread.user_a_last_read_at if thread.user_a_id == self.receiver.id else thread.user_b_last_read_at)

    def test_detail_marks_as_read(self):
        thread_id = self.start_thread()
        self.client.force_authenticate(self.receiver)
        response = self.client.get(reverse("messages-thread-detail", kwargs={"thread_id": thread_id}))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        thread = ChatThread.objects.get(pk=thread_id)
        receiver_last_read = thread.user_a_last_read_at if thread.user_a_id == self.receiver.id else thread.user_b_last_read_at
        self.assertIsNotNone(receiver_last_read)

    def test_summary_has_unread_and_counts(self):
        thread_id = self.start_thread()
        self.client.force_authenticate(self.receiver)
        summary = self.client.get(reverse("messages-summary"))
        self.assertEqual(summary.status_code, status.HTTP_200_OK)
        self.assertEqual(summary.data["pending_invitations_count"], 1)
        self.assertEqual(summary.data["unread_conversations_count"], 0)
        self.assertTrue(summary.data["received_requests"][0]["has_unread"])

        reply = self.client.post(
            reverse("messages-thread-reply", kwargs={"thread_id": thread_id}),
            {"text": "ok"},
            format="json",
        )
        self.assertEqual(reply.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(self.sender)
        sender_summary = self.client.get(reverse("messages-summary"))
        self.assertEqual(sender_summary.status_code, status.HTTP_200_OK)
        self.assertEqual(sender_summary.data["unread_conversations_count"], 1)
        self.assertTrue(sender_summary.data["conversations"][0]["has_unread"])

    def test_pending_then_reply_accepts(self):
        thread_id = self.start_thread()
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
        thread_id = self.start_thread()
        blocked = self.client.post(
            reverse("messages-thread-reply", kwargs={"thread_id": thread_id}),
            {"text": "again"},
            format="json",
        )
        self.assertEqual(blocked.status_code, status.HTTP_409_CONFLICT)

    def test_summary_filters_pending_sent_pending_received_refused_expired(self):
        thread_id = self.start_thread()
        thread = ChatThread.objects.get(pk=thread_id)

        self.client.force_authenticate(self.sender)
        sender_summary = self.client.get(reverse("messages-summary"))
        self.assertEqual(len(sender_summary.data["conversations"]), 1)

        self.client.force_authenticate(self.receiver)
        receiver_summary = self.client.get(reverse("messages-summary"))
        self.assertEqual(len(receiver_summary.data["received_requests"]), 1)

        thread.status = ChatThread.STATUS_REFUSED
        thread.refused_at = timezone.now()
        thread.save(update_fields=["status", "refused_at", "updated_at"])

        self.client.force_authenticate(self.sender)
        sender_after_refused = self.client.get(reverse("messages-summary"))
        self.assertEqual(sender_after_refused.data["conversations"], [])

        thread.status = ChatThread.STATUS_EXPIRED
        thread.expired_at = timezone.now()
        thread.save(update_fields=["status", "expired_at", "updated_at"])
        sender_after_expired = self.client.get(reverse("messages-summary"))
        self.assertEqual(sender_after_expired.data["conversations"], [])


    def test_status_lookup_by_username_is_case_insensitive(self):
        self.client.force_authenticate(self.sender)
        response = self.client.get(reverse("messages-status", kwargs={"username": "BOB"}))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["target_user"]["username"], "bob")

    def test_settings_toggle_updates_user(self):
        self.client.force_authenticate(self.receiver)
        response = self.client.post(
            reverse("messages-settings"), {"allow_private_message_requests": False}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.receiver.refresh_from_db()
        self.assertFalse(self.receiver.allow_private_message_requests)
