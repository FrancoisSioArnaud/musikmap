from datetime import date, timedelta

from rest_framework.test import APITestCase

from box_management.models import Article, Box, Client, IncitationPhrase, Sticker
from users.models import CustomUser


class ClientAdminTestCase(APITestCase):
    def make_client(self, name="Client test", slug="client-test"):
        return Client.objects.create(name=name, slug=slug)

    def make_client_user(
        self,
        *,
        username="client-user",
        client=None,
        client_role="client_owner",
        portal_status="active",
        is_guest=False,
    ):
        user = CustomUser.objects.create_user(username=username, password="testpass123")
        user.client = client
        user.client_role = client_role
        user.portal_status = portal_status
        user.is_guest = is_guest
        user.save(update_fields=["client", "client_role", "portal_status", "is_guest"])
        return user

    def auth(self, user):
        self.client.force_authenticate(user=user)
        return user

    def make_box(self, *, client=None, name="Box test", url="box-test"):
        return Box.objects.create(name=name, url=url, client=client)

    def make_article(self, *, client, author=None, title="Titre", short_text="Texte", status="draft"):
        return Article.objects.create(
            client=client,
            author=author,
            title=title,
            short_text=short_text,
            status=status,
        )

    def make_incitation(self, *, client, text="Incitation", start_date=None, end_date=None):
        start_date = start_date or date.today()
        end_date = end_date or (start_date + timedelta(days=3))
        return IncitationPhrase.objects.create(
            client=client,
            text=text,
            start_date=start_date,
            end_date=end_date,
        )

    def make_sticker(self, *, client, slug="12345678901", is_active=True, box=None):
        return Sticker.objects.create(client=client, slug=slug, is_active=is_active, box=box)

    def assert_api_error(self, response, *, status_code, code):
        self.assertEqual(response.status_code, status_code)
        self.assertEqual(response.data.get("status"), status_code)
        self.assertEqual(response.data.get("code"), code)
        self.assertIn("title", response.data)
        self.assertIn("detail", response.data)
