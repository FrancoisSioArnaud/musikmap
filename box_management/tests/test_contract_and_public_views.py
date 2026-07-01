from __future__ import annotations

from datetime import timedelta

from django.urls import reverse
from django.utils import timezone

from box_management.models import Deposit, Link
from box_management.tests.base import FlowboxAPITestCase
from la_boite_a_son.economy import build_economy_payload


class EconomyAndPinnedPublicViewTests(FlowboxAPITestCase):
    def test_economy_endpoint_returns_canonical_payload(self):
        response = self.client.get(reverse("economy"))
        self.assertEqual(response.status_code, 200)
        payload = build_economy_payload()
        self.assertEqual(response.data["reveal_cost"], payload["reveal_cost"])
        self.assertEqual(response.data["points"], payload["points"])
        self.assertTrue(response.data["pinned_price_steps"])

    def test_get_pinned_song_returns_active_pin(self):
        self.auth(self.make_user(username="viewer-pin", points=1000))
        client = self.make_client(name="Client public pin", slug="client-public-pin")
        box = self.make_box(url="box-public-pin", name="Box public pin", client=client)
        song = self.make_song(public_key="public_pin_song")
        self.make_deposit(
            user=self.make_user(username="pin-owner"),
            song=song,
            box=box,
            deposit_type=Deposit.DEPOSIT_TYPE_PINNED,
            pin_duration_minutes=10,
            pin_points_spent=149,
            pin_expires_at=timezone.now() + timedelta(minutes=10),
        )

        response = self.client.get(reverse("pinned-song"), {"boxSlug": box.url})
        self.assertEqual(response.status_code, 200)
        self.assertIsNotNone(response.data["active_pinned_deposit"])
        self.assertTrue(response.data["price_steps"])
        self.assertEqual(response.data["active_pinned_deposit"]["deposit_type"], "pinned")

    def test_get_pinned_song_returns_none_for_expired_pin(self):
        self.auth(self.make_user(username="viewer-expired-pin", points=1000))
        client = self.make_client(name="Client expired pin", slug="client-expired-pin")
        box = self.make_box(url="box-expired-pin", name="Box expired pin", client=client)
        song = self.make_song(public_key="expired_pin_song")
        self.make_deposit(
            user=self.make_user(username="expired-pin-owner"),
            song=song,
            box=box,
            deposit_type=Deposit.DEPOSIT_TYPE_PINNED,
            pin_duration_minutes=10,
            pin_points_spent=149,
            pin_expires_at=timezone.now() - timedelta(minutes=1),
        )

        response = self.client.get(reverse("pinned-song"), {"boxSlug": box.url})
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["active_pinned_deposit"])
        self.assertTrue(response.data["price_steps"])


class PublicContractViewTests(FlowboxAPITestCase):
    def test_box_preview_returns_public_box_snapshot(self):
        client = self.make_client(name="Client public box", slug="client-public-box")
        box = self.make_box(url="box-public", name="Box public", client=client)
        song = self.make_song(public_key="public-box-song")
        song.image_url = "https://example.com/cover.jpg"
        song.save(update_fields=["image_url"])
        self.make_deposit(user=self.make_user(username="owner-public-box"), song=song, box=box)

        response = self.client.get(reverse("box-preview"), {"boxSlug": box.url})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            set(response.data.keys()),
            {
                "slug",
                "name",
                "client_slug",
                "require_loc",
                "deposit_count",
                "last_deposit_date",
                "last_deposit_song_image_url",
                "search_incitation_text",
            },
        )
        self.assertEqual(response.data["slug"], box.url)
        self.assertEqual(response.data["name"], box.name)
        self.assertEqual(response.data["deposit_count"], 1)
        self.assertEqual(response.data["client_slug"], client.slug)
        self.assertEqual(response.data["last_deposit_song_image_url"], song.image_url)

    def test_box_preview_sets_csrf_cookie(self):
        box = self.make_box(url="box-csrf", name="Box CSRF")

        response = self.client.get(reverse("box-preview"), {"boxSlug": box.url})

        self.assertEqual(response.status_code, 200)
        self.assertIn("csrftoken", response.cookies)

    def test_box_preview_requires_box_slug(self):
        response = self.client.get(reverse("box-preview"))

        self.assert_api_error(response, 400, "BOX_SLUG_REQUIRED")

    def test_box_preview_returns_not_found_for_invalid_box_slug(self):
        response = self.client.get(reverse("box-preview"), {"boxSlug": "missing-box"})

        self.assert_api_error(response, 404, "BOX_NOT_FOUND")


    def test_share_link_public_detail_returns_link_expired_for_expired_link(self):
        owner = self.make_user(username="owner-link")
        box = self.make_box(url="box-link", name="Box link")
        deposit = self.make_deposit(user=owner, song=self.make_song(public_key="link-song"), box=box)
        link = Link.objects.create(
            slug="abcdefghjkmnpqr", deposit=deposit, created_by=owner, expires_at=timezone.now() - timedelta(minutes=1)
        )

        response = self.client.get(reverse("share-link-public-detail", kwargs={"link_slug": link.slug}))
        self.assert_api_error(response, 410, "LINK_EXPIRED")
