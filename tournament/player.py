"""Player class and related utilities."""

from typing import List


class Player:
    """Represents a tournament player with their match record."""

    def __init__(self, player_id: int):
        self.id = player_id
        self.points = 0
        self.wins = 0
        self.losses = 0
        self.draws = 0
        self.opponents: List[int] = []
        self.opponent_win_percentage = 0.0

    def add_win(self, opponent_id: int):
        """Record a win against an opponent."""
        self.points += 3
        self.wins += 1
        self.opponents.append(opponent_id)

    def add_loss(self, opponent_id: int):
        """Record a loss against an opponent."""
        self.losses += 1
        self.opponents.append(opponent_id)

    def add_draw(self, opponent_id: int):
        """Record a draw against an opponent."""
        self.points += 1
        self.draws += 1
        self.opponents.append(opponent_id)

    def get_record_string(self) -> str:
        """Return record as string like '3-1' or '3-0-1'."""
        if self.draws > 0:
            return f"{self.wins}-{self.losses}-{self.draws}"
        return f"{self.wins}-{self.losses}"

    def calculate_opponent_win_percentage(self, all_players: dict) -> float:
        """Calculate and update opponent win percentage (tiebreaker)."""
        if not self.opponents:
            self.opponent_win_percentage = 0.0
            return 0.0

        owps = []
        for opp_id in self.opponents:
            opp = all_players.get(opp_id)
            if not opp:
                owps.append(0.0)
                continue
            total = opp.wins + opp.losses + opp.draws
            if total > 0:
                owp = (opp.wins + opp.draws * 0.5) / total
            else:
                owp = 0.0
            owps.append(owp)

        self.opponent_win_percentage = sum(owps) / len(owps)
        return self.opponent_win_percentage

    def to_dict(self) -> dict:
        """Convert to dictionary format (for compatibility)."""
        return {
            "id": self.id,
            "points": self.points,
            "wins": self.wins,
            "losses": self.losses,
            "draws": self.draws,
            "opponents": self.opponents.copy(),
            "opponentWinPercentage": self.opponent_win_percentage,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Player":
        """Create Player from dictionary."""
        p = cls(data["id"])
        p.points = data["points"]
        p.wins = data["wins"]
        p.losses = data["losses"]
        p.draws = data["draws"]
        p.opponents = data["opponents"].copy()
        p.opponent_win_percentage = data.get("opponentWinPercentage", 0.0)
        return p

    def __repr__(self):
        return f"Player({self.id}, {self.get_record_string()}, {self.points}pts)"
