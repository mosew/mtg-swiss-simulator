"""
Answer: Given a draw % and player count, how many rounds until there's only one person at the top?

Uses the Swiss simulator to run many tournaments and find the minimum number of rounds
such that at least a target fraction of runs have exactly one sole leader (by points).

Usage:
  From code:
    from rounds_for_leader import rounds_for_single_leader, probability_single_leader

    out = rounds_for_single_leader(n_players=64, draw_pct=5, target_probability=0.9)
    print(out["rounds"], out["probability_at_rounds"])

  From command line:
    python rounds_for_leader.py [players] [draw_pct] [target_prob] [simulations]
    e.g. python rounds_for_leader.py 64 5 0.9 3000
"""

from typing import Optional

from swiss_simulator import (
    count_players_at_top,
    probability_single_leader,
    run_standard_only_simulations,
)
from swiss_simulator import (
    rounds_for_single_leader as _rounds_for_single_leader,
)


def rounds_for_single_leader(
    n_players: int,
    draw_pct: float,
    target_probability: float = 0.9,
    n_simulations: int = 5000,
    max_rounds: int = 25,
    seed: Optional[int] = None,
):
    """
    Given draw % and player count, how many rounds until there's only one at the top?

    Returns dict with:
      - rounds: minimum rounds needed for P(single leader) >= target_probability
      - probability_at_rounds: empirical probability at that round count
      - by_round: list of (rounds, probability) for each round 1..rounds
    """
    return _rounds_for_single_leader(
        n_players=n_players,
        draw_pct=draw_pct,
        target_probability=target_probability,
        n_simulations=n_simulations,
        max_rounds=max_rounds,
        seed=seed,
    )


def print_report(
    n_players: int,
    draw_pct: float,
    target_probability: float = 0.9,
    n_simulations: int = 5000,
    max_rounds: int = 25,
    seed: Optional[int] = None,
) -> None:
    """Run rounds_for_single_leader and print a short report."""
    out = rounds_for_single_leader(
        n_players=n_players,
        draw_pct=draw_pct,
        target_probability=target_probability,
        n_simulations=n_simulations,
        max_rounds=max_rounds,
        seed=seed,
    )
    r = out["rounds"]
    p = out["probability_at_rounds"]
    print(
        f"Players: {n_players}, Draw: {draw_pct}%, Target P(single leader): {target_probability:.0%}, Sims: {n_simulations}"
    )
    print(f"Rounds needed for ≥{target_probability:.0%} single leader: {r}")
    print(f"Empirical P(single leader) at {r} rounds: {p:.1%}")
    if out.get("by_round"):
        print("By round (round, P(single leader)):")
        for rd, prob in out["by_round"][: min(15, len(out["by_round"]))]:
            print(f"  {rd}: {prob:.1%}")
        if len(out["by_round"]) > 15:
            print(f"  ... ({len(out['by_round'])} rounds total)")


if __name__ == "__main__":
    import sys

    n_players = int(sys.argv[1]) if len(sys.argv) > 1 else 64
    draw_pct = float(sys.argv[2]) if len(sys.argv) > 2 else 5
    target = float(sys.argv[3]) if len(sys.argv) > 3 else 0.9
    sims = int(sys.argv[4]) if len(sys.argv) > 4 else 3000
    print_report(n_players, draw_pct, target_probability=target, n_simulations=sims)
