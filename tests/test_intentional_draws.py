"""Unit tests for intentional draw logic."""

import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import unittest

from tournament.match import IntentionalDrawChecker
from tournament.player import Player


class TestIntentionalDrawChecker(unittest.TestCase):
    """Test intentional draw safety checking."""

    def test_final_round_safe_scenario(self):
        """
        Test that players are safe in final round when few enough can exceed them.

        Scenario: 4 players at 9 points, 10 at 6 points, round 5 of 5.
        The 9-point players should be safe to draw (will have 10 pts).
        Only the 6-point players (max 9 pts) can't exceed 10.
        """
        # Create players
        players = []

        # 4 players at 9 points
        for i in range(4):
            p = Player(i)
            p.points = 9
            players.append(p)

        # 10 players at 6 points
        for i in range(4, 14):
            p = Player(i)
            p.points = 6
            players.append(p)

        # 12 players at lower scores
        for i in range(14, 26):
            p = Player(i)
            p.points = 3
            players.append(p)

        # Check if players 0 and 1 can safely ID
        is_safe = IntentionalDrawChecker.is_safe_for_cut(
            player=players[0],
            opponent=players[1],
            all_players=players,
            cut_size=8,
            current_round=5,
            total_rounds=5,
        )

        # Should be safe: only 2 other 9-pt players can exceed 10 pts
        # (the 6-pt players can only reach 9)
        self.assertTrue(is_safe)

    def test_final_round_unsafe_scenario(self):
        """
        Test that players are NOT safe when too many can exceed them.

        Scenario: 10 players at 9+ points after round 4 of 5.
        Not all can safely ID for Top 8.
        """
        players = []

        # 2 players at 12 points
        for i in range(2):
            p = Player(i)
            p.points = 12
            players.append(p)

        # 8 players at 9 points
        for i in range(2, 10):
            p = Player(i)
            p.points = 9
            players.append(p)

        # 22 players at lower scores
        for i in range(10, 32):
            p = Player(i)
            p.points = 6
            players.append(p)

        # Check if a 9-point player can safely ID
        is_safe = IntentionalDrawChecker.is_safe_for_cut(
            player=players[2],  # 9-point player
            opponent=players[3],  # another 9-point player
            all_players=players,
            cut_size=8,
            current_round=5,
            total_rounds=5,
        )

        # Should NOT be safe:
        # - 2 players at 12 pts can reach 15
        # - 6 other players at 9 pts (excluding us and opponent) can reach 12
        # Total: 8 players could exceed 10, and 8 is not < 8
        self.assertFalse(is_safe)

    def test_penultimate_round_safe(self):
        """Test ID safety in round 4 of 5: safe only if X-0-2 beats max 9th place."""
        players = []

        # 4 players at 12 points — if they ID now and in R5, they have 14
        for i in range(4):
            p = Player(i)
            p.points = 12
            players.append(p)

        # 10 players at 6 points — 8th-best other is at 6; max 9th = 6+6 = 12
        for i in range(4, 14):
            p = Player(i)
            p.points = 6
            players.append(p)

        for i in range(14, 26):
            p = Player(i)
            p.points = 3
            players.append(p)

        is_safe = IntentionalDrawChecker.is_safe_for_cut(
            player=players[0],
            opponent=players[1],
            all_players=players,
            cut_size=8,
            current_round=4,
            total_rounds=5,
        )

        # 14 (our score after two draws) > 12 (max 9th place), so safe
        self.assertTrue(is_safe)

    def test_penultimate_round_safe_with_swiss_constraint(self):
        """9-point players in R4 of 5: X-0-2 = 11; with Swiss only ~half of 6pt group
        can win each round, so max 7th-highest among others is 9, not 12 → safe."""
        players = []
        for i in range(4):
            p = Player(i)
            p.points = 9
            players.append(p)
        for i in range(4, 14):
            p = Player(i)
            p.points = 6
            players.append(p)
        for i in range(14, 26):
            p = Player(i)
            p.points = 3
            players.append(p)

        is_safe = IntentionalDrawChecker.is_safe_for_cut(
            player=players[0],
            opponent=players[1],
            all_players=players,
            cut_size=8,
            current_round=4,
            total_rounds=5,
        )
        self.assertTrue(is_safe)

    def test_early_round_not_safe(self):
        """Test that IDs don't happen too early."""
        players = []

        # Even with good standings in round 2, shouldn't ID
        for i in range(4):
            p = Player(i)
            p.points = 3  # 1-0
            players.append(p)

        for i in range(4, 32):
            p = Player(i)
            p.points = 0  # 0-1
            players.append(p)

        is_safe = IntentionalDrawChecker.is_safe_for_cut(
            player=players[0],
            opponent=players[1],
            all_players=players,
            cut_size=8,
            current_round=2,
            total_rounds=5,
        )

        # Too early - many players could still catch up
        self.assertFalse(is_safe)

    def test_edge_case_exactly_cut_size_threats(self):
        """Test boundary condition where threats exactly equal cut size."""
        players = []

        # Create scenario where exactly 8 players could exceed score
        # 1 player at 12 pts
        p = Player(0)
        p.points = 12
        players.append(p)

        # 2 players at 9 pts considering ID
        for i in range(1, 3):
            p = Player(i)
            p.points = 9
            players.append(p)

        # 14 more at 9 pts (total 16 at 9pts)
        # This way we have 1 at 12pts + 14 others at 9pts = 15 who could exceed 10
        # But with grouping: (14+1)//2 = 7 from the 9pt group + 1 from 12pt = 8
        for i in range(3, 17):
            p = Player(i)
            p.points = 9
            players.append(p)

        # Others lower
        for i in range(17, 32):
            p = Player(i)
            p.points = 3
            players.append(p)

        is_safe = IntentionalDrawChecker.is_safe_for_cut(
            player=players[1],
            opponent=players[2],
            all_players=players,
            cut_size=8,
            current_round=5,
            total_rounds=5,
        )

        # With exactly 8 threats, should NOT be safe (need < 8)
        self.assertFalse(is_safe)


if __name__ == "__main__":
    unittest.main()
