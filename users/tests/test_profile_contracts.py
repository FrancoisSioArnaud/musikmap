from __future__ import annotations

from django.urls import reverse

from box_management.tests.base import FlowboxAPITestCase


class UserProfileContractTests(FlowboxAPITestCase):
    def test_get_user_info_requires_username(self):
        response = self.client.get(reverse("get-user-info"))
        self.assert_api_error(response, 400, "USERNAME_REQUIRED")

    def test_get_user_info_forbids_public_lookup_by_user_id(self):
        user = self.make_user(username="lookup-user")
        response = self.client.get(reverse("get-user-info"), {"userID": user.id})
        self.assert_api_error(response, 403, "USER_ID_LOOKUP_FORBIDDEN")

    def test_remove_favorite_song_is_idempotent(self):
        user = self.auth(self.make_user(username="favorite-owner"))
        first = self.client.post(reverse("remove-favorite-song"), {}, format="json")
        second = self.client.post(reverse("remove-favorite-song"), {}, format="json")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
