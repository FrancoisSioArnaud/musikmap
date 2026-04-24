from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from box_management.models import Box, Comment, Deposit, DiscoveredSong, Emoji, Reaction, SongProviderLink
from box_management.provider_services import ProviderRateLimitError
from box_management.services.seeding.activity_simulation import PERSONAS
from private_messages.models import ChatMessage


class SeedActivityCommandTests(TestCase):
    def setUp(self):
        Box.objects.create(name="Chantier naval", url="chantier-naval")
        Box.objects.create(name="Hôpital Bellier", url="hopital-bellier")
        for char in ["🔥", "🎶", "😎"]:
            Emoji.objects.create(char=char, active=True, cost=0)

    def test_command_creates_activity_for_default_boxes(self):
        out = StringIO()
        with patch(
            "box_management.services.seeding.activity_simulation.backend_search_tracks_strict",
            side_effect=_search_side_effect_from_query,
        ):
            call_command("seed_activity", "--days", "2", "--intensity", "low", "--seed", "42", stdout=out)

        self.assertGreater(Deposit.objects.count(), 0)
        self.assertGreater(DiscoveredSong.objects.count(), 0)
        self.assertGreater(Reaction.objects.count(), 0)
        self.assertGreater(Comment.objects.count() + ChatMessage.objects.count(), 0)

        text = out.getvalue()
        self.assertIn("box=chantier-naval", text)
        self.assertIn("box=hopital-bellier", text)

    def test_command_is_cumulative(self):
        with patch(
            "box_management.services.seeding.activity_simulation.backend_search_tracks_strict",
            side_effect=_search_side_effect_from_query,
        ):
            call_command("seed_activity", "--days", "1", "--intensity", "low", "--seed", "7")
        deposits_first = Deposit.objects.count()
        messages_first = ChatMessage.objects.count()

        with patch(
            "box_management.services.seeding.activity_simulation.backend_search_tracks_strict",
            side_effect=_search_side_effect_from_query,
        ):
            call_command("seed_activity", "--days", "1", "--intensity", "low", "--seed", "8")

        self.assertGreater(Deposit.objects.count(), deposits_first)
        self.assertGreater(ChatMessage.objects.count(), messages_first)

    def test_persona_music_coherence(self):
        with patch(
            "box_management.services.seeding.activity_simulation.backend_search_tracks_strict",
            side_effect=_search_side_effect_from_query,
        ):
            call_command("seed_activity", "--days", "1", "--intensity", "medium", "--seed", "99")

        allowed_titles = {title for persona in PERSONAS for title, _ in persona["songs"]}
        allowed_artists = {artist for persona in PERSONAS for _, artist in persona["songs"]}

        for deposit in Deposit.objects.select_related("user", "song").all():
            self.assertTrue(
                deposit.song.title in allowed_titles
                or deposit.song.artist in allowed_artists
            )

    def test_missing_box_fails_cleanly(self):
        with self.assertRaises(CommandError):
            call_command("seed_activity", "--boxes", "box-inexistante")

    def test_dry_run_has_no_write_and_no_spotify_call(self):
        with patch("box_management.services.seeding.activity_simulation.backend_search_tracks_strict") as mocked:
            call_command("seed_activity", "--days", "2", "--intensity", "low", "--dry-run")

        self.assertEqual(Deposit.objects.count(), 0)
        self.assertEqual(ChatMessage.objects.count(), 0)
        mocked.assert_not_called()

    def test_created_song_is_complete_and_has_spotify_link(self):
        with patch(
            "box_management.services.seeding.activity_simulation.backend_search_tracks_strict",
            side_effect=_search_side_effect_from_query,
        ):
            call_command("seed_activity", "--days", "1", "--intensity", "low", "--seed", "11")

        deposit = Deposit.objects.select_related("song").first()
        self.assertIsNotNone(deposit)
        self.assertGreater(deposit.song.duration, 0)
        self.assertTrue(deposit.song.artists_json)
        self.assertTrue(deposit.song.image_url or deposit.song.image_url_small)
        self.assertTrue(
            SongProviderLink.objects.filter(
                song=deposit.song,
                provider_code="spotify",
                status=SongProviderLink.STATUS_RESOLVED,
            ).exists()
        )

    def test_rate_limit_then_retry_success(self):
        state = {"calls": 0}

        def _rate_limited_once(_provider, _query):
            state["calls"] += 1
            if state["calls"] == 1:
                raise ProviderRateLimitError("rate limited", provider_code="spotify", retry_after=1)
            return [_spotify_track(track_id=f"spotify-track-{state['calls']}")]

        with (
            patch(
                "box_management.services.seeding.activity_simulation.backend_search_tracks_strict",
                side_effect=_rate_limited_once,
            ),
            patch("box_management.services.seeding.activity_simulation.time.sleep") as mocked_sleep,
        ):
            call_command("seed_activity", "--days", "1", "--intensity", "low", "--seed", "5")

        self.assertGreater(Deposit.objects.count(), 0)
        mocked_sleep.assert_called()


def _spotify_track(*, title="Amour plastique", artists=None, track_id="spotify-track-1"):
    return {
        "provider_code": "spotify",
        "provider_track_id": track_id,
        "provider_url": f"https://open.spotify.com/track/{track_id}",
        "provider_uri": f"spotify:track:{track_id}",
        "title": title,
        "artists": artists or ["Videoclub"],
        "duration": 188,
        "isrc": "FRX123456789",
        "image_url": "https://img.example.com/cover_300.jpg",
        "image_url_small": "https://img.example.com/cover_64.jpg",
    }


def _search_side_effect_from_query(_provider, query):
    value = (query or "").strip()
    for persona in PERSONAS:
        for title, artist in persona["songs"]:
            if value == f"{title} {artist}":
                track_id = f"id-{title}-{artist}".replace(" ", "-")
                return [_spotify_track(title=title, artists=[artist], track_id=track_id)]
    return [_spotify_track(title=value, artists=["Artiste"], track_id=f"id-{value}".replace(" ", "-"))]
