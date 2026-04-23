from datetime import date, timedelta

from django.utils import timezone
from rest_framework.test import APITestCase

from box_management.models import Article, Box, BoxSession, Client, Deposit, Emoji, IncitationPhrase, Song, Sticker
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

    def assert_api_error(self, response, status_code, code):
        self.assertEqual(response.status_code, status_code)
        self.assertEqual(response.data.get("status"), status_code)
        self.assertEqual(response.data.get("code"), code)
        self.assertIn("title", response.data)
        self.assertIn("detail", response.data)


class FlowboxAPITestCase(APITestCase):
    def setUp(self):
        super().setUp()
        self._authed_user = None

    def make_user(self, *, username="user-test", points=0, is_guest=False):
        user = CustomUser.objects.create_user(username=username, password="testpass123")
        user.points = points
        user.is_guest = is_guest
        user.save(update_fields=["points", "is_guest"])
        return user

    def auth(self, user):
        self.client.force_authenticate(user=user)
        self._authed_user = user
        now = timezone.now()
        for box in Box.objects.all():
            BoxSession.objects.update_or_create(
                user=user,
                box=box,
                defaults={"started_at": now, "expires_at": now + timedelta(minutes=20)},
            )
        return user

    def make_client(self, *, name="Client test", slug="client-test"):
        return Client.objects.create(name=name, slug=slug)

    def make_box(self, *, url="box-test", name="Box test", client=None):
        box = Box.objects.create(url=url, name=name, client=client)
        if self._authed_user:
            now = timezone.now()
            BoxSession.objects.update_or_create(
                user=self._authed_user,
                box=box,
                defaults={"started_at": now, "expires_at": now + timedelta(minutes=20)},
            )
        return box

    def make_song(self, *, public_key="song-test", title="Song test", artists=None, duration=0):
        return Song.objects.create(
            public_key=public_key,
            title=title,
            artists_json=list(artists or ["Artist test"]),
            duration=duration,
        )

    def make_deposit(self, *, user, song, box=None, deposited_at=None, deposit_type=Deposit.DEPOSIT_TYPE_BOX, **kwargs):
        payload = {
            "user": user,
            "song": song,
            "box": box,
            "deposited_at": deposited_at or timezone.now(),
            "deposit_type": deposit_type,
        }
        payload.update(kwargs)
        if deposit_type == Deposit.DEPOSIT_TYPE_FAVORITE:
            payload["box"] = None
        return Deposit.objects.create(**payload)

    def make_emoji(self, *, char="🔥", cost=0, active=True):
        return Emoji.objects.create(char=char, cost=cost, active=active)

    def track_option(
        self,
        *,
        track_id="track-test",
        title="Track test",
        artists=None,
        provider_code="spotify",
        duration=0,
    ):
        return {
            "provider_code": provider_code,
            "provider_track_id": track_id,
            "id": track_id,
            "title": title,
            "name": title,
            "artists": list(artists or ["Artist test"]),
            "artist": ", ".join(list(artists or ["Artist test"])),
            "duration": duration,
            "provider_url": f"https://open.spotify.com/track/{track_id}",
            "url": f"https://open.spotify.com/track/{track_id}",
        }

    def assert_api_error(self, response, status_code, code):
        self.assertEqual(response.status_code, status_code)
        self.assertEqual(response.data.get("status"), status_code)
        self.assertEqual(response.data.get("code"), code)
        self.assertIn("title", response.data)
        self.assertIn("detail", response.data)
