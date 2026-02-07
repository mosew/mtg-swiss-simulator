"""Tournament management and simulation."""

import random
from typing import Callable, Dict, List, Optional, Tuple

from .match import MatchResult, MatchSimulator
from .pairing import SwissPairing
from .player import Player


def count_players_at_top(ranked_players: List[Player]) -> int:
    """Return how many players are tied for first (by points). 1 = sole leader."""
    if not ranked_players:
        return 0
    top_points = ranked_players[0].points
    count = 0
    for p in ranked_players:
        if p.points != top_points:
            break
        count += 1
    return count


class Tournament:
    """Manages a Swiss-style tournament."""

    def __init__(
        self,
        num_players: int,
        num_rounds: int,
        draw_percent: float = 2.0,
        allow_intentional_draws: bool = False,
        cut_size: int = 8,
    ):
        """
        Initialize a tournament.

        Args:
            num_players: Number of players
            num_rounds: Number of rounds to play
            draw_percent: Percentage chance of unintentional draw (0-100)
            allow_intentional_draws: Whether to allow intentional draws
            cut_size: Size of cut for intentional draw calculations
        """
        self.num_players = num_players
        self.num_rounds = num_rounds
        self.draw_percent = draw_percent
        self.allow_intentional_draws = allow_intentional_draws
        self.cut_size = cut_size

        # Create players
        self.players: Dict[int, Player] = {i: Player(i) for i in range(num_players)}

        # Track current round
        self.current_round = 0

        # Store match outcomes for deterministic simulation
        self.match_outcomes: Dict[tuple, float] = {}

    def get_random_outcome(self, p1: Player, p2: Player) -> float:
        """Get or generate random outcome for a match."""
        if p2 is None:
            return 0.0

        key = (min(p1.id, p2.id), max(p1.id, p2.id))
        if key not in self.match_outcomes:
            self.match_outcomes[key] = random.random() * 100
        return self.match_outcomes[key]

    def play_round(self) -> List[MatchResult]:
        """Play one round of the tournament."""
        self.current_round += 1

        # Pair players
        player_list = list(self.players.values())
        pairs = SwissPairing.pair_round(player_list)

        # Simulate matches
        results = []
        for p1, p2 in pairs:
            random_value = self.get_random_outcome(p1, p2)

            result = MatchSimulator.simulate_match(
                p1,
                p2,
                random_value,
                self.draw_percent,
                allow_intentional_draws=self.allow_intentional_draws,
                all_players=player_list,
                current_round=self.current_round,
                total_rounds=self.num_rounds,
                cut_size=self.cut_size,
            )

            MatchSimulator.apply_result(result)
            results.append(result)

        return results

    def play_all_rounds(self) -> List[Player]:
        """Play all rounds and return final rankings."""
        for _ in range(self.num_rounds):
            self.play_round()

        return self.get_final_standings()

    def get_final_standings(self) -> List[Player]:
        """Get final standings (ranked by points, OWP, ID)."""
        return SwissPairing.rank_players(list(self.players.values()))

    def get_players_list(self) -> List[Player]:
        """Get current list of all players."""
        return list(self.players.values())

    def count_intentional_draws_in_round(self, round_results: List[MatchResult]) -> int:
        """Count intentional draws in a round's results."""
        return sum(1 for r in round_results if r.is_draw and r.is_intentional)


class TournamentSimulation:
    """Runs multiple tournament simulations."""

    @staticmethod
    def run_simulations(
        num_players: int,
        num_rounds: int,
        draw_percent: float,
        num_simulations: int,
        allow_intentional_draws: bool = False,
        cut_size: int = 8,
        seed: Optional[int] = None,
    ) -> List[List[Player]]:
        """
        Run multiple tournaments with the same parameters.

        Returns:
            List of final standings (one per tournament)
        """
        if seed is not None:
            random.seed(seed)

        results = []
        for _ in range(num_simulations):
            tournament = Tournament(
                num_players,
                num_rounds,
                draw_percent,
                allow_intentional_draws=allow_intentional_draws,
                cut_size=cut_size,
            )
            final_standings = tournament.play_all_rounds()
            results.append(final_standings)

        return results

    @staticmethod
    def analyze_intentional_draws_per_round(
        num_players: int,
        num_rounds: int,
        draw_percent: float,
        num_simulations: int,
        cut_size: int = 8,
        seed: Optional[int] = None,
    ) -> Dict[int, Dict[int, int]]:
        """
        Analyze distribution of intentional draws per round.

        Returns:
            Dict mapping round_number -> {id_count -> frequency}
        """
        if seed is not None:
            random.seed(seed)

        # Store counts: per_round_counts[round_num] = [counts from each sim]
        per_round_counts: Dict[int, List[int]] = {
            r: [] for r in range(1, num_rounds + 1)
        }

        for _ in range(num_simulations):
            tournament = Tournament(
                num_players,
                num_rounds,
                draw_percent,
                allow_intentional_draws=True,
                cut_size=cut_size,
            )

            for round_num in range(1, num_rounds + 1):
                round_results = tournament.play_round()
                id_count = tournament.count_intentional_draws_in_round(round_results)
                per_round_counts[round_num].append(id_count)

        # Convert to distribution: {round -> {count -> frequency}}
        distributions = {}
        for round_num, counts in per_round_counts.items():
            dist = {}
            for count in counts:
                dist[count] = dist.get(count, 0) + 1
            distributions[round_num] = dist

        return distributions

    @staticmethod
    def run_with_round_snapshots(
        num_players: int,
        max_rounds: int,
        draw_percent: float,
        num_simulations: int,
        seed: Optional[int] = None,
    ) -> Tuple[Dict[int, List[int]], dict]:
        """
        Run simulations through max_rounds, recording count_players_at_top after each round.

        Returns:
            count_at_top_per_round: dict[round_number] -> list of length num_simulations
            params: dict with players, rounds, draw_percent, simulations
        """
        if seed is not None:
            random.seed(seed)

        per_round_counts: Dict[int, List[int]] = {
            r: [] for r in range(1, max_rounds + 1)
        }

        for _ in range(num_simulations):
            tournament = Tournament(
                num_players,
                max_rounds,
                draw_percent,
                allow_intentional_draws=False,
            )
            for round_num in range(1, max_rounds + 1):
                tournament.play_round()
                standings = tournament.get_final_standings()
                per_round_counts[round_num].append(count_players_at_top(standings))

        return per_round_counts, {
            "players": num_players,
            "rounds": max_rounds,
            "draw_percent": draw_percent,
            "simulations": num_simulations,
        }
