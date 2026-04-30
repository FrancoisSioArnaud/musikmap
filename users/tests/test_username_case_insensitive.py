from django.urls import reverse

from box_management.tests.base import FlowboxAPITestCase


class UsernameCaseInsensitiveTests(FlowboxAPITestCase):
    def test_register_rejects_case_insensitive_duplicate_username(self):
        self.make_user(username="Sio")

        response = self.client.post(
            reverse("register"),
            {
                "username": "sio",
                "email": "sio2@example.com",
                "password1": "StrongPass123!",
                "password2": "StrongPass123!",
            },
            format="multipart",
        )

        self.assert_api_error(response, 400, "VALIDATION_ERROR")
        self.assertIn("username", response.data.get("field_errors", {}))

    def test_public_profile_lookup_is_case_insensitive_and_preserves_casing(self):
        self.make_user(username="Sio")

        for variant in ["sio", "SIO", "SiO"]:
            response = self.client.get(reverse("get-user-info"), {"username": variant})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["username"], "Sio")

    def test_change_username_rejects_case_insensitive_duplicate(self):
        self.make_user(username="Sio")
        editor = self.make_user(username="OtherUser")
        self.auth(editor)

        response = self.client.post(reverse("change-username"), {"username": "sio"}, format="json")
        self.assert_api_error(response, 409, "USERNAME_ALREADY_TAKEN")
