from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from box_management.models import Box, Client, Deposit, DiscoveredSong, Emoji, Song


User = get_user_model()


class FlowboxAPITestCase(APITestCase):
    def make_user(self, *, username: str = "user", points: int = 0, is_guest: bool = False, client=None, client_role: str = ""):
        user = User.objects.create_user(
            username=username,
            password="testpass123",
            email=f"{username}@example.com",
            is_guest=is_guest,
            points=points,
            client=client,
            client_role=client_role,
        )
        return user

    def auth(self, user):
        self.client.force_authenticate(user=user)
        return user

    def unauth(self):
        self.client.force_authenticate(user=None)

    def make_client(self, *, name: str = "Client", slug: str = "client"):
        return Client.objects.create(name=name, slug=slug)

    def make_box(self, *, url: str = "box-test", name: str = "Box test", client=None):
        return Box.objects.create(url=url, name=name, client=client)

    def make_song(self, *, public_key: str = "song_pk", title: str = "Track", artists=None, duration: int = 180, n_deposits: int = 0):
        return Song.objects.create(
            public_key=public_key,
            title=title,
            artists_json=list(artists or ["Artist"]),
            duration=duration,
            n_deposits=n_deposits,
        )

    def make_deposit(
        self,
        *,
        user,
        song,
        box=None,
        deposit_type: str = Deposit.DEPOSIT_TYPE_BOX,
        public_key: str | None = None,
        deposited_at=None,
        pin_duration_minutes=None,
        pin_points_spent: int = 0,
        pin_expires_at=None,
    ):
        deposit = Deposit.objects.create(
            user=user,
            song=song,
            box=box,
            deposit_type=deposit_type,
            public_key=public_key or Deposit._generate_unique_key(),
            deposited_at=deposited_at or timezone.now(),
            pin_duration_minutes=pin_duration_minutes,
            pin_points_spent=pin_points_spent,
            pin_expires_at=pin_expires_at,
        )
        return deposit

    def make_revealed_for(self, *, user, deposit, context: str = "box"):
        return DiscoveredSong.objects.create(user=user, deposit=deposit, discovered_type="revealed", context=context)

    def make_emoji(self, *, char: str = "🔥", cost: int = 0, active: bool = True):
        return Emoji.objects.create(char=char, cost=cost, active=active)

    def track_option(
        self,
        *,
        track_id: str = "track-1",
        title: str = "Track",
        artists=None,
        provider_code: str = "spotify",
        duration: int = 180,
        image_url: str = "",
        image_url_small: str = "",
    ):
        return {
            "provider_code": provider_code,
            "id": track_id,
            "provider_track_id": track_id,
            "title": title,
            "artists": list(artists or ["Artist"]),
            "duration": duration,
            "image_url": image_url,
            "image_url_small": image_url_small,
        }

    def assert_api_error(self, response, expected_status: int, expected_code: str):
        self.assertEqual(response.status_code, expected_status)
        self.assertEqual(response.data.get("status"), expected_status)
        self.assertEqual(response.data.get("code"), expected_code)
        self.assertIn("title", response.data)
        self.assertIn("detail", response.data)

    def make_old(self, dt, *, seconds=0, minutes=0, hours=0, days=0):
        return dt - timedelta(seconds=seconds, minutes=minutes, hours=hours, days=days)
