from __future__ import annotations

from datetime import timedelta

from django.urls import reverse
from django.utils import timezone

from box_management.models import (
    BoxSession,
    Comment,
    CommentModerationDecision,
    Deposit,
    DiscoveredSong,
    EmojiRight,
    Link,
    Reaction,
)
from box_management.tests.base import FlowboxAPITestCase


class DepositAndFavoriteDoubleActionTests(FlowboxAPITestCase):
    def test_double_box_deposit_within_reuse_window_creates_one_deposit_and_one_credit(self):
        user = self.auth(self.make_user(username="dupdep", points=0))
        box = self.make_box(url="box-dup-dep", name="Box dup dep")
        option = self.track_option(track_id="dup-track-1", title="Duplicate Track")

        first = self.client.post(reverse("get-box"), {"boxSlug": box.url, "option": option}, format="json")
        second = self.client.post(reverse("get-box"), {"boxSlug": box.url, "option": option}, format="json")

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(Deposit.objects.filter(user=user, box=box, deposit_type="box").count(), 1)
        user.refresh_from_db()
        self.assertEqual(first.data["points_balance"], second.data["points_balance"])
        self.assertEqual(user.points, first.data["points_balance"])

    def test_double_set_favorite_within_reuse_window_reuses_same_deposit(self):
        user = self.auth(self.make_user(username="dupfav", points=0))
        option = self.track_option(track_id="fav-track-1", title="Favorite Track")

        first = self.client.post(reverse("set-favorite-song"), {"option": option}, format="json")
        second = self.client.post(reverse("set-favorite-song"), {"option": option}, format="json")

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        user.refresh_from_db()
        self.assertIsNotNone(user.favorite_deposit_id)
        self.assertEqual(Deposit.objects.filter(user=user, deposit_type="favorite").count(), 1)


class PointsAndReactionDoubleActionTests(FlowboxAPITestCase):
    def test_double_reveal_keeps_one_discovery_and_one_debit(self):
        user = self.auth(self.make_user(username="duprev", points=100))
        box = self.make_box(url="box-duprev", name="Box dup rev")
        deposit = self.make_deposit(
            user=self.make_user(username="owner-duprev"), song=self.make_song(public_key="duprev-song"), box=box
        )

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
        self.assertEqual(Reaction.objects.filter(user=user, deposit=deposit).count(), 0)
        self.assertEqual(deposit.discoveries.filter(user=user).count(), 1)

    def test_double_pin_creates_single_active_pin_and_single_debit(self):
        user = self.auth(self.make_user(username="duppin", points=1000))
        client = self.make_client(name="Client dup pin", slug="client-dup-pin")
        box = self.make_box(url="box-duppin", name="Box dup pin", client=client)
        payload = {
            "boxSlug": box.url,
            "duration_minutes": 10,
            "option": self.track_option(track_id="duppin-track", title="Dup pin track"),
        }

        first = self.client.post(reverse("pinned-song"), payload, format="json")
        second = self.client.post(reverse("pinned-song"), payload, format="json")

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 409)
        self.assertEqual(Deposit.objects.filter(box=box, deposit_type="pinned").count(), 1)
        user.refresh_from_db()
        self.assertEqual(user.points, first.data["points_balance"])

    def test_double_purchase_same_emoji_creates_single_right_and_single_debit(self):
        user = self.auth(self.make_user(username="duppurchase", points=500))
        emoji = self.make_emoji(char="🎉", cost=300)

        self.client.post(reverse("emoji-purchase"), {"emoji_id": emoji.id}, format="json")
        self.client.post(reverse("emoji-purchase"), {"emoji_id": emoji.id}, format="json")

        user.refresh_from_db()
        self.assertEqual(EmojiRight.objects.filter(user=user, emoji=emoji).count(), 1)
        self.assertEqual(user.points, 200)

    def test_reaction_change_keeps_single_row(self):
        user = self.auth(self.make_user(username="dupreact", points=0))
        box = self.make_box(url="box-dupreact", name="Box dup react")
        deposit = self.make_deposit(user=user, song=self.make_song(public_key="dupreact-song"), box=box)
        emoji_a = self.make_emoji(char="🔥", cost=0)
        emoji_b = self.make_emoji(char="😎", cost=0)

        self.client.post(
            reverse("reactions"), {"dep_public_key": deposit.public_key, "emoji_id": emoji_a.id}, format="json"
        )
        self.client.post(
            reverse("reactions"), {"dep_public_key": deposit.public_key, "emoji_id": emoji_b.id}, format="json"
        )

        self.assertEqual(Reaction.objects.filter(user=user, deposit=deposit).count(), 1)
        self.assertEqual(Reaction.objects.get(user=user, deposit=deposit).emoji_id, emoji_b.id)

    def test_double_delete_reaction_stays_idempotent(self):
        user = self.auth(self.make_user(username="dupreactdel", points=0))
        box = self.make_box(url="box-dupreactdel", name="Box dup react del")
        deposit = self.make_deposit(user=user, song=self.make_song(public_key="dupreactdel-song"), box=box)
        emoji = self.make_emoji(char="🔥", cost=0)
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


class CommentAndShareDoubleActionTests(FlowboxAPITestCase):
    def setUp(self):
        super().setUp()
        self.client_entity = self.make_client(name="Client comments", slug="client-comments")
        self.box = self.make_box(url="box-comments", name="Box comments", client=self.client_entity)
        self.owner = self.make_user(username="owner-comments")
        self.deposit = self.make_deposit(user=self.owner, song=self.make_song(public_key="comment-song"), box=self.box)

    def test_double_comment_create_results_in_two_comments_with_new_rule(self):
        user = self.auth(self.make_user(username="commenter", points=0))
        payload = {"dep_public_key": self.deposit.public_key, "text": "Super partage"}

        first = self.client.post(reverse("comments-create"), payload, format="json")
        second = self.client.post(reverse("comments-create"), payload, format="json")

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 400)
        self.assertEqual(second.data["code"], "COMMENT_CONSECUTIVE_BLOCKED")
        self.assertEqual(Comment.objects.filter(user=user, deposit=self.deposit).count(), 1)

    def test_double_comment_report_creates_single_report(self):
        comment_author = self.make_user(username="comment-author")
        comment = Comment.objects.create(
            client=self.client_entity,
            deposit=self.deposit,
            user=comment_author,
            text="À signaler",
            normalized_text="à signaler",
        )
        self.auth(self.make_user(username="reporter", points=0))

        first = self.client.post(
            reverse("comments-report", kwargs={"comment_id": comment.id}), {"reason": "spam"}, format="json"
        )
        second = self.client.post(
            reverse("comments-report", kwargs={"comment_id": comment.id}), {"reason": "spam"}, format="json"
        )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        comment.refresh_from_db()
        self.assertEqual(comment.reports_count, 1)
        self.assertTrue(second.data["already_reported"])

    def test_double_comment_delete_is_idempotent_and_does_not_duplicate_decision(self):
        author = self.auth(self.make_user(username="comment-delete-author", points=0))
        comment = Comment.objects.create(
            client=self.client_entity,
            deposit=self.deposit,
            user=author,
            text="À supprimer",
            normalized_text="à supprimer",
        )

        first = self.client.delete(reverse("comments-detail", kwargs={"comment_id": comment.id}))
        second = self.client.delete(reverse("comments-detail", kwargs={"comment_id": comment.id}))

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        comment.refresh_from_db()
        self.assertEqual(comment.status, Comment.STATUS_DELETED_BY_AUTHOR)
        self.assertEqual(
            CommentModerationDecision.objects.filter(
                comment=comment, acted_by=author, decision_code="delete_by_author"
            ).count(),
            1,
        )

    def test_double_share_link_create_reuses_same_link(self):
        sharer = self.auth(self.owner)

        first = self.client.post(
            reverse("share-link-create"), {"dep_public_key": self.deposit.public_key}, format="json"
        )
        second = self.client.post(
            reverse("share-link-create"), {"dep_public_key": self.deposit.public_key}, format="json"
        )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(Link.objects.filter(created_by=sharer, deposit=self.deposit).count(), 1)
        self.assertEqual(first.data["slug"], second.data["slug"])

    def test_create_reply_with_song_only(self):
        user = self.auth(self.make_user(username="song-only", points=0))
        payload = {
            "dep_public_key": self.deposit.public_key,
            "text": "",
            "song_option": self.track_option(track_id="reply-song-only"),
        }

        response = self.client.post(reverse("comments-create"), payload, format="json")
        self.assertEqual(response.status_code, 201)
        comment = Comment.objects.get(pk=response.data["comment_id"])
        self.assertIsNotNone(comment.reply_deposit_id)
        self.assertEqual(comment.reply_deposit.deposit_type, Deposit.DEPOSIT_TYPE_COMMENT)
        self.assertEqual(comment.reply_deposit.box_id, self.deposit.box_id)
        self.assertEqual(comment.user_id, user.id)

    def test_create_reply_with_text_and_song(self):
        self.auth(self.make_user(username="text-song", points=0))
        payload = {
            "dep_public_key": self.deposit.public_key,
            "text": "texte + chanson",
            "song_option": self.track_option(track_id="reply-song-text"),
        }
        response = self.client.post(reverse("comments-create"), payload, format="json")
        self.assertEqual(response.status_code, 201)
        comment = Comment.objects.get(pk=response.data["comment_id"])
        self.assertEqual(comment.text, "texte + chanson")
        self.assertIsNotNone(comment.reply_deposit_id)

    def test_create_reply_atomicity_rolls_back_reply_deposit(self):
        self.auth(self.make_user(username="atomic-user", points=0))
        payload = {
            "dep_public_key": self.deposit.public_key,
            "text": "",
            "song_option": {"provider_code": "spotify"},
        }
        before_count = Deposit.objects.filter(deposit_type=Deposit.DEPOSIT_TYPE_COMMENT).count()
        response = self.client.post(reverse("comments-create"), payload, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Deposit.objects.filter(deposit_type=Deposit.DEPOSIT_TYPE_COMMENT).count(), before_count)
        self.assertEqual(Comment.objects.filter(deposit=self.deposit, user__username="atomic-user").count(), 0)

    def test_consecutive_rule_unblocked_after_other_user_reply(self):
        first_user = self.auth(self.make_user(username="first-user", points=0))
        payload = {"dep_public_key": self.deposit.public_key, "text": "première"}
        self.assertEqual(self.client.post(reverse("comments-create"), payload, format="json").status_code, 201)

        blocked = self.client.post(reverse("comments-create"), payload, format="json")
        self.assertEqual(blocked.status_code, 400)
        self.assertEqual(blocked.data["code"], "COMMENT_CONSECUTIVE_BLOCKED")

        second_user = self.make_user(username="second-user", points=0)
        self.auth(second_user)
        self.assertEqual(
            self.client.post(
                reverse("comments-create"), {"dep_public_key": self.deposit.public_key, "text": "ok"}, format="json"
            ).status_code,
            201,
        )
        Comment.objects.filter(user=first_user).update(created_at=timezone.now() - timedelta(minutes=5))

        self.auth(first_user)
        allowed_again = self.client.post(reverse("comments-create"), payload, format="json")
        self.assertEqual(allowed_again.status_code, 201)

    def test_replies_list_requires_reveal_and_counts_only_published(self):
        viewer = self.auth(self.make_user(username="viewer", points=0))
        other_user = self.make_user(username="other-user", points=0)
        Comment.objects.create(
            client=self.client_entity, deposit=self.deposit, user=other_user, text="visible", normalized_text="visible"
        )
        Comment.objects.create(
            client=self.client_entity,
            deposit=self.deposit,
            user=self.make_user(username="hidden-user", points=0),
            text="hidden",
            normalized_text="hidden",
            status=Comment.STATUS_REMOVED_MODERATION,
        )

        blocked = self.client.get(
            reverse("comments-deposit-replies", kwargs={"dep_public_key": self.deposit.public_key})
        )
        self.assertEqual(blocked.status_code, 403)

        DiscoveredSong.objects.create(user=viewer, deposit=self.deposit, discovered_type="revealed", context="box")
        visible = self.client.get(
            reverse("comments-deposit-replies", kwargs={"dep_public_key": self.deposit.public_key})
        )
        self.assertEqual(visible.status_code, 200)
        comments = visible.data["comments"]
        self.assertEqual(comments["count"], 1)
        self.assertEqual(len(comments["items"]), 1)

    def test_comment_on_box_deposit_without_active_box_session_is_allowed(self):
        user = self.auth(self.make_user(username="comment-no-session", points=0))
        BoxSession.objects.filter(user=user, box=self.box).delete()

        response = self.client.post(
            reverse("comments-create"),
            {"dep_public_key": self.deposit.public_key, "text": "hors session"},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(Comment.objects.filter(user=user, deposit=self.deposit, text="hors session").exists())

    def test_comment_on_pinned_deposit_without_active_box_session_is_allowed(self):
        user = self.auth(self.make_user(username="comment-pinned-no-session", points=0))
        pinned = self.make_deposit(
            user=self.owner,
            song=self.make_song(public_key="comment-pinned-song"),
            box=self.box,
            deposit_type=Deposit.DEPOSIT_TYPE_PINNED,
            pin_duration_minutes=10,
            pin_points_spent=149,
            pin_expires_at=timezone.now() + timedelta(minutes=10),
        )
        BoxSession.objects.filter(user=user, box=self.box).delete()

        response = self.client.post(
            reverse("comments-create"),
            {"dep_public_key": pinned.public_key, "text": "comment pinned hors session"},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(Comment.objects.filter(user=user, deposit=pinned).exists())

    def test_comment_requires_authentication(self):
        response = self.client.post(
            reverse("comments-create"),
            {"dep_public_key": self.deposit.public_key, "text": "sans auth"},
            format="json",
        )
        self.assert_api_error(response, 401, "AUTH_REQUIRED")

    def test_comment_empty_content_is_rejected(self):
        self.auth(self.make_user(username="comment-empty", points=0))
        response = self.client.post(
            reverse("comments-create"),
            {"dep_public_key": self.deposit.public_key, "text": "   "},
            format="json",
        )
        self.assert_api_error(response, 400, "COMMENT_EMPTY")
