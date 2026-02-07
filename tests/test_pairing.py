"""Unit tests for Swiss pairing logic."""

import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import unittest

from tournament.pairing import SwissPairing
from tournament.player import Player


class TestSwissPairing(unittest.TestCase):
    """Test Swiss pairing functionality."""

    def test_pair_round_even_players(self):
        """Test pairing with even number of players."""
        players = [Player(i) for i in range(8)]

        # Set some different scores
        players[0].points = 6
        players[1].points = 6
        players[2].points = 3
        players[3].points = 3
        players[4].points = 3
        players[5].points = 0
        players[6].points = 0
        players[7].points = 0

        pairs = SwissPairing.pair_round(players)

        # Should have 4 pairs, no byes
        self.assertEqual(len(pairs), 4)
        self.assertTrue(all(p2 is not None for p1, p2 in pairs))

        # Top players should be paired together
        pair_ids = {(p1.id, p2.id) for p1, p2 in pairs}
        # Players 0 and 1 (both at 6 pts) should be paired
        self.assertIn((0, 1), pair_ids)

    def test_pair_round_odd_players(self):
        """Test pairing with odd number of players (bye)."""
        players = [Player(i) for i in range(7)]

        pairs = SwissPairing.pair_round(players)

        # Should have 4 pairs (3 matches + 1 bye)
        self.assertEqual(len(pairs), 4)

        # Exactly one should be a bye
        byes = [p1 for p1, p2 in pairs if p2 is None]
        self.assertEqual(len(byes), 1)

        # Lowest-ranked player should get the bye
        self.assertEqual(byes[0].id, 6)

    def test_rank_players_by_points(self):
        """Test that ranking prioritizes points."""
        players = []

        # Create players with different records
        p1 = Player(1)
        p1.points = 9  # 3-0

        p2 = Player(2)
        p2.points = 6  # 2-1

        p3 = Player(3)
        p3.points = 12  # 4-0

        players = [p1, p2, p3]
        ranked = SwissPairing.rank_players(players)

        # Should be ordered by points: p3, p1, p2
        self.assertEqual([p.id for p in ranked], [3, 1, 2])

    def test_rank_players_with_tiebreaker(self):
        """Test that ranking uses OWP as tiebreaker."""
        # Create a scenario where OWP matters
        p1 = Player(1)
        p1.points = 6
        p1.wins = 2
        p1.losses = 1
        p1.opponents = [10, 11]  # Will set these up

        p2 = Player(2)
        p2.points = 6
        p2.wins = 2
        p2.losses = 1
        p2.opponents = [12, 13]

        # Create opponent players
        # p1's opponents have better records
        opp10 = Player(10)
        opp10.wins = 3
        opp10.losses = 0

        opp11 = Player(11)
        opp11.wins = 2
        opp11.losses = 1

        # p2's opponents have worse records
        opp12 = Player(12)
        opp12.wins = 1
        opp12.losses = 2

        opp13 = Player(13)
        opp13.wins = 0
        opp13.losses = 3

        players = [p1, p2, opp10, opp11, opp12, opp13]
        ranked = SwissPairing.rank_players(players)

        # p1 should rank higher than p2 due to better OWP
        p1_rank = next(i for i, p in enumerate(ranked) if p.id == 1)
        p2_rank = next(i for i, p in enumerate(ranked) if p.id == 2)
        self.assertLess(p1_rank, p2_rank)

    def test_rank_players_id_as_final_tiebreaker(self):
        """Test that ID is used when points and OWP are tied."""
        p1 = Player(1)
        p1.points = 6

        p2 = Player(2)
        p2.points = 6

        p3 = Player(3)
        p3.points = 6

        players = [p3, p1, p2]  # Out of order
        ranked = SwissPairing.rank_players(players)

        # Should be ordered by ID when everything else is equal
        self.assertEqual([p.id for p in ranked], [1, 2, 3])


if __name__ == "__main__":
    unittest.main()
