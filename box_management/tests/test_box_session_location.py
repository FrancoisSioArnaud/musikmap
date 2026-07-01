from django.urls import reverse

from box_management.models import Box, BoxSession, LocationPoint
from box_management.services.boxes.session_helpers import open_box_session_for_user, session_payload_for_box
from box_management.tests.base import FlowboxAPITestCase


class BoxRequireLocationTests(FlowboxAPITestCase):
    def test_new_box_defaults_to_require_location(self):
        box = self.make_box(url="box-default-loc", name="Box default loc")

        self.assertTrue(box.require_loc)

    def test_box_preview_returns_require_loc(self):
        box = self.make_box(url="box-preview-loc", name="Box preview loc")
        box.require_loc = False
        box.save(update_fields=["require_loc"])

        response = self.client.get(reverse("box-preview"), {"boxSlug": box.url})

        self.assertEqual(response.status_code, 200)
        self.assertIs(response.data["require_loc"], False)

    def test_session_payload_box_identity_returns_require_loc(self):
        user = self.make_user(username="identity-user")
        box = self.make_box(url="box-identity-loc", name="Box identity loc")
        box.require_loc = False
        box.save(update_fields=["require_loc"])
        session = open_box_session_for_user(user, box)

        payload = session_payload_for_box(session, box)

        self.assertIs(payload["box"]["require_loc"], False)

    def test_box_session_post_refuses_box_that_requires_location(self):
        box = self.make_box(url="box-requires-loc", name="Box requires loc")

        response = self.client.post(reverse("box-session"), {"boxSlug": box.url}, format="json")

        self.assert_api_error(response, 403, "BOX_LOCATION_REQUIRED")
        self.assertFalse(BoxSession.objects.filter(box=box).exists())

    def test_box_session_post_opens_session_without_coordinates_when_location_not_required(self):
        box = self.make_box(url="box-no-loc", name="Box no loc")
        box.require_loc = False
        box.save(update_fields=["require_loc"])

        response = self.client.post(reverse("box-session"), {"boxSlug": box.url}, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["active"])
        self.assertIs(response.data["box"]["require_loc"], False)
        self.assertIsNotNone(response.data["session"])
        self.assertIsNotNone(response.data["current_user"])
        self.assertEqual(BoxSession.objects.filter(box=box).count(), 1)

    def test_verify_location_rejects_invalid_coordinates(self):
        box = self.make_box(url="box-invalid-coordinates", name="Box invalid coordinates")

        response = self.client.post(
            reverse("verify-location"),
            {"boxSlug": box.url, "latitude": "not-a-latitude", "longitude": -1.5536},
            format="json",
        )

        self.assert_api_error(response, 400, "INVALID_COORDINATES")
        self.assertFalse(BoxSession.objects.filter(box=box).exists())

    def test_verify_location_still_opens_session_for_required_box_with_valid_coordinates(self):
        box = self.make_box(url="box-valid-loc", name="Box valid loc")
        LocationPoint.objects.create(box=box, latitude=47.2184, longitude=-1.5536, dist_location=100)

        response = self.client.post(
            reverse("verify-location"),
            {"boxSlug": box.url, "latitude": 47.2184, "longitude": -1.5536},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["active"])
        self.assertIs(response.data["box"]["require_loc"], True)
        self.assertEqual(BoxSession.objects.filter(box=box).count(), 1)

    def test_verify_location_required_box_outside_allowed_range_keeps_existing_error(self):
        box = self.make_box(url="box-outside-range", name="Box outside range")
        LocationPoint.objects.create(box=box, latitude=47.2184, longitude=-1.5536, dist_location=10)

        response = self.client.post(
            reverse("verify-location"),
            {"boxSlug": box.url, "latitude": 48.8566, "longitude": 2.3522},
            format="json",
        )

        self.assert_api_error(response, 403, "OUTSIDE_ALLOWED_BOX_RANGE")
        self.assertFalse(BoxSession.objects.filter(box=box).exists())

    def test_verify_location_required_box_without_location_point_keeps_existing_error(self):
        box = self.make_box(url="box-missing-point", name="Box missing point")

        response = self.client.post(
            reverse("verify-location"),
            {"boxSlug": box.url, "latitude": 47.2184, "longitude": -1.5536},
            format="json",
        )

        self.assert_api_error(response, 404, "BOX_LOCATION_NOT_CONFIGURED")
        self.assertFalse(BoxSession.objects.filter(box=box).exists())

    def test_verify_location_does_not_require_location_point_when_box_location_not_required(self):
        box = self.make_box(url="box-verify-no-loc", name="Box verify no loc")
        box.require_loc = False
        box.save(update_fields=["require_loc"])

        response = self.client.post(
            reverse("verify-location"),
            {"boxSlug": box.url, "latitude": 0, "longitude": 0},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["active"])
        self.assertIs(response.data["box"]["require_loc"], False)
