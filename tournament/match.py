"""Match simulation and intentional draw logic."""

from collections import defaultdict
from typing import List, Optional

from .player import Player


class MatchResult:
    """Result of a single match."""

    def __init__(
        self,
        player1: Player,
        player2: Optional[Player],
        is_draw: bool,
        is_bye: bool,
        is_intentional: bool,
    ):
        self.player1 = player1
        self.player2 = player2
        self.is_draw = is_draw
        self.is_bye = is_bye
        self.is_intentional = is_intentional

        # For non-draws, determine winner/loser
        if not is_draw and not is_bye and player2 is not None:
            # These will be set by the match simulator
            self.winner = None
            self.loser = None
        else:
            self.winner = player1 if is_bye else None
            self.loser = None

    def set_winner(self, winner: Player, loser: Player):
        """Set winner and loser for non-draw matches."""
        self.winner = winner
        self.loser = loser

    def __repr__(self):
        if self.is_bye:
            return f"MatchResult(BYE: {self.player1})"
        if self.is_draw:
            intent = "INTENTIONAL" if self.is_intentional else "UNINTENTIONAL"
            return f"MatchResult(DRAW-{intent}: {self.player1} vs {self.player2})"
        return f"MatchResult(WIN: {self.winner} def. {self.loser})"


class IntentionalDrawChecker:
    """Determines when players can safely intentionally draw."""

    @staticmethod
    def is_safe_for_cut(
        player: Player,
        opponent: Player,
        all_players: List[Player],
        cut_size: int,
        current_round: int,
        total_rounds: int,
    ) -> bool:
        """
        Check if both players can safely intentional draw to make the cut.

        Args:
            player: First player considering the draw
            opponent: Second player considering the draw
            all_players: All players in the tournament
            cut_size: Size of the cut (e.g., 8 for Top 8)
            current_round: Current round number (1-indexed)
            total_rounds: Total number of rounds

        Returns:
            True if both players would be safe for the cut after drawing
        """
        player_score_after_draw = player.points + 1
        rounds_remaining_after_current = total_rounds - current_round

        # All others (excluding this pair); sorted by points desc
        others = sorted(
            (p for p in all_players if p.id != player.id and p.id != opponent.id),
            key=lambda p: (-p.points, p.id),
        )
        # 9th place overall = 7th-highest among others (we and opponent take 2 of top 9)
        if len(others) < cut_size:
            return True
        seventh_best_other_points = others[cut_size - 2].points  # 7th = index 5 for cut=8

        if rounds_remaining_after_current == 0:
            # Final round: ID only if our score after draw is above the max
            # possible score of whoever finishes 9th (at end of tournament).
            # 9th's max = 7th-best other + 3 (they win their last round).
            max_ninth_place = seventh_best_other_points + 3
            return player_score_after_draw > max_ninth_place

        if rounds_remaining_after_current == 1:
            # Penultimate: ID only if our X-0-2 will be above 9th at end of tournament.
            # 9th = 7th-highest among others. With Swiss, only ~half of each score
            # group can win each round, so we use a Swiss-constrained max 7th-highest.
            our_score_after_two_draws = player.points + 2
            max_seventh_after_two_rounds = (
                IntentionalDrawChecker._max_seventh_after_n_rounds(
                    [p.points for p in others], rounds=2
                )
            )
            return our_score_after_two_draws > max_seventh_after_two_rounds

        # Earlier rounds: use Swiss heuristic — only ~half of each score
        # group can win each round
        return IntentionalDrawChecker._is_safe_earlier_round(
            player,
            opponent,
            all_players,
            cut_size,
            player_score_after_draw,
            rounds_remaining_after_current,
        )

    @staticmethod
    def _max_seventh_after_n_rounds(scores: List[int], rounds: int = 2) -> int:
        """
        Swiss-constrained max 7th-highest score after n rounds. Each round,
        only ~half of each score group can win (they play each other).
        Returns the 7th-largest in the resulting distribution (for max 9th place).
        """
        if not scores or len(scores) < 7:
            return -1
        current = list(scores)
        for _ in range(rounds):
            # Group by score; from each group ceil(count/2) get +3, rest +0
            groups: dict = defaultdict(list)
            for s in current:
                groups[s].append(s)
            next_scores = []
            for s in sorted(groups.keys(), reverse=True):
                count = len(groups[s])
                winners = (count + 1) // 2
                next_scores.extend([s + 3] * winners)
                next_scores.extend([s] * (count - winners))
            current = next_scores
        current.sort(reverse=True)
        return current[6]  # 7th-highest

    @staticmethod
    def _is_safe_earlier_round(
        player: Player,
        opponent: Player,
        all_players: List[Player],
        cut_size: int,
        player_score_after_draw: int,
        rounds_remaining: int,
    ) -> bool:
        """
        Check safety for earlier rounds using Swiss pairing heuristic.

        Groups players by score and assumes roughly half will win each round
        (since similar-scored players are paired together).
        """
        score_groups: dict = {}

        for p in all_players:
            if p.id == player.id or p.id == opponent.id:
                continue

            current_score = p.points
            max_possible_score = current_score + 3 * (1 + rounds_remaining)

            if max_possible_score > player_score_after_draw:
                score_groups[current_score] = score_groups.get(current_score, 0) + 1

        realistic_threats = 0
        for count in score_groups.values():
            realistic_threats += (count + 1) // 2

        return realistic_threats < cut_size


class MatchSimulator:
    """Simulates match outcomes."""

    @staticmethod
    def simulate_match(
        player1: Player,
        player2: Optional[Player],
        random_value: float,
        draw_percent: float,
        allow_intentional_draws: bool = False,
        all_players: Optional[List[Player]] = None,
        current_round: int = 0,
        total_rounds: int = 0,
        cut_size: int = 8,
    ) -> MatchResult:
        """
        Simulate a match between two players.

        Args:
            player1: First player
            player2: Second player (None for bye)
            random_value: Random value 0-100 for outcome determination
            draw_percent: Percentage chance of unintentional draw
            allow_intentional_draws: Whether to allow intentional draws
            all_players: All players (needed for ID check)
            current_round: Current round number
            total_rounds: Total rounds in tournament
            cut_size: Size of cut for ID calculation

        Returns:
            MatchResult object
        """
        # Handle bye
        if player2 is None:
            result = MatchResult(player1, None, False, True, False)
            result.winner = player1
            return result

        # Check for intentional draw (if enabled and in last 2 rounds)
        if allow_intentional_draws and total_rounds > 0:
            if (total_rounds - current_round) <= 2:
                if all_players:
                    can_id = IntentionalDrawChecker.is_safe_for_cut(
                        player1,
                        player2,
                        all_players,
                        cut_size,
                        current_round,
                        total_rounds,
                    )
                    if can_id:
                        return MatchResult(player1, player2, True, False, True)

        # Check for unintentional draw
        if random_value < draw_percent:
            return MatchResult(player1, player2, True, False, False)

        # Determine winner (50/50 split in remaining probability)
        result = MatchResult(player1, player2, False, False, False)
        if random_value < 50 + draw_percent / 2:
            result.set_winner(player1, player2)
        else:
            result.set_winner(player2, player1)
        return result

    @staticmethod
    def apply_result(result: MatchResult):
        """Apply match result to players."""
        if result.is_bye:
            result.player1.add_win(-1)  # Bye opponent
            result.player1.opponents.pop()  # Remove the -1
        elif result.is_draw:
            result.player1.add_draw(result.player2.id)
            result.player2.add_draw(result.player1.id)
        else:
            result.winner.add_win(result.loser.id)
            result.loser.add_loss(result.winner.id)
