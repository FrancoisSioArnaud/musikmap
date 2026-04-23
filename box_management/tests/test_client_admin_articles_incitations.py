from datetime import date, timedelta
from unittest.mock import patch

from django.urls import reverse

from .base import ClientAdminTestCase


class ClientAdminArticlesAndIncitationsTests(ClientAdminTestCase):
    def setUp(self):
        super().setUp()
        self.client_a = self.make_client(name="Client A", slug="client-a")
        self.client_b = self.make_client(name="Client B", slug="client-b")
        self.owner_a = self.make_client_user(username="owner-a", client=self.client_a)
        self.owner_b = self.make_client_user(username="owner-b", client=self.client_b)

    def test_article_create_validation_error_has_standard_shape(self):
        self.auth(self.owner_a)

        response = self.client.post(
            reverse("client-admin-articles-list-create"),
            {
                "status": "published",
                "title": "",
                "link": "",
                "short_text": "",
            },
            format="json",
        )

        self.assert_api_error(response, status_code=400, code="VALIDATION_ERROR")
        self.assertIn("field_errors", response.data)
        self.assertIn("title", response.data["field_errors"])

    def test_article_detail_is_scoped_to_client(self):
        article = self.make_article(client=self.client_b, author=self.owner_b, title="Privé")
        self.auth(self.owner_a)

        response = self.client.get(reverse("client-admin-articles-detail", args=[article.id]))
        self.assert_api_error(response, status_code=404, code="ARTICLE_NOT_FOUND")

    def test_article_import_requires_link(self):
        self.auth(self.owner_a)

        response = self.client.post(
            reverse("client-admin-articles-import-page"),
            {"link": ""},
            format="json",
        )

        self.assert_api_error(response, status_code=400, code="VALIDATION_ERROR")
        self.assertEqual(
            response.data["field_errors"].get("link"),
            ["Le lien externe est obligatoire pour importer une page."],
        )

    @patch("box_management.integrations.article_scraper._extract_import_preview_from_url")
    def test_article_import_success_returns_preview_payload(self, extract_preview):
        self.auth(self.owner_a)
        extract_preview.return_value = {
            "title": "Article importé",
            "short_text": "Résumé importé",
            "cover_image": "https://example.com/image.jpg",
            "favicon": "https://example.com/favicon.ico",
        }

        response = self.client.post(
            reverse("client-admin-articles-import-page"),
            {"link": "https://example.com/article"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["title"], "Article importé")

    def test_incitation_overlap_returns_conflict_with_overlaps(self):
        self.make_incitation(
            client=self.client_a,
            text="Phrase existante",
            start_date=date.today(),
            end_date=date.today() + timedelta(days=2),
        )
        self.auth(self.owner_a)

        response = self.client.post(
            reverse("client-admin-incitations-list-create"),
            {
                "text": "Nouvelle phrase",
                "start_date": str(date.today() + timedelta(days=1)),
                "end_date": str(date.today() + timedelta(days=4)),
            },
            format="json",
        )

        self.assert_api_error(response, status_code=409, code="INCITATION_OVERLAP")
        self.assertIn("overlaps", response.data)
        self.assertTrue(response.data["overlaps"])

    def test_incitation_detail_is_scoped_to_client(self):
        incitation = self.make_incitation(client=self.client_b, text="Privée")
        self.auth(self.owner_a)

        response = self.client.get(reverse("client-admin-incitations-detail", args=[incitation.id]))
        self.assert_api_error(response, status_code=404, code="INCITATION_NOT_FOUND")
