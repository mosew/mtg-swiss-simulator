"""Tournament management and simulation."""

import random
from typing import Any, Dict, List, Optional, Tuple

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
        save_round_results: bool = False,
    ):
        """
        Initialize a tournament.

        Args:
            num_players: Number of players
            num_rounds: Number of rounds to play
            draw_percent: Percentage chance of unintentional draw (0-100)
            allow_intentional_draws: Whether to allow intentional draws
            cut_size: Size of cut for intentional draw calculations
            save_round_results: If True, saves all round MatchResults for later study
        """
        self.num_players = num_players
        self.num_rounds = num_rounds
        self.draw_percent = draw_percent
        self.allow_intentional_draws = allow_intentional_draws
        self.cut_size = cut_size
        self.save_round_results = save_round_results

        # Create players
        self.players: Dict[int, Player] = {i: Player(i) for i in range(num_players)}

        # Track current round
        self.current_round = 0

        # Round snapshots: count_players_at_top and intentional draws per round (saved by default)
        self.round_snapshots: List[int] = []
        self.intentional_draws_per_round: List[int] = []

        # Store full round MatchResults if requested
        self.round_match_results: List[List[MatchResult]] = (
            [] if save_round_results else None
        )

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

        # Save round snapshots and ID count by default
        standings = self.get_final_standings()
        self.round_snapshots.append(count_players_at_top(standings))
        self.intentional_draws_per_round.append(
            self.count_intentional_draws_in_round(results)
        )

        # Save round MatchResults if requested
        if self.save_round_results and self.round_match_results is not None:
            self.round_match_results.append(results.copy())

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
    """Runs multiple tournament simulations. Round snapshots and ID counts are saved by default."""

    def __init__(
        self,
        num_players: int,
        num_rounds: int,
        draw_percent: float,
        num_simulations: int,
        allow_intentional_draws: bool = True,
        cut_size: int = 8,
        seed: Optional[int] = None,
        save_round_results: bool = False,
    ):
        self.num_players = num_players
        self.num_rounds = num_rounds
        self.draw_percent = draw_percent
        self.num_simulations = num_simulations
        self.allow_intentional_draws = allow_intentional_draws
        self.cut_size = cut_size
        self.seed = seed
        self.save_round_results = save_round_results

        # Populated by run():
        self.count_at_top_per_round: Dict[int, List[int]] = {}
        self.id_counts_per_round: Dict[int, List[int]] = {}
        self.id_distributions: Dict[int, Dict[int, int]] = {}
        self.final_standings: List[List[Player]] = []
        self.params: Dict[str, Any] = {}
        # Optionally aggregate all MatchResults by simulation & round
        self.all_round_match_results: List[List[List[MatchResult]]] = (
            [] if save_round_results else None
        )

    def run(self) -> None:
        """Run simulations, populating count_at_top_per_round, id_counts_per_round, id_distributions, final_standings."""
        if self.seed is not None:
            random.seed(self.seed)

        self.count_at_top_per_round = {r: [] for r in range(1, self.num_rounds + 1)}
        self.id_counts_per_round = {r: [] for r in range(1, self.num_rounds + 1)}
        self.final_standings = []
        if self.save_round_results and self.all_round_match_results is not None:
            self.all_round_match_results.clear()

        for _ in range(self.num_simulations):
            tournament = Tournament(
                self.num_players,
                self.num_rounds,
                self.draw_percent,
                allow_intentional_draws=self.allow_intentional_draws,
                cut_size=self.cut_size,
                save_round_results=self.save_round_results,
            )
            for round_num in range(1, self.num_rounds + 1):
                tournament.play_round()
                # Tournament saves snapshots and IDs by default
                self.count_at_top_per_round[round_num].append(
                    tournament.round_snapshots[-1]
                )
                self.id_counts_per_round[round_num].append(
                    tournament.intentional_draws_per_round[-1]
                )
            self.final_standings.append(tournament.get_final_standings())
            # Save all round results if requested
            if self.save_round_results and self.all_round_match_results is not None:
                if tournament.round_match_results is not None:
                    self.all_round_match_results.append(
                        [r.copy() for r in tournament.round_match_results]
                    )
                else:
                    self.all_round_match_results.append([])

        # Build id_distributions: {round -> {count -> frequency}}
        self.id_distributions = {}
        for round_num, counts in self.id_counts_per_round.items():
            dist: Dict[int, int] = {}
            for count in counts:
                dist[count] = dist.get(count, 0) + 1
            self.id_distributions[round_num] = dist

        self.params = {
            "players": self.num_players,
            "rounds": self.num_rounds,
            "draw_percent": self.draw_percent,
            "simulations": self.num_simulations,
        }

    @classmethod
    def run_simulations(
        cls,
        num_players: int,
        num_rounds: int,
        draw_percent: float,
        num_simulations: int,
        allow_intentional_draws: bool = True,
        cut_size: int = 8,
        seed: Optional[int] = None,
        save_round_results: bool = False,
    ) -> List[List[Player]]:
        """Run multiple tournaments. Returns list of final standings (one per tournament)."""
        sim = cls(
            num_players=num_players,
            num_rounds=num_rounds,
            draw_percent=draw_percent,
            num_simulations=num_simulations,
            allow_intentional_draws=allow_intentional_draws,
            cut_size=cut_size,
            seed=seed,
            save_round_results=save_round_results,
        )
        sim.run()
        return sim.final_standings

    @classmethod
    def analyze_intentional_draws_per_round(
        cls,
        num_players: int,
        num_rounds: int,
        draw_percent: float,
        num_simulations: int,
        cut_size: int = 8,
        seed: Optional[int] = None,
        save_round_results: bool = False,
    ) -> Dict[int, Dict[int, int]]:
        """Run simulations and return dict mapping round_number -> {id_count -> frequency}."""
        sim = cls(
            num_players=num_players,
            num_rounds=num_rounds,
            draw_percent=draw_percent,
            num_simulations=num_simulations,
            allow_intentional_draws=True,
            cut_size=cut_size,
            seed=seed,
            save_round_results=save_round_results,
        )
        sim.run()
        return sim.id_distributions

    @classmethod
    def run_with_round_snapshots(
        cls,
        num_players: int,
        max_rounds: int,
        draw_percent: float,
        num_simulations: int,
        cut_size: int = 8,
        seed: Optional[int] = None,
        allow_intentional_draws: bool = False,
        save_round_results: bool = False,
    ) -> Tuple[Dict[int, List[int]], Dict[str, Any]]:
        """Run simulations, returning (count_at_top_per_round, params)."""
        sim = cls(
            num_players=num_players,
            num_rounds=max_rounds,
            draw_percent=draw_percent,
            num_simulations=num_simulations,
            allow_intentional_draws=allow_intentional_draws,
            cut_size=cut_size,
            seed=seed,
            save_round_results=save_round_results,
        )
        sim.run()
        return sim.count_at_top_per_round, sim.params
