#!/usr/bin/env python3
"""
Example usage of the tournament simulator.
This demonstrates how to import and use the package.
"""

import os
import sys
from ast import Num

# Ensure the tournament package can be imported
# (Add current directory to path)
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from tournament.match import IntentionalDrawChecker
from tournament.player import Player
from tournament.tournament import Tournament, TournamentSimulation

NUM_PLAYERS = 30
NUM_ROUNDS = 5
DRAW_PERCENT = 2
CUT_SIZE = 8
NUM_SIMULATIONS = 100
SEED = 42
ALLOW_INTENTIONAL_DRAWS = True
ALLOW_UNINTENTIONAL_DRAWS = True


def example_single_tournament():
    """Run a single tournament."""
    print("=" * 60)
    print("Example: Single Tournament")
    print("=" * 60)

    t = Tournament(
        num_players=NUM_PLAYERS,
        num_rounds=NUM_ROUNDS,
        draw_percent=DRAW_PERCENT,
        allow_intentional_draws=ALLOW_INTENTIONAL_DRAWS,
        cut_size=CUT_SIZE,
    )

    standings = t.play_all_rounds()

    print(f"\nFinal Standings (Top 8):")
    for i, player in enumerate(standings[:8], 1):
        print(
            f"{i}. Player {player.id}: {player.get_record_string()} ({player.points} pts)"
        )
    print()


def example_test_specific_scenario():
    """Test the specific scenario from the user's tournament."""
    print("=" * 60)
    print("Example: Testing Specific Scenario")
    print("=" * 60)
    print("Scenario: 4 players at 9pts, 10 at 6pts, round 4 of 5")

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

    # Check if the 9-point players can safely ID
    is_safe = IntentionalDrawChecker.is_safe_for_cut(
        player=players[0],
        opponent=players[1],
        all_players=players,
        cut_size=8,
        current_round=4,
        total_rounds=5,
    )

    print(f"\nCan players at 9pts safely ID in round 4?")
    print(f"Answer: {is_safe}")
    print(f"\nExplanation:")
    print(f"- After ID, they'll have 10 points")
    print(f"- 10 players at 6pts can reach max 12pts (6+3+3)")
    print(f"- Using Swiss heuristic: (10+1)//2 = 5 realistic threats")
    print(f"- 5 < 8 (cut size), so YES, they're safe!")
    print()


def example_batch_simulations():
    """Run multiple simulations."""
    print("=" * 60)
    print("Example: Batch Simulations")
    print("=" * 60)

    results = TournamentSimulation.run_simulations(
        num_players=NUM_PLAYERS,
        num_rounds=NUM_ROUNDS,
        draw_percent=DRAW_PERCENT,
        num_simulations=NUM_SIMULATIONS,
        allow_intentional_draws=ALLOW_INTENTIONAL_DRAWS,
        cut_size=CUT_SIZE,
    )

    # Analyze Top 8 cutline
    cutline_records = {}
    for standings in results:
        if len(standings) >= 8:
            eighth_place = standings[7]
            record = eighth_place.get_record_string()
            cutline_records[record] = cutline_records.get(record, 0) + 1

    print(f"\nTop 8 cutline records (100 simulations):")
    for record in sorted(
        cutline_records.keys(), key=lambda r: cutline_records[r], reverse=True
    ):
        count = cutline_records[record]
        print(f"  {record}: {count} times ({count}%)")
    print()


def example_id_distribution():
    """Analyze intentional draw distribution."""
    print("=" * 60)
    print("Example: ID Distribution Analysis")
    print("=" * 60)

    distributions = TournamentSimulation.analyze_intentional_draws_per_round(
        num_players=NUM_PLAYERS,
        num_rounds=NUM_ROUNDS,
        draw_percent=DRAW_PERCENT,
        num_simulations=NUM_SIMULATIONS,
        cut_size=CUT_SIZE,
    )

    print(f"\nIntentional Draw Distribution by Round:")
    for round_num in range(1, 6):
        dist = distributions[round_num]
        print(f"\nRound {round_num}:")
        if not dist or (len(dist) == 1 and 0 in dist):
            print("  No IDs occurred")
        else:
            for id_count in sorted(dist.keys()):
                freq = dist[id_count]
                pct = (freq / 100) * 100
                if id_count == 0:
                    print(f"  {id_count} IDs: {freq} times ({pct:.1f}%)")
                else:
                    print(f"  {id_count} IDs: {freq} times ({pct:.1f}%)")
    print()


if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("TOURNAMENT SIMULATOR - EXAMPLES")
    print("=" * 60 + "\n")

    # Run examples
    example_single_tournament()
    example_test_specific_scenario()
    example_batch_simulations()
    example_id_distribution()

    print("=" * 60)
    print("All examples completed successfully!")
    print("=" * 60 + "\n")
