from django.urls import reverse

from box_management.tests.base import FlowboxAPITestCase
from users.models import UserFollow


class UserFollowTests(FlowboxAPITestCase):
    def test_creation_follow_ok(self):
        viewer = self.make_user(username="alice")
        target = self.make_user(username="bob")
        self.auth(viewer)
        response = self.client.post(reverse("user-follow", kwargs={"username": "bob"}), {}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["followed"])

    def test_follow_idempotent(self):
        viewer = self.make_user(username="alice2")
        target = self.make_user(username="bob2")
        self.auth(viewer)
        url = reverse("user-follow", kwargs={"username": "bob2"})
        self.client.post(url, {}, format="json")
        response = self.client.post(url, {}, format="json")
        self.assertEqual(response.status_code, 200)

    def test_unfollow_idempotent(self):
        viewer = self.make_user(username="alice3")
        target = self.make_user(username="bob3")
        self.auth(viewer)
        url = reverse("user-follow", kwargs={"username": "bob3"})
        response = self.client.delete(url, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["followed"])

    def test_self_follow_forbidden(self):
        viewer = self.make_user(username="same")
        self.auth(viewer)
        response = self.client.post(reverse("user-follow", kwargs={"username": "same"}), {}, format="json")
        self.assert_api_error(response, 400, "SELF_FOLLOW_FORBIDDEN")

    def test_guest_cannot_follow(self):
        viewer = self.make_user(username="guest1", is_guest=True)
        target = self.make_user(username="target1")
        self.auth(viewer)
        response = self.client.post(reverse("user-follow", kwargs={"username": target.username}), {}, format="json")
        self.assert_api_error(response, 403, "ACCOUNT_COMPLETION_REQUIRED")

    def test_target_guest_not_found(self):
        viewer = self.make_user(username="viewerx")
        guest = self.make_user(username="guestx", is_guest=True)
        self.auth(viewer)
        response = self.client.post(reverse("user-follow", kwargs={"username": guest.username}), {}, format="json")
        self.assert_api_error(response, 404, "USER_NOT_FOUND")

    def test_get_user_info_has_follow_fields_and_case_insensitive_lookup(self):
        viewer = self.make_user(username="Viewer")
        target = self.make_user(username="Target")
        UserFollow.objects.create(follower=viewer, following=target)
        self.auth(viewer)
        response = self.client.get(reverse("get-user-info"), {"username": "target"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["followers_count"], 1)
        self.assertEqual(response.data["following_count"], 0)
        self.assertTrue(response.data["is_followed_by_me"])

    def test_followers_and_following_paginated(self):
        target = self.make_user(username="targetp")
        f1 = self.make_user(username="f1")
        f2 = self.make_user(username="f2")
        UserFollow.objects.create(follower=f1, following=target)
        UserFollow.objects.create(follower=f2, following=target)
        response = self.client.get(reverse("user-followers", kwargs={"username": "targetp"}), {"page": 1, "page_size": 1})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertTrue(response.data["next"])

        response2 = self.client.get(reverse("user-following", kwargs={"username": "f1"}), {"page": 1, "page_size": 20})
        self.assertEqual(response2.status_code, 200)
        self.assertEqual(response2.data["count"], 1)

    def test_is_followed_by_me_in_lists(self):
        me = self.make_user(username="me")
        target = self.make_user(username="targetl")
        other = self.make_user(username="other")
        UserFollow.objects.create(follower=other, following=target)
        UserFollow.objects.create(follower=me, following=other)
        self.auth(me)
        response = self.client.get(reverse("user-followers", kwargs={"username": "targetl"}))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"][0]["username"], "other")
        self.assertTrue(response.data["results"][0]["is_followed_by_me"])
