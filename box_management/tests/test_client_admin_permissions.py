from django.urls import reverse

from .base import ClientAdminTestCase


class ClientAdminPermissionsTests(ClientAdminTestCase):
    def test_articles_list_requires_authentication(self):
        response = self.client.get(reverse("client-admin-articles-list-create"))
        self.assert_api_error(response, status_code=401, code="AUTH_REQUIRED")

    def test_articles_list_rejects_user_without_client(self):
        user = self.make_client_user(username="no-client", client=None)
        self.auth(user)

        response = self.client.get(reverse("client-admin-articles-list-create"))
        self.assert_api_error(response, status_code=403, code="CLIENT_NOT_ATTACHED")

    def test_articles_list_rejects_inactive_portal_user(self):
        client = self.make_client(name="Client inactive", slug="client-inactive")
        user = self.make_client_user(
            username="inactive-user",
            client=client,
            portal_status="suspended",
        )
        self.auth(user)

        response = self.client.get(reverse("client-admin-articles-list-create"))
        self.assert_api_error(response, status_code=403, code="CLIENT_PORTAL_INACTIVE")

    def test_articles_list_rejects_user_without_allowed_role(self):
        client = self.make_client(name="Client role", slug="client-role")
        user = self.make_client_user(
            username="viewer-user",
            client=client,
            client_role="",
        )
        self.auth(user)

        response = self.client.get(reverse("client-admin-articles-list-create"))
        self.assert_api_error(response, status_code=403, code="CLIENT_ROLE_FORBIDDEN")

    def test_comments_list_uses_same_permission_contract(self):
        response = self.client.get(reverse("client-admin-comments-list"))
        self.assert_api_error(response, status_code=401, code="AUTH_REQUIRED")
