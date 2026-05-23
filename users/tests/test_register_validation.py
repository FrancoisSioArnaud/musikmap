from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from users.models import CustomUser


class RegisterValidationTests(APITestCase):
    def test_register_invalid_username_returns_clear_field_error(self):
        response = self.client.post(
            reverse("register"),
            {
                "username": "bad username",
                "email": "bad@example.com",
                "password1": "S3cretpass123",
                "password2": "S3cretpass123",
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data.get("code"), "VALIDATION_ERROR")
        self.assertIn("username", response.data.get("field_errors", {}))

    def test_register_required_field_error_does_not_create_user(self):
        before_count = CustomUser.objects.count()
        response = self.client.post(
            reverse("register"),
            {
                "username": "newuser",
                "email": "newuser@example.com",
                "password1": "S3cretpass123",
                "password2": "",
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data.get("code"), "VALIDATION_ERROR")
        self.assertIn("password2", response.data.get("field_errors", {}))
        self.assertEqual(CustomUser.objects.count(), before_count)

    def test_register_valid_still_works(self):
        response = self.client.post(
            reverse("register"),
            {
                "username": "validuser",
                "email": "validuser@example.com",
                "password1": "S3cretpass123",
                "password2": "S3cretpass123",
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data.get("status"))
        self.assertTrue(CustomUser.objects.filter(username="validuser").exists())
