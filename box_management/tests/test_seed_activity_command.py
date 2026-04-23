from io import StringIO

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from box_management.models import Box, Comment, Deposit, DiscoveredSong, Emoji, Reaction
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
        call_command("seed_activity", "--days", "2", "--intensity", "low", "--seed", "42", stdout=out)

        self.assertGreater(Deposit.objects.count(), 0)
        self.assertGreater(DiscoveredSong.objects.count(), 0)
        self.assertGreater(Reaction.objects.count(), 0)
        self.assertGreater(Comment.objects.count(), 0)
        self.assertGreater(ChatMessage.objects.count(), 0)

        text = out.getvalue()
        self.assertIn("box=chantier-naval", text)
        self.assertIn("box=hopital-bellier", text)

    def test_command_is_cumulative(self):
        call_command("seed_activity", "--days", "1", "--intensity", "low", "--seed", "7")
        deposits_first = Deposit.objects.count()
        messages_first = ChatMessage.objects.count()

        call_command("seed_activity", "--days", "1", "--intensity", "low", "--seed", "8")

        self.assertGreater(Deposit.objects.count(), deposits_first)
        self.assertGreater(ChatMessage.objects.count(), messages_first)

    def test_persona_music_coherence(self):
        call_command("seed_activity", "--days", "1", "--intensity", "medium", "--seed", "99")

        allowed_by_username = {persona["username"]: {artist for _, artist in persona["songs"]} for persona in PERSONAS}

        for deposit in Deposit.objects.select_related("user", "song").all():
            username = deposit.user.username
            if username not in allowed_by_username:
                continue
            self.assertIn(deposit.song.artist, allowed_by_username[username])

    def test_missing_box_fails_cleanly(self):
        with self.assertRaises(CommandError):
            call_command("seed_activity", "--boxes", "box-inexistante")
