from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from box_management.models import Box, Comment, Deposit, DiscoveredSong, Emoji, Reaction, SongProviderLink
from box_management.services.seeding.activity_simulation import PERSONAS
from private_messages.models import ChatMessage


def fake_spotify_search(_provider_code, query):
    safe_id = query.lower().replace(" ", "-").replace("'", "")[:40]
    return [
        {
            "provider_code": "spotify",
            "provider_track_id": f"seed-{safe_id}",
            "provider_url": f"https://open.spotify.com/track/seed-{safe_id}",
            "provider_uri": f"spotify:track:seed-{safe_id}",
            "title": f"{query} title",
            "artists": [f"{query} artist"],
            "duration": 215,
            "isrc": "",
            "image_url": "https://i.scdn.co/image/large-seed",
            "image_url_small": "https://i.scdn.co/image/small-seed",
        }
    ]


class SeedActivityCommandTests(TestCase):
    def setUp(self):
        Box.objects.create(name="Chantier naval", url="chantier-naval")
        Box.objects.create(name="Hôpital Bellier", url="hopital-bellier")
        for char in ["🔥", "🎶", "😎"]:
            Emoji.objects.create(char=char, active=True, cost=0)

    @patch("box_management.services.seeding.activity_simulation.backend_search_tracks", side_effect=fake_spotify_search)
    def test_command_creates_activity_for_default_boxes(self, _mock_search):
        out = StringIO()
        call_command("seed_activity", "--days", "2", "--intensity", "low", "--seed", "42", stdout=out)

        self.assertGreater(Deposit.objects.count(), 0)
        self.assertGreater(DiscoveredSong.objects.count(), 0)
        self.assertGreater(Reaction.objects.count(), 0)
        self.assertGreater(Comment.objects.count(), 0)
        self.assertGreater(ChatMessage.objects.count(), 0)

        text = out.getvalue()
        self.assertIn("box=chantier-naval", text)
        self.assertIn("box=hopital-bellier", text)

    @patch("box_management.services.seeding.activity_simulation.backend_search_tracks", side_effect=fake_spotify_search)
    def test_command_is_cumulative(self, _mock_search):
        call_command("seed_activity", "--days", "1", "--intensity", "low", "--seed", "7")
        deposits_first = Deposit.objects.count()
        messages_first = ChatMessage.objects.count()

        call_command("seed_activity", "--days", "1", "--intensity", "low", "--seed", "8")

        self.assertGreater(Deposit.objects.count(), deposits_first)
        self.assertGreater(ChatMessage.objects.count(), messages_first)

    @patch("box_management.services.seeding.activity_simulation.backend_search_tracks", side_effect=fake_spotify_search)
    def test_persona_music_coherence(self, _mock_search):
        call_command("seed_activity", "--days", "1", "--intensity", "medium", "--seed", "99")

        allowed_queries_by_username = {
            persona["username"]: {f"{title} {artist}" for title, artist in persona["songs"]} for persona in PERSONAS
        }

        for deposit in Deposit.objects.select_related("user", "song").all():
            username = deposit.user.username
            if username not in allowed_queries_by_username:
                continue
            matching = [
                query for query in allowed_queries_by_username[username] if deposit.song.title.startswith(query)
            ]
            self.assertTrue(matching)

    @patch("box_management.services.seeding.activity_simulation.backend_search_tracks", side_effect=fake_spotify_search)
    def test_seeded_songs_have_spotify_visual_metadata(self, _mock_search):
        call_command("seed_activity", "--days", "1", "--intensity", "low", "--seed", "13")

        song_link = SongProviderLink.objects.filter(provider_code="spotify").select_related("song").first()
        self.assertIsNotNone(song_link)
        self.assertTrue(song_link.provider_track_id)
        self.assertTrue(song_link.provider_url)
        self.assertTrue(song_link.song.image_url)
        self.assertTrue(song_link.song.image_url_small)
        self.assertGreater(song_link.song.duration, 0)

    def test_persona_population_is_dense_enough(self):
        self.assertGreaterEqual(len(PERSONAS), 12)

    def test_missing_box_fails_cleanly(self):
        with self.assertRaises(CommandError):
            call_command("seed_activity", "--boxes", "box-inexistante")
