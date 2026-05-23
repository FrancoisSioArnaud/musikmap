from django.test import SimpleTestCase

from box_management.models import SongProviderLink
from box_management.provider_services import normalize_spotify_track, serialize_provider_link


class SpotifyProviderUrlTests(SimpleTestCase):
    def test_normalize_spotify_track_prefers_track_external_url(self):
        payload = normalize_spotify_track(
            {
                "id": "track123",
                "name": "Song",
                "artists": [{"name": "Artist"}],
                "external_urls": {"spotify": "https://open.spotify.com/track/track123"},
                "album": {
                    "images": [],
                    "external_urls": {"spotify": "https://open.spotify.com/album/album999"},
                },
            }
        )

        self.assertEqual(payload["provider_url"], "https://open.spotify.com/track/track123")

    def test_serialize_provider_link_uses_track_url_when_track_id_exists_and_url_is_album(self):
        link = SongProviderLink(
            provider_code="spotify",
            provider_track_id="track456",
            provider_url="https://open.spotify.com/album/album456",
            status=SongProviderLink.STATUS_RESOLVED,
        )

        payload = serialize_provider_link(link)

        self.assertEqual(payload["provider_url"], "https://open.spotify.com/track/track456")

    def test_serialize_provider_link_keeps_non_track_url_when_track_id_missing(self):
        link = SongProviderLink(
            provider_code="spotify",
            provider_track_id="",
            provider_url="https://open.spotify.com/album/album-no-track-id",
            status=SongProviderLink.STATUS_RESOLVED,
        )

        payload = serialize_provider_link(link)

        self.assertEqual(payload["provider_url"], "https://open.spotify.com/album/album-no-track-id")
