from django.urls import reverse

from .base import ClientAdminTestCase


class ClientAdminStickersTests(ClientAdminTestCase):
    def setUp(self):
        super().setUp()
        self.client_a = self.make_client(name="Sticker A", slug="sticker-a")
        self.client_b = self.make_client(name="Sticker B", slug="sticker-b")
        self.owner_a = self.make_client_user(username="owner-sticker-a", client=self.client_a)
        self.owner_b = self.make_client_user(username="owner-sticker-b", client=self.client_b)
        self.box_a = self.make_box(client=self.client_a, name="Box A", url="box-a")

    def test_sticker_generate_requires_selection(self):
        self.auth(self.owner_a)

        response = self.client.post(reverse("client-admin-stickers-generate"), {}, format="json")
        self.assert_api_error(response, status_code=400, code="STICKER_SELECTION_REQUIRED")

    def test_sticker_install_rejects_invalid_slug(self):
        self.auth(self.owner_a)

        response = self.client.get(reverse("client-admin-stickers-install"), {"sticker": "abc"})
        self.assert_api_error(response, status_code=400, code="INVALID_STICKER_SLUG")

    def test_sticker_install_is_scoped_to_client(self):
        sticker = self.make_sticker(client=self.client_b, slug="11111111111")
        self.auth(self.owner_a)

        response = self.client.get(reverse("client-admin-stickers-install"), {"sticker": sticker.slug})
        self.assert_api_error(response, status_code=404, code="STICKER_NOT_FOUND")

    def test_sticker_assign_rejects_box_from_other_client(self):
        sticker = self.make_sticker(client=self.client_a, slug="22222222222")
        foreign_box = self.make_box(client=self.client_b, name="Foreign box", url="foreign-box")
        self.auth(self.owner_a)

        response = self.client.post(
            reverse("client-admin-stickers-assign", args=[sticker.id]),
            {"box_id": foreign_box.id},
            format="json",
        )
        self.assert_api_error(response, status_code=404, code="BOX_NOT_FOUND")

    def test_sticker_assign_returns_conflict_when_already_assigned(self):
        sticker = self.make_sticker(client=self.client_a, slug="33333333333", box=self.box_a)
        self.auth(self.owner_a)

        response = self.client.post(
            reverse("client-admin-stickers-assign", args=[sticker.id]),
            {"box_id": self.box_a.id},
            format="json",
        )
        self.assert_api_error(response, status_code=409, code="STICKER_ALREADY_ASSIGNED")
        self.assertIn("sticker", response.data)
