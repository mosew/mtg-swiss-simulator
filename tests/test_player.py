"""Unit tests for Player class."""

import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import unittest

from tournament.player import Player


class TestPlayer(unittest.TestCase):
    """Test Player class functionality."""

    def test_player_initialization(self):
        """Test that a player initializes with correct default values."""
        player = Player(5)
        self.assertEqual(player.id, 5)
        self.assertEqual(player.points, 0)
        self.assertEqual(player.wins, 0)
        self.assertEqual(player.losses, 0)
        self.assertEqual(player.draws, 0)
        self.assertEqual(player.opponents, [])
        self.assertEqual(player.opponent_win_percentage, 0.0)

    def test_add_win(self):
        """Test recording a win."""
        player = Player(1)
        player.add_win(opponent_id=2)

        self.assertEqual(player.wins, 1)
        self.assertEqual(player.points, 3)
        self.assertEqual(player.opponents, [2])

    def test_add_loss(self):
        """Test recording a loss."""
        player = Player(1)
        player.add_loss(opponent_id=2)

        self.assertEqual(player.losses, 1)
        self.assertEqual(player.points, 0)
        self.assertEqual(player.opponents, [2])

    def test_add_draw(self):
        """Test recording a draw."""
        player = Player(1)
        player.add_draw(opponent_id=2)

        self.assertEqual(player.draws, 1)
        self.assertEqual(player.points, 1)
        self.assertEqual(player.opponents, [2])

    def test_get_record_string_no_draws(self):
        """Test record string without draws."""
        player = Player(1)
        player.add_win(2)
        player.add_win(3)
        player.add_loss(4)

        self.assertEqual(player.get_record_string(), "2-1")

    def test_get_record_string_with_draws(self):
        """Test record string with draws."""
        player = Player(1)
        player.add_win(2)
        player.add_draw(3)
        player.add_loss(4)

        self.assertEqual(player.get_record_string(), "1-1-1")

    def test_calculate_opponent_win_percentage(self):
        """Test OWP calculation."""
        # Create players
        p1 = Player(1)
        p2 = Player(2)
        p3 = Player(3)

        # p1 played p2 and p3
        p1.add_win(2)
        p1.add_win(3)

        # p2 is 2-0
        p2.add_win(4)
        p2.add_win(5)

        # p3 is 1-1
        p3.add_win(4)
        p3.add_loss(5)

        players = {1: p1, 2: p2, 3: p3}

        # p1's OWP should be average of p2's (1.0) and p3's (0.5) = 0.75
        owp = p1.calculate_opponent_win_percentage(players)
        self.assertAlmostEqual(owp, 0.75)

    def test_to_dict_and_from_dict(self):
        """Test conversion to/from dictionary."""
        player = Player(1)
        player.add_win(2)
        player.add_draw(3)
        player.opponent_win_percentage = 0.6

        # Convert to dict
        data = player.to_dict()
        self.assertEqual(data["id"], 1)
        self.assertEqual(data["wins"], 1)
        self.assertEqual(data["draws"], 1)
        self.assertEqual(data["points"], 4)

        # Convert back
        player2 = Player.from_dict(data)
        self.assertEqual(player2.id, 1)
        self.assertEqual(player2.wins, 1)
        self.assertEqual(player2.draws, 1)
        self.assertEqual(player2.points, 4)
        self.assertAlmostEqual(player2.opponent_win_percentage, 0.6)


if __name__ == "__main__":
    unittest.main()
