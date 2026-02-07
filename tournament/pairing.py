"""Swiss pairing logic."""

from typing import List, Optional, Tuple

from .player import Player


class SwissPairing:
    """Handles Swiss-style tournament pairing."""

    @staticmethod
    def pair_round(players: List[Player]) -> List[Tuple[Player, Optional[Player]]]:
        """
        Pair players by score (descending), then by ID.
        Returns list of (player1, player2) tuples, where player2 may be None for bye.
        """
        sorted_players = sorted(
            players,
            key=lambda p: (-p.points, p.id),
        )

        pairs = []
        used = set()

        for i, p1 in enumerate(sorted_players):
            if p1.id in used:
                continue

            # Try to find a partner
            for p2 in sorted_players[i + 1 :]:
                if p2.id not in used:
                    pairs.append((p1, p2))
                    used.add(p1.id)
                    used.add(p2.id)
                    break
            else:
                # No partner found -> bye
                pairs.append((p1, None))
                used.add(p1.id)

        return pairs

    @staticmethod
    def rank_players(players: List[Player]) -> List[Player]:
        """
        Sort players by points (desc), opponent win % (desc), then ID (asc).
        Updates opponent win percentage before sorting.
        """
        # Build lookup dict
        players_by_id = {p.id: p for p in players}

        # Calculate opponent win percentages
        for p in players:
            p.calculate_opponent_win_percentage(players_by_id)

        # Sort by points, OWP, ID
        return sorted(
            players,
            key=lambda p: (-p.points, -p.opponent_win_percentage, p.id),
        )
