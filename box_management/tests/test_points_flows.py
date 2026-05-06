from __future__ import annotations

from datetime import timedelta
from unittest.mock import patch

from django.urls import reverse
from django.utils import timezone

from box_management.models import BoxSession, Deposit, DiscoveredSong, EmojiRight, Reaction
from box_management.tests.base import FlowboxAPITestCase
from la_boite_a_son.economy import (
    COST_REVEAL_BOX,
    NB_POINTS_ADD_SONG,
    NB_POINTS_CONSECUTIVE_DAYS_BOX,
    NB_POINTS_FIRST_DEPOSIT_USER_ON_BOX,
    NB_POINTS_FIRST_SONG_DEPOSIT_BOX,
    NB_POINTS_FIRST_SONG_DEPOSIT_GLOBAL,
)


class RevealFlowTests(FlowboxAPITestCase):
    def test_reveal_song_success_debits_points_once(self):
        user = self.auth(self.make_user(username="alice", points=COST_REVEAL_BOX))
        box = self.make_box(url="box-reveal", name="Box reveal")
        song = self.make_song(public_key="song_reveal_1")
        deposit = self.make_deposit(user=self.make_user(username="owner"), song=song, box=box)

        response = self.client.post(
            reverse("reveal-song"), {"dep_public_key": deposit.public_key, "context": "box"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        self.assertEqual(user.points, 0)
        self.assertEqual(response.data["points_balance"], 0)
        self.assertTrue(DiscoveredSong.objects.filter(user=user, deposit=deposit).exists())

    def test_reveal_song_without_enough_points_is_rejected(self):
        user = self.auth(self.make_user(username="bob", points=COST_REVEAL_BOX - 1))
        box = self.make_box(url="box-reveal-2", name="Box reveal 2")
        song = self.make_song(public_key="song_reveal_2")
        deposit = self.make_deposit(user=self.make_user(username="owner2"), song=song, box=box)

        response = self.client.post(
            reverse("reveal-song"), {"dep_public_key": deposit.public_key, "context": "box"}, format="json"
        )
        self.assert_api_error(response, 403, "INSUFFICIENT_POINTS")
        user.refresh_from_db()
        self.assertEqual(user.points, COST_REVEAL_BOX - 1)
        self.assertFalse(DiscoveredSong.objects.filter(user=user, deposit=deposit).exists())

    def test_second_reveal_does_not_redebit(self):
        user = self.auth(self.make_user(username="carol", points=COST_REVEAL_BOX))
        box = self.make_box(url="box-reveal-3", name="Box reveal 3")
        song = self.make_song(public_key="song_reveal_3")
        deposit = self.make_deposit(user=self.make_user(username="owner3"), song=song, box=box)

        first = self.client.post(
            reverse("reveal-song"), {"dep_public_key": deposit.public_key, "context": "box"}, format="json"
        )
        second = self.client.post(
            reverse("reveal-song"), {"dep_public_key": deposit.public_key, "context": "box"}, format="json"
        )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        user.refresh_from_db()
        self.assertEqual(user.points, 0)
        self.assertEqual(DiscoveredSong.objects.filter(user=user, deposit=deposit).count(), 1)

    def test_reveal_requires_authentication(self):
        box = self.make_box(url="box-reveal-4", name="Box reveal 4")
        song = self.make_song(public_key="song_reveal_4")
        deposit = self.make_deposit(user=self.make_user(username="owner4"), song=song, box=box)

        response = self.client.post(
            reverse("reveal-song"), {"dep_public_key": deposit.public_key, "context": "box"}, format="json"
        )
        self.assert_api_error(response, 401, "AUTH_REQUIRED")

    def test_reveal_on_missing_deposit_is_rejected(self):
        user = self.auth(self.make_user(username="dan", points=COST_REVEAL_BOX))
        response = self.client.post(
            reverse("reveal-song"), {"dep_public_key": "missing", "context": "box"}, format="json"
        )
        self.assert_api_error(response, 404, "DEPOSIT_NOT_FOUND")
        user.refresh_from_db()
        self.assertEqual(user.points, COST_REVEAL_BOX)

    def test_reveal_invalid_context_is_rejected(self):
        self.auth(self.make_user(username="eve", points=COST_REVEAL_BOX))
        box = self.make_box(url="box-reveal-5", name="Box reveal 5")
        song = self.make_song(public_key="song_reveal_5")
        deposit = self.make_deposit(user=self.make_user(username="owner5"), song=song, box=box)

        response = self.client.post(
            reverse("reveal-song"), {"dep_public_key": deposit.public_key, "context": "weird"}, format="json"
        )
        self.assert_api_error(response, 400, "INVALID_DISCOVERY_CONTEXT")


class PinnedSongFlowTests(FlowboxAPITestCase):
    def test_pin_success_with_valid_duration_and_enough_points(self):
        user = self.auth(self.make_user(username="pinuser", points=1000))
        client = self.make_client(name="Client pin", slug="client-pin")
        box = self.make_box(url="box-pin", name="Box pin", client=client)
        option = self.track_option(track_id="pin-track-1", title="Pin track 1")

        response = self.client.post(
            reverse("pinned-song"),
            {
                "boxSlug": box.url,
                "duration_minutes": 10,
                "option": option,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertIsNotNone(response.data["active_pinned_deposit"])
        self.assertEqual(response.data["active_pinned_deposit"]["deposit_type"], "pinned")
        user.refresh_from_db()
        self.assertEqual(response.data["points_balance"], user.points)
        self.assertEqual(Deposit.objects.filter(box=box, deposit_type="pinned").count(), 1)

    def test_pin_conflict_if_active_pin_exists(self):
        self.auth(self.make_user(username="pinuser2", points=1000))
        client = self.make_client(name="Client pin 2", slug="client-pin-2")
        box = self.make_box(url="box-pin-2", name="Box pin 2", client=client)
        active_song = self.make_song(public_key="active_pinned_song")
        self.make_deposit(
            user=self.make_user(username="ownerpin"),
            song=active_song,
            box=box,
            deposit_type=Deposit.DEPOSIT_TYPE_PINNED,
            pin_duration_minutes=10,
            pin_points_spent=149,
            pin_expires_at=timezone.now() + timedelta(minutes=10),
        )

        response = self.client.post(
            reverse("pinned-song"),
            {
                "boxSlug": box.url,
                "duration_minutes": 10,
                "option": self.track_option(track_id="pin-track-2", title="Pin track 2"),
            },
            format="json",
        )

        self.assert_api_error(response, 409, "PIN_SLOT_OCCUPIED")
        self.assertEqual(Deposit.objects.filter(box=box, deposit_type="pinned").count(), 1)

    def test_pin_without_enough_points_is_rejected(self):
        user = self.auth(self.make_user(username="pinuser3", points=10))
        client = self.make_client(name="Client pin 3", slug="client-pin-3")
        box = self.make_box(url="box-pin-3", name="Box pin 3", client=client)

        response = self.client.post(
            reverse("pinned-song"),
            {
                "boxSlug": box.url,
                "duration_minutes": 10,
                "option": self.track_option(track_id="pin-track-3", title="Pin track 3"),
            },
            format="json",
        )

        self.assert_api_error(response, 403, "INSUFFICIENT_POINTS")
        user.refresh_from_db()
        self.assertEqual(user.points, 10)
        self.assertEqual(Deposit.objects.filter(box=box, deposit_type="pinned").count(), 0)

    def test_pin_guest_is_rejected(self):
        guest = self.auth(self.make_user(username="guestpin", points=1000, is_guest=True))
        client = self.make_client(name="Client pin 4", slug="client-pin-4")
        box = self.make_box(url="box-pin-4", name="Box pin 4", client=client)

        response = self.client.post(
            reverse("pinned-song"),
            {
                "boxSlug": box.url,
                "duration_minutes": 10,
                "option": self.track_option(track_id="pin-track-4", title="Pin track 4"),
            },
            format="json",
        )
        self.assert_api_error(response, 403, "ACCOUNT_COMPLETION_REQUIRED")
        guest.refresh_from_db()
        self.assertEqual(guest.points, 1000)

    def test_pin_invalid_duration_is_rejected(self):
        self.auth(self.make_user(username="pinuser5", points=1000))
        client = self.make_client(name="Client pin 5", slug="client-pin-5")
        box = self.make_box(url="box-pin-5", name="Box pin 5", client=client)

        response = self.client.post(
            reverse("pinned-song"),
            {
                "boxSlug": box.url,
                "duration_minutes": "invalid",
                "option": self.track_option(track_id="pin-track-5", title="Pin track 5"),
            },
            format="json",
        )
        self.assert_api_error(response, 400, "PIN_DURATION_INVALID")

    def test_pin_unavailable_duration_is_rejected(self):
        self.auth(self.make_user(username="pinuser6", points=1000))
        client = self.make_client(name="Client pin 6", slug="client-pin-6")
        box = self.make_box(url="box-pin-6", name="Box pin 6", client=client)

        response = self.client.post(
            reverse("pinned-song"),
            {
                "boxSlug": box.url,
                "duration_minutes": 11,
                "option": self.track_option(track_id="pin-track-6", title="Pin track 6"),
            },
            format="json",
        )
        self.assert_api_error(response, 400, "PIN_DURATION_UNAVAILABLE")

    def test_pin_creation_is_atomic_when_creation_fails(self):
        user = self.auth(self.make_user(username="pinuser7", points=1000))
        client = self.make_client(name="Client pin 7", slug="client-pin-7")
        box = self.make_box(url="box-pin-7", name="Box pin 7", client=client)

        with patch(
            "box_management.services.pinned.create_pinned_deposit.create_song_deposit", side_effect=Exception("boom")
        ):
            response = self.client.post(
                reverse("pinned-song"),
                {
                    "boxSlug": box.url,
                    "duration_minutes": 10,
                    "option": self.track_option(track_id="pin-track-7", title="Pin track 7"),
                },
                format="json",
            )

        self.assert_api_error(response, 500, "PIN_CREATION_FAILED")
        user.refresh_from_db()
        self.assertEqual(user.points, 1000)
        self.assertEqual(Deposit.objects.filter(box=box, deposit_type="pinned").count(), 0)


class EmojiPurchaseAndReactionFlowTests(FlowboxAPITestCase):
    def test_purchase_free_emoji_creates_right_without_debit(self):
        user = self.auth(self.make_user(username="emoji1", points=100))
        emoji = self.make_emoji(char="😎", cost=0)

        response = self.client.post(reverse("emoji-purchase"), {"emoji_id": emoji.id}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(EmojiRight.objects.filter(user=user, emoji=emoji).exists())
        user.refresh_from_db()
        self.assertEqual(user.points, 100)

    def test_purchase_paid_emoji_debits_points(self):
        user = self.auth(self.make_user(username="emoji2", points=500))
        emoji = self.make_emoji(char="🤯", cost=300)

        response = self.client.post(reverse("emoji-purchase"), {"emoji_id": emoji.id}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(EmojiRight.objects.filter(user=user, emoji=emoji).exists())
        user.refresh_from_db()
        self.assertEqual(user.points, 200)
        self.assertEqual(response.data["points_balance"], 200)

    def test_purchase_paid_emoji_without_enough_points_is_rejected(self):
        user = self.auth(self.make_user(username="emoji3", points=200))
        emoji = self.make_emoji(char="🤘", cost=300)

        response = self.client.post(reverse("emoji-purchase"), {"emoji_id": emoji.id}, format="json")
        self.assert_api_error(response, 403, "INSUFFICIENT_POINTS")
        user.refresh_from_db()
        self.assertEqual(user.points, 200)
        self.assertFalse(EmojiRight.objects.filter(user=user, emoji=emoji).exists())

    def test_purchase_paid_emoji_rejected_for_guest(self):
        guest = self.auth(self.make_user(username="emoji4", points=500, is_guest=True))
        emoji = self.make_emoji(char="🙌", cost=300)

        response = self.client.post(reverse("emoji-purchase"), {"emoji_id": emoji.id}, format="json")
        self.assert_api_error(response, 403, "ACCOUNT_COMPLETION_REQUIRED")
        guest.refresh_from_db()
        self.assertEqual(guest.points, 500)
        self.assertFalse(EmojiRight.objects.filter(user=guest, emoji=emoji).exists())

    def test_purchase_same_emoji_twice_does_not_double_debit(self):
        user = self.auth(self.make_user(username="emoji5", points=500))
        emoji = self.make_emoji(char="✨", cost=300)

        first = self.client.post(reverse("emoji-purchase"), {"emoji_id": emoji.id}, format="json")
        second = self.client.post(reverse("emoji-purchase"), {"emoji_id": emoji.id}, format="json")

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        user.refresh_from_db()
        self.assertEqual(user.points, 200)
        self.assertEqual(EmojiRight.objects.filter(user=user, emoji=emoji).count(), 1)

    def test_reaction_success_with_unlocked_emoji(self):
        user = self.auth(self.make_user(username="react1", points=500))
        emoji = self.make_emoji(char="🔥", cost=0)
        box = self.make_box(url="box-react-1", name="Box react 1")
        deposit = self.make_deposit(user=user, song=self.make_song(public_key="react_song_1"), box=box)

        response = self.client.post(
            reverse("reactions"), {"dep_public_key": deposit.public_key, "emoji_id": emoji.id}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Reaction.objects.filter(user=user, deposit=deposit).count(), 1)
        self.assertEqual(Reaction.objects.get(user=user, deposit=deposit).emoji_id, emoji.id)

    def test_reaction_change_replaces_previous_one(self):
        user = self.auth(self.make_user(username="react2", points=500))
        emoji_a = self.make_emoji(char="🔥", cost=0)
        emoji_b = self.make_emoji(char="😎", cost=0)
        box = self.make_box(url="box-react-2", name="Box react 2")
        deposit = self.make_deposit(user=user, song=self.make_song(public_key="react_song_2"), box=box)

        self.client.post(
            reverse("reactions"), {"dep_public_key": deposit.public_key, "emoji_id": emoji_a.id}, format="json"
        )
        response = self.client.post(
            reverse("reactions"), {"dep_public_key": deposit.public_key, "emoji_id": emoji_b.id}, format="json"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(Reaction.objects.filter(user=user, deposit=deposit).count(), 1)
        self.assertEqual(Reaction.objects.get(user=user, deposit=deposit).emoji_id, emoji_b.id)

    def test_reaction_delete_is_idempotent(self):
        user = self.auth(self.make_user(username="react3", points=500))
        emoji = self.make_emoji(char="🔥", cost=0)
        box = self.make_box(url="box-react-3", name="Box react 3")
        deposit = self.make_deposit(user=user, song=self.make_song(public_key="react_song_3"), box=box)
        Reaction.objects.create(user=user, deposit=deposit, emoji=emoji)

        first = self.client.post(
            reverse("reactions"), {"dep_public_key": deposit.public_key, "emoji_id": None}, format="json"
        )
        second = self.client.post(
            reverse("reactions"), {"dep_public_key": deposit.public_key, "emoji_id": None}, format="json"
        )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(Reaction.objects.filter(user=user, deposit=deposit).count(), 0)

    def test_reaction_requires_revealed_deposit(self):
        viewer = self.auth(self.make_user(username="react4", points=500))
        owner = self.make_user(username="owner-react4")
        emoji = self.make_emoji(char="🔥", cost=0)
        box = self.make_box(url="box-react-4", name="Box react 4")
        deposit = self.make_deposit(user=owner, song=self.make_song(public_key="react_song_4"), box=box)

        response = self.client.post(
            reverse("reactions"), {"dep_public_key": deposit.public_key, "emoji_id": emoji.id}, format="json"
        )
        self.assert_api_error(response, 403, "DEPOSIT_NOT_REVEALED")
        self.assertEqual(Reaction.objects.filter(user=viewer, deposit=deposit).count(), 0)

    def test_reaction_paid_emoji_requires_unlock(self):
        user = self.auth(self.make_user(username="react5", points=500))
        emoji = self.make_emoji(char="🤯", cost=300)
        box = self.make_box(url="box-react-5", name="Box react 5")
        deposit = self.make_deposit(user=user, song=self.make_song(public_key="react_song_5"), box=box)

        response = self.client.post(
            reverse("reactions"), {"dep_public_key": deposit.public_key, "emoji_id": emoji.id}, format="json"
        )
        self.assert_api_error(response, 403, "EMOJI_NOT_UNLOCKED")
        self.assertEqual(Reaction.objects.filter(user=user, deposit=deposit).count(), 0)

    def test_catalog_current_reaction_returns_user_reaction(self):
        user = self.auth(self.make_user(username="react6", points=500))
        emoji = self.make_emoji(char="🔥", cost=0)
        box = self.make_box(url="box-react-6", name="Box react 6")
        deposit = self.make_deposit(user=user, song=self.make_song(public_key="react_song_6"), box=box)
        Reaction.objects.create(user=user, deposit=deposit, emoji=emoji)

        response = self.client.get(reverse("emoji-catalog"), {"dep_public_key": deposit.public_key})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["current_reaction"]["id"], emoji.id)

    def test_reaction_on_box_deposit_without_active_box_session_is_allowed(self):
        user = self.auth(self.make_user(username="react-no-session", points=500))
        emoji = self.make_emoji(char="🔥", cost=0)
        box = self.make_box(url="box-react-no-session", name="Box react no session")
        deposit = self.make_deposit(user=user, song=self.make_song(public_key="react_song_no_session"), box=box)
        BoxSession.objects.filter(user=user, box=box).delete()

        response = self.client.post(
            reverse("reactions"), {"dep_public_key": deposit.public_key, "emoji_id": emoji.id}, format="json"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(Reaction.objects.filter(user=user, deposit=deposit, emoji=emoji).count(), 1)

    def test_reaction_on_pinned_deposit_without_active_box_session_is_allowed(self):
        user = self.auth(self.make_user(username="react-pinned-no-session", points=500))
        emoji = self.make_emoji(char="🔥", cost=0)
        box = self.make_box(url="box-react-pinned-no-session", name="Box react pinned no session")
        pinned = self.make_deposit(
            user=self.make_user(username="owner-react-pinned"),
            song=self.make_song(public_key="react_song_pinned_no_session"),
            box=box,
            deposit_type=Deposit.DEPOSIT_TYPE_PINNED,
            pin_duration_minutes=10,
            pin_points_spent=149,
            pin_expires_at=timezone.now() + timedelta(minutes=10),
        )
        BoxSession.objects.filter(user=user, box=box).delete()

        response = self.client.post(
            reverse("reactions"), {"dep_public_key": pinned.public_key, "emoji_id": emoji.id}, format="json"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(Reaction.objects.filter(user=user, deposit=pinned, emoji=emoji).count(), 1)


class BoxContentFlowTests(FlowboxAPITestCase):
    def test_box_content_without_active_session_returns_session_required(self):
        user = self.auth(self.make_user(username="content-no-session"))
        box = self.make_box(url="box-content-no-session", name="Box content no session")
        BoxSession.objects.filter(user=user, box=box).delete()

        response = self.client.get(reverse("box-content"), {"boxSlug": box.url})

        self.assert_api_error(response, 403, "BOX_SESSION_REQUIRED")

    def test_box_content_with_active_session_returns_main_older_and_excludes_later_deposits(self):
        user = self.auth(self.make_user(username="content-active"))
        box = self.make_box(url="box-content-active", name="Box content active")
        session = BoxSession.objects.get(user=user, box=box)
        session.started_at = timezone.now()
        session.expires_at = session.started_at + timedelta(minutes=20)
        session.save(update_fields=["started_at", "expires_at"])
        main = self.make_deposit(
            user=self.make_user(username="content-active-owner"),
            song=self.make_song(public_key="content-active-main"),
            box=box,
            deposited_at=session.started_at - timedelta(minutes=1),
        )
        older = self.make_deposit(
            user=self.make_user(username="content-active-older"),
            song=self.make_song(public_key="content-active-older"),
            box=box,
            deposited_at=session.started_at - timedelta(minutes=2),
        )
        later = self.make_deposit(
            user=self.make_user(username="content-active-later"),
            song=self.make_song(public_key="content-active-later"),
            box=box,
            deposited_at=session.started_at + timedelta(seconds=1),
        )
        pinned = self.make_deposit(
            user=self.make_user(username="content-active-pin-owner"),
            song=self.make_song(public_key="content-active-pin"),
            box=box,
            deposit_type=Deposit.DEPOSIT_TYPE_PINNED,
            pin_duration_minutes=10,
            pin_points_spent=149,
            pin_expires_at=timezone.now() + timedelta(minutes=10),
        )

        response = self.client.get(reverse("box-content"), {"boxSlug": box.url})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["boxSlug"], box.url)
        self.assertEqual(response.data["main"]["public_key"], main.public_key)
        self.assertEqual(response.data["main"]["song"]["public_key"], main.song.public_key)
        self.assertEqual(len(response.data["older_deposits"]), 1)
        self.assertEqual(response.data["older_deposits"][0]["public_key"], older.public_key)
        returned_keys = [response.data["main"]["public_key"]] + [
            deposit["public_key"] for deposit in response.data["older_deposits"]
        ]
        self.assertNotIn(later.public_key, returned_keys)
        self.assertEqual(response.data["active_pinned_deposit"]["public_key"], pinned.public_key)
        self.assertIsNone(response.data["my_deposit"])

    def test_box_content_returns_empty_payload_when_no_deposit_before_session(self):
        user = self.auth(self.make_user(username="content-empty"))
        box = self.make_box(url="box-content-empty", name="Box content empty")
        session = BoxSession.objects.get(user=user, box=box)
        session.started_at = timezone.now()
        session.expires_at = session.started_at + timedelta(minutes=20)
        session.save(update_fields=["started_at", "expires_at"])
        self.make_deposit(
            user=self.make_user(username="content-empty-later"),
            song=self.make_song(public_key="content-empty-later"),
            box=box,
            deposited_at=session.started_at + timedelta(seconds=1),
        )

        response = self.client.get(reverse("box-content"), {"boxSlug": box.url})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["boxSlug"], box.url)
        self.assertIsNone(response.data["main"])
        self.assertEqual(response.data["older_deposits"], [])
        self.assertIsNone(response.data["active_pinned_deposit"])
        self.assertIsNone(response.data["my_deposit"])
        self.assertEqual(DiscoveredSong.objects.filter(user=user).count(), 0)

    def test_box_content_main_is_stable_from_session_started_at(self):
        user = self.auth(self.make_user(username="content-stable"))
        box = self.make_box(url="box-content-stable", name="Box content stable")
        session = BoxSession.objects.get(user=user, box=box)
        session.started_at = timezone.now()
        session.expires_at = session.started_at + timedelta(minutes=20)
        session.save(update_fields=["started_at", "expires_at"])
        old = self.make_deposit(
            user=self.make_user(username="content-stable-old"),
            song=self.make_song(public_key="content-stable-old"),
            box=box,
            deposited_at=session.started_at - timedelta(minutes=2),
        )
        main = self.make_deposit(
            user=self.make_user(username="content-stable-main"),
            song=self.make_song(public_key="content-stable-main"),
            box=box,
            deposited_at=session.started_at,
        )
        later = self.make_deposit(
            user=self.make_user(username="content-stable-later"),
            song=self.make_song(public_key="content-stable-later"),
            box=box,
            deposited_at=session.started_at + timedelta(seconds=1),
        )

        first = self.client.get(reverse("box-content"), {"boxSlug": box.url})
        second = self.client.get(reverse("box-content"), {"boxSlug": box.url})

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.data["main"]["public_key"], main.public_key)
        self.assertEqual(second.data["main"]["public_key"], main.public_key)
        self.assertEqual(len(first.data["older_deposits"]), 1)
        self.assertEqual(first.data["older_deposits"][0]["public_key"], old.public_key)
        returned_keys = [first.data["main"]["public_key"]] + [
            deposit["public_key"] for deposit in first.data["older_deposits"]
        ]
        self.assertNotIn(later.public_key, returned_keys)
        self.assertEqual(DiscoveredSong.objects.filter(user=user, deposit=main).count(), 1)
        self.assertEqual(DiscoveredSong.objects.filter(user=user).count(), 1)

    def test_box_content_refresh_creates_single_discovered_song_for_main_only(self):
        user = self.auth(self.make_user(username="content-discovery"))
        box = self.make_box(url="box-content-discovery", name="Box content discovery")
        session = BoxSession.objects.get(user=user, box=box)
        session.started_at = timezone.now()
        session.expires_at = session.started_at + timedelta(minutes=20)
        session.save(update_fields=["started_at", "expires_at"])
        main = self.make_deposit(
            user=self.make_user(username="content-discovery-main"),
            song=self.make_song(public_key="content-discovery-main"),
            box=box,
            deposited_at=session.started_at - timedelta(minutes=1),
        )
        older = self.make_deposit(
            user=self.make_user(username="content-discovery-older"),
            song=self.make_song(public_key="content-discovery-older"),
            box=box,
            deposited_at=session.started_at - timedelta(minutes=2),
        )

        self.client.get(reverse("box-content"), {"boxSlug": box.url})
        self.client.get(reverse("box-content"), {"boxSlug": box.url})

        self.assertEqual(DiscoveredSong.objects.filter(user=user, deposit=main).count(), 1)
        self.assertEqual(DiscoveredSong.objects.filter(user=user, deposit=older).count(), 0)
        self.assertEqual(DiscoveredSong.objects.filter(user=user).count(), 1)

    def test_box_content_returns_my_deposit_from_session_deposit(self):
        user = self.auth(self.make_user(username="content-my-deposit"))
        box = self.make_box(url="box-content-my-deposit", name="Box content my deposit")
        session = BoxSession.objects.get(user=user, box=box)
        session.started_at = timezone.now()
        session.expires_at = session.started_at + timedelta(minutes=20)
        my_deposit = self.make_deposit(
            user=user,
            song=self.make_song(public_key="content-my-deposit-song"),
            box=box,
            deposited_at=session.started_at + timedelta(minutes=1),
        )
        session.deposit = my_deposit
        session.save(update_fields=["started_at", "expires_at", "deposit"])

        response = self.client.get(reverse("box-content"), {"boxSlug": box.url})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["my_deposit"]["public_key"], my_deposit.public_key)
        self.assertEqual(response.data["my_deposit"]["song"]["public_key"], my_deposit.song.public_key)


    def test_box_content_limits_older_deposits_to_25_with_next_cursor(self):
        user = self.auth(self.make_user(username="content-page-limit"))
        box = self.make_box(url="box-content-page-limit", name="Box content page limit")
        session = BoxSession.objects.get(user=user, box=box)
        session.started_at = timezone.now()
        session.expires_at = session.started_at + timedelta(minutes=20)
        session.save(update_fields=["started_at", "expires_at"])
        self.make_deposit(
            user=self.make_user(username="content-page-limit-main"),
            song=self.make_song(public_key="content-page-limit-main"),
            box=box,
            deposited_at=session.started_at,
        )
        for index in range(30):
            self.make_deposit(
                user=self.make_user(username=f"content-page-limit-owner-{index}"),
                song=self.make_song(public_key=f"content-page-limit-song-{index}"),
                box=box,
                deposited_at=session.started_at - timedelta(seconds=index + 1),
            )

        response = self.client.get(reverse("box-content"), {"boxSlug": box.url})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["older_deposits"]), 25)
        self.assertTrue(response.data["older_deposits_has_more"])
        self.assertIsNotNone(response.data["older_deposits_next_cursor"])

    def test_box_content_without_more_older_deposits_returns_null_cursor(self):
        user = self.auth(self.make_user(username="content-page-no-more"))
        box = self.make_box(url="box-content-page-no-more", name="Box content page no more")
        session = BoxSession.objects.get(user=user, box=box)
        session.started_at = timezone.now()
        session.expires_at = session.started_at + timedelta(minutes=20)
        session.save(update_fields=["started_at", "expires_at"])
        self.make_deposit(
            user=self.make_user(username="content-page-no-more-main"),
            song=self.make_song(public_key="content-page-no-more-main"),
            box=box,
            deposited_at=session.started_at,
        )
        for index in range(3):
            self.make_deposit(
                user=self.make_user(username=f"content-page-no-more-owner-{index}"),
                song=self.make_song(public_key=f"content-page-no-more-song-{index}"),
                box=box,
                deposited_at=session.started_at - timedelta(seconds=index + 1),
            )

        response = self.client.get(reverse("box-content"), {"boxSlug": box.url})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["older_deposits"]), 3)
        self.assertFalse(response.data["older_deposits_has_more"])
        self.assertIsNone(response.data["older_deposits_next_cursor"])

    def test_box_older_deposits_returns_next_page_without_duplicates(self):
        user = self.auth(self.make_user(username="older-page-next"))
        box = self.make_box(url="older-page-next", name="Older page next")
        session = BoxSession.objects.get(user=user, box=box)
        session.started_at = timezone.now()
        session.expires_at = session.started_at + timedelta(minutes=20)
        session.save(update_fields=["started_at", "expires_at"])
        self.make_deposit(
            user=self.make_user(username="older-page-main"),
            song=self.make_song(public_key="older-page-main"),
            box=box,
            deposited_at=session.started_at,
        )
        for index in range(30):
            self.make_deposit(
                user=self.make_user(username=f"older-page-owner-{index}"),
                song=self.make_song(public_key=f"older-page-song-{index}"),
                box=box,
                deposited_at=session.started_at - timedelta(seconds=index + 1),
            )
        first = self.client.get(reverse("box-content"), {"boxSlug": box.url})
        first_keys = {deposit["public_key"] for deposit in first.data["older_deposits"]}

        response = self.client.get(
            reverse("box-older-deposits"),
            {"boxSlug": box.url, "limit": 25, "cursor": first.data["older_deposits_next_cursor"]},
        )

        self.assertEqual(response.status_code, 200)
        next_keys = [deposit["public_key"] for deposit in response.data["older_deposits"]]
        self.assertEqual(len(next_keys), 5)
        self.assertTrue(first_keys.isdisjoint(next_keys))
        self.assertFalse(response.data["has_more"])
        self.assertIsNone(response.data["next_cursor"])

    def test_box_older_deposits_respects_session_started_at_stability(self):
        user = self.auth(self.make_user(username="older-page-stable"))
        box = self.make_box(url="older-page-stable", name="Older page stable")
        session = BoxSession.objects.get(user=user, box=box)
        session.started_at = timezone.now()
        session.expires_at = session.started_at + timedelta(minutes=20)
        session.save(update_fields=["started_at", "expires_at"])
        self.make_deposit(
            user=self.make_user(username="older-page-stable-main"),
            song=self.make_song(public_key="older-page-stable-main"),
            box=box,
            deposited_at=session.started_at,
        )
        for index in range(30):
            self.make_deposit(
                user=self.make_user(username=f"older-page-stable-owner-{index}"),
                song=self.make_song(public_key=f"older-page-stable-song-{index}"),
                box=box,
                deposited_at=session.started_at - timedelta(seconds=index + 1),
            )
        later = self.make_deposit(
            user=self.make_user(username="older-page-stable-later"),
            song=self.make_song(public_key="older-page-stable-later"),
            box=box,
            deposited_at=session.started_at + timedelta(seconds=1),
        )

        first = self.client.get(reverse("box-content"), {"boxSlug": box.url})
        response = self.client.get(
            reverse("box-older-deposits"),
            {"boxSlug": box.url, "limit": 25, "cursor": first.data["older_deposits_next_cursor"]},
        )

        returned_keys = [first.data["main"]["public_key"]]
        returned_keys += [deposit["public_key"] for deposit in first.data["older_deposits"]]
        returned_keys += [deposit["public_key"] for deposit in response.data["older_deposits"]]
        self.assertNotIn(later.public_key, returned_keys)

    def test_box_older_deposits_invalid_cursor_returns_api_error(self):
        user = self.auth(self.make_user(username="older-page-invalid"))
        box = self.make_box(url="older-page-invalid", name="Older page invalid")

        response = self.client.get(
            reverse("box-older-deposits"),
            {"boxSlug": box.url, "limit": 25, "cursor": "bad-cursor"},
        )

        self.assert_api_error(response, 400, "INVALID_CURSOR")

    def test_box_older_deposits_without_active_session_returns_session_required(self):
        user = self.auth(self.make_user(username="older-page-no-session"))
        box = self.make_box(url="older-page-no-session", name="Older page no session")
        BoxSession.objects.filter(user=user, box=box).delete()

        response = self.client.get(reverse("box-older-deposits"), {"boxSlug": box.url, "limit": 25})

        self.assert_api_error(response, 403, "BOX_SESSION_REQUIRED")

    def test_box_older_deposits_caps_limit_to_25(self):
        user = self.auth(self.make_user(username="older-page-cap"))
        box = self.make_box(url="older-page-cap", name="Older page cap")
        session = BoxSession.objects.get(user=user, box=box)
        session.started_at = timezone.now()
        session.expires_at = session.started_at + timedelta(minutes=20)
        session.save(update_fields=["started_at", "expires_at"])
        self.make_deposit(
            user=self.make_user(username="older-page-cap-main"),
            song=self.make_song(public_key="older-page-cap-main"),
            box=box,
            deposited_at=session.started_at,
        )
        for index in range(30):
            self.make_deposit(
                user=self.make_user(username=f"older-page-cap-owner-{index}"),
                song=self.make_song(public_key=f"older-page-cap-song-{index}"),
                box=box,
                deposited_at=session.started_at - timedelta(seconds=index + 1),
            )

        response = self.client.get(reverse("box-older-deposits"), {"boxSlug": box.url, "limit": 100})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["older_deposits"]), 25)
        self.assertTrue(response.data["has_more"])


class BoxDepositFlowTests(FlowboxAPITestCase):
    def test_box_deposit_creates_session_deposit_and_returns_points_payload(self):
        user = self.auth(self.make_user(username="box-deposit-create", points=0))
        box = self.make_box(url="box-deposit-create", name="Box deposit create")

        deposit_count_before = Deposit.objects.filter(
            user=user,
            box=box,
            deposit_type=Deposit.DEPOSIT_TYPE_BOX,
        ).count()

        response = self.client.post(
            f'{reverse("box-deposit")}?boxSlug={box.url}',
            {"option": self.track_option(track_id="box-deposit-track", title="Box Deposit Track")},
            format="json",
        )

        expected = (
            NB_POINTS_ADD_SONG
            + NB_POINTS_FIRST_DEPOSIT_USER_ON_BOX
            + NB_POINTS_FIRST_SONG_DEPOSIT_BOX
            + NB_POINTS_FIRST_SONG_DEPOSIT_GLOBAL
        )
        user.refresh_from_db()
        session = BoxSession.objects.get(user=user, box=box)
        self.assertEqual(response.status_code, 200)
        self.assertIsNotNone(session.deposit_id)
        self.assertEqual(session.deposit.deposit_type, Deposit.DEPOSIT_TYPE_BOX)
        self.assertEqual(session.deposit.box_id, box.id)
        self.assertEqual(session.deposit.user_id, user.id)
        self.assertEqual(
            Deposit.objects.filter(user=user, box=box, deposit_type=Deposit.DEPOSIT_TYPE_BOX).count(),
            deposit_count_before + 1,
        )
        self.assertEqual(response.data["my_deposit"]["public_key"], session.deposit.public_key)
        self.assertIn("successes", response.data)
        self.assertIsInstance(response.data["successes"], list)
        self.assertTrue(response.data["successes"])
        self.assertEqual(response.data["points_balance"], expected)
        self.assertEqual(user.points, expected)
        self.assertFalse(response.data["already_exists"])
        self.assertNotIn("current_user", response.data)

    def test_box_deposit_without_active_session_returns_session_required(self):
        user = self.auth(self.make_user(username="box-deposit-no-session", points=0))
        box = self.make_box(url="box-deposit-no-session", name="Box deposit no session")
        BoxSession.objects.filter(user=user, box=box).delete()

        response = self.client.post(
            f'{reverse("box-deposit")}?boxSlug={box.url}',
            {"option": self.track_option(track_id="box-deposit-no-session-track")},
            format="json",
        )

        self.assert_api_error(response, 403, "BOX_SESSION_REQUIRED")
        self.assertEqual(
            Deposit.objects.filter(user=user, box=box, deposit_type=Deposit.DEPOSIT_TYPE_BOX).count(),
            0,
        )


class DepositPointsFlowTests(FlowboxAPITestCase):
    def test_first_deposit_grants_all_first_time_bonuses(self):
        user = self.auth(self.make_user(username="dep1", points=0))
        box = self.make_box(url="box-dep-1", name="Box dep 1")
        response = self.client.post(
            f'{reverse("box-deposit")}?boxSlug={box.url}',
            {
                "option": self.track_option(track_id="dep-track-1", title="Deposit Track 1"),
            },
            format="json",
        )

        expected = (
            NB_POINTS_ADD_SONG
            + NB_POINTS_FIRST_DEPOSIT_USER_ON_BOX
            + NB_POINTS_FIRST_SONG_DEPOSIT_BOX
            + NB_POINTS_FIRST_SONG_DEPOSIT_GLOBAL
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["points_balance"], expected)
        user.refresh_from_db()
        self.assertEqual(user.points, expected)

    def test_deposit_without_first_user_bonus_when_user_already_deposited_in_box(self):
        user = self.make_user(username="dep2", points=0)
        box = self.make_box(url="box-dep-2", name="Box dep 2")
        prior_song = self.make_song(public_key="dep2_old_song")
        self.make_deposit(user=user, song=prior_song, box=box, deposited_at=timezone.now() - timedelta(days=1))
        self.auth(user)

        response = self.client.post(
            f'{reverse("box-deposit")}?boxSlug={box.url}',
            {
                "option": self.track_option(track_id="dep-track-2", title="Deposit Track 2"),
            },
            format="json",
        )

        expected = (
            NB_POINTS_ADD_SONG
            + NB_POINTS_FIRST_SONG_DEPOSIT_BOX
            + NB_POINTS_FIRST_SONG_DEPOSIT_GLOBAL
            + NB_POINTS_CONSECUTIVE_DAYS_BOX
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["points_balance"], expected)

    def test_deposit_without_first_song_bonus_when_song_already_in_box(self):
        user = self.make_user(username="dep3", points=0)
        other = self.make_user(username="dep3_other", points=0)
        box = self.make_box(url="box-dep-3", name="Box dep 3")
        existing_song = self.make_song(
            public_key="dep3_song", title="Shared Song", artists=["Shared Artist"], duration=180
        )
        self.make_deposit(user=other, song=existing_song, box=box, deposited_at=timezone.now() - timedelta(days=1))
        self.auth(user)

        response = self.client.post(
            f'{reverse("box-deposit")}?boxSlug={box.url}',
            {
                "option": self.track_option(
                    track_id="dep-track-3", title="Shared Song", artists=["Shared Artist"], duration=180
                ),
            },
            format="json",
        )

        expected = NB_POINTS_ADD_SONG + NB_POINTS_FIRST_DEPOSIT_USER_ON_BOX
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["points_balance"], expected)

    def test_repeat_song_deposit_only_awards_default_points_when_user_and_song_already_seen(self):
        user = self.make_user(username="dep4", points=0)
        other = self.make_user(username="dep4_other", points=0)
        box = self.make_box(url="box-dep-4", name="Box dep 4")
        existing_song = self.make_song(public_key="dep4_song", title="Seen Song", artists=["Seen Artist"], duration=180)
        self.make_deposit(
            user=user,
            song=self.make_song(public_key="dep4_old", title="Old", artists=["Old Artist"]),
            box=box,
            deposited_at=timezone.now() - timedelta(days=2),
        )
        self.make_deposit(user=other, song=existing_song, box=box, deposited_at=timezone.now() - timedelta(days=1))
        self.auth(user)

        response = self.client.post(
            f'{reverse("box-deposit")}?boxSlug={box.url}',
            {
                "option": self.track_option(
                    track_id="dep-track-4", title="Seen Song", artists=["Seen Artist"], duration=180
                ),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["points_balance"], NB_POINTS_ADD_SONG)

    def test_economy_endpoint_contains_reveal_cost_and_points_rules(self):
        response = self.client.get(reverse("economy"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["reveal_cost"], COST_REVEAL_BOX)
        self.assertIn("points", response.data)
        self.assertIn("pinned_price_steps", response.data)

    def test_deposit_response_points_balance_matches_database(self):
        user = self.auth(self.make_user(username="dep5", points=0))
        box = self.make_box(url="box-dep-5", name="Box dep 5")
        response = self.client.post(
            f'{reverse("box-deposit")}?boxSlug={box.url}',
            {
                "option": self.track_option(track_id="dep-track-5", title="Deposit Track 5"),
            },
            format="json",
        )
        user.refresh_from_db()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["points_balance"], user.points)
