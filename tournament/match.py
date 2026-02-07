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
            True if both players can safely ID: final round = both make cut with
            the draw; earlier rounds = both can afford to draw every subsequent
            round and only be paired with others who can too (draw-safe set
            closed under pairing).
        """
        player_score_after_draw = player.points + 1
        opponent_score_after_draw = opponent.points + 1
        rounds_remaining_after_current = total_rounds - current_round

        # All others (excluding this pair); sorted by points desc
        others = [
            p for p in all_players if p.id != player.id and p.id != opponent.id
        ]
        if len(others) < cut_size:
            return True

        if rounds_remaining_after_current == 0:
            # Final round: ID only if BOTH players' score after draw is above the max
            # possible score of whoever finishes 9th (at end of tournament).
            sorted_others = sorted(others, key=lambda p: (-p.points, p.id))
            seventh_best_other_points = sorted_others[cut_size - 2].points
            max_ninth_place = seventh_best_other_points + 3
            return (
                player_score_after_draw > max_ninth_place
                and opponent_score_after_draw > max_ninth_place
            )

        # Penultimate or earlier: ID only if (1) both can afford to draw in
        # each subsequent round and still make cut, and (2) in each subsequent
        # round they would only be paired with players who can also afford to
        # draw from that round onward (draw-safe set is closed under pairing).
        return IntentionalDrawChecker._can_draw_out_and_pairing_closed(
            player,
            opponent,
            all_players,
            others,
            cut_size,
            rounds_remaining_after_current,
        )

    @staticmethod
    def _max_seventh_after_n_rounds(scores: List[int], rounds: int) -> int:
        """
        Swiss-constrained max 7th-highest score after n rounds. Each round
        only ~half of each score group can win (they play each other).
        Used to bound max possible 9th place at end of tournament.
        """
        if not scores or len(scores) < 7:
            return -1
        current = list(scores)
        for _ in range(rounds):
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
    def _can_draw_out_and_pairing_closed(
        player: Player,
        opponent: Player,
        all_players: List[Player],
        others: List[Player],
        cut_size: int,
        rounds_remaining: int,
    ) -> bool:
        """
        True if both can afford to draw in each subsequent round and make the
        cut, and in each subsequent round they would only be paired with
        players who can also afford to draw from that round onward.

        So: (1) draw-safe = players for whom score + rounds_remaining > max_9th
        at end; (2) at every score level, count of draw-safe must be even so
        they pair only with each other under Swiss.
        """
        if rounds_remaining <= 0:
            return False
        other_scores = [p.points for p in others]
        max_ninth_at_end = IntentionalDrawChecker._max_seventh_after_n_rounds(
            other_scores, rounds_remaining
        )
        if max_ninth_at_end < 0:
            return True

        # Can afford to draw in each subsequent round => score + R > max_9th
        def can_afford_draw_out(p: Player) -> bool:
            return p.points + rounds_remaining > max_ninth_at_end

        if not can_afford_draw_out(player) or not can_afford_draw_out(opponent):
            return False

        # Draw-safe set must be closed under Swiss pairing: at every score
        # level, an even number of draw-safe players (so they pair only with
        # each other).
        score_to_draw_safe_count: dict = {}
        for p in all_players:
            if not can_afford_draw_out(p):
                continue
            score_to_draw_safe_count[p.points] = (
                score_to_draw_safe_count.get(p.points, 0) + 1
            )
        for count in score_to_draw_safe_count.values():
            if count % 2 != 0:
                return False
        return True


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

        # Check for intentional draw in final two rounds: final round = both make
        # cut with the draw; penultimate/earlier = both already locked in.
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
