from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from users.forms import RegisterUserForm


class LoginWithEmailTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()

    def test_login_with_username_still_works(self):
        user = self.user_model.objects.create_user(
            username="alice", email="alice@example.com", password="secret123"
        )

        response = self.client.post(
            "/users/login_user",
            {"username": user.username, "password": "secret123"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data.get("status"))

    def test_login_with_unique_email_works(self):
        user = self.user_model.objects.create_user(
            username="bob", email="bob@example.com", password="secret123"
        )

        response = self.client.post(
            "/users/login_user",
            {"username": "BOB@example.com", "password": "secret123"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data.get("status"))
        self.assertEqual(str(self.client.session.get("_auth_user_id")), str(user.id))

    def test_login_with_unknown_email_fails_cleanly(self):
        self.user_model.objects.create_user(
            username="carol", email="carol@example.com", password="secret123"
        )

        response = self.client.post(
            "/users/login_user",
            {"username": "unknown@example.com", "password": "secret123"},
            format="json",
        )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data.get("code"), "AUTH_INVALID")

    def test_login_with_duplicated_email_returns_explicit_error(self):
        self.user_model.objects.create_user(
            username="dave1", email="duplicate@example.com", password="secret123"
        )
        self.user_model.objects.create_user(
            username="dave2", email="duplicate@example.com", password="secret123"
        )

        response = self.client.post(
            "/users/login_user",
            {"username": "duplicate@example.com", "password": "secret123"},
            format="json",
        )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data.get("code"), "AUTH_EMAIL_NOT_UNIQUE")


class RegisterEmailUniquenessTests(TestCase):
    def test_register_form_rejects_case_insensitive_duplicate_email(self):
        user_model = get_user_model()
        user_model.objects.create_user(
            username="eve", email="eve@example.com", password="secret123"
        )

        form = RegisterUserForm(
            data={
                "username": "eve2",
                "email": "EVE@example.com",
                "password1": "secret123456",
                "password2": "secret123456",
            }
        )

        self.assertFalse(form.is_valid())
        self.assertIn("email", form.errors)
        self.assertIn("Cette adresse email est déjà utilisée.", form.errors["email"])
