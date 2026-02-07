# Swiss Tournament Simulator

A modular, testable Swiss-style tournament simulator with support for intentional draws.

## Quick Start

```bash
# 1. Make sure you're in the directory with the tournament/ folder
cd swiss  # or wherever you extracted the files

# 2. Run the tests to verify everything works
python3 run_tests.py

# 3. Run the examples
python3 examples.py
```

## Project Structure

```
tournament/
├── __init__.py           # Package initialization
├── player.py            # Player class and record tracking
├── pairing.py           # Swiss pairing logic
├── match.py             # Match simulation and intentional draw logic
└── tournament.py        # Tournament orchestration and simulation

tests/
├── __init__.py
├── test_player.py       # Unit tests for Player class
├── test_pairing.py      # Unit tests for pairing logic
├── test_intentional_draws.py  # Tests for ID safety checking
└── test_tournament.py   # Integration tests for tournaments

run_tests.py             # Test runner script
```

## Key Classes

### Player
Represents a tournament player with:
- Match record (wins, losses, draws)
- Points (3 per win, 1 per draw)
- Opponent history
- Opponent Win Percentage (tiebreaker)

### SwissPairing
Handles Swiss-style pairing:
- Pairs players by score (descending) then ID
- Handles byes for odd player counts
- Ranks players by points, OWP, and ID

### IntentionalDrawChecker
Determines when players can safely intentional draw:
- **Final round**: Checks if fewer than `cut_size` players can score higher
- **Earlier rounds**: Uses Swiss pairing heuristic (groups by score, assumes ~half win)
- Prevents more than `cut_size/2` IDs per round

### Tournament
Orchestrates a single tournament:
- Creates players
- Pairs and plays rounds
- Tracks match outcomes for determinism
- Provides final standings

### TournamentSimulation
Runs multiple tournaments:
- Batch simulations with same parameters
- Analyzes intentional draw distributions
- Deterministic with seed

## Running Tests

```bash
# Run all tests
python3 run_tests.py

# Run specific test file
python3 -m unittest tests.test_intentional_draws

# Run specific test
python3 -m unittest tests.test_intentional_draws.TestIntentionalDrawChecker.test_final_round_safe_scenario
```

## Usage Example

```python
from tournament import Tournament, TournamentSimulation

# Single tournament
t = Tournament(
    num_players=32,
    num_rounds=5,
    draw_percent=2.0,
    allow_intentional_draws=True,
    cut_size=8
)
standings = t.play_all_rounds()

# Multiple simulations
results = TournamentSimulation.run_simulations(
    num_players=32,
    num_rounds=5,
    draw_percent=2,
    num_simulations=1000,
    allow_intentional_draws=True,
    cut_size=8,
    seed=42
)

# Analyze ID distribution per round
distributions = TournamentSimulation.analyze_intentional_draws_per_round(
    num_players=32,
    num_rounds=5,
    draw_percent=2,
    num_simulations=1000,
    cut_size=8,
    seed=42
)
```

## Intentional Draw Logic

The ID checker uses two strategies:

### Final Round (rounds_remaining == 0)
Count how many players could finish with **more points** than you after drawing.
You're safe if this count < `cut_size`.

Example (Top 8):
- You have 9 points, draw to 10
- 2 players at 12 pts → can reach 15 (exceed you)
- 6 players at 9 pts → can reach 12 (exceed you)  
- Total: 8 players could exceed you
- 8 is NOT < 8 → NOT safe

### Earlier Rounds  
Groups players by current score and assumes roughly half will win each round
(Swiss pairing pairs similar scores together).

Example (Round 4 of 5, Top 8):
- You have 9 points, draw to 10
- 10 players at 6 pts could reach 12 pts (6+3+3)
- But they play each other, so ~5 realistic threats: (10+1)//2 = 5
- 5 < 8 → SAFE

## Bug Fixes Applied

1. **Changed from `>=` to `>`**: Players must EXCEED your score to threaten you,
   not just tie (tiebreakers favor fewer losses)

2. **Swiss pairing heuristic**: Groups players by score and divides by 2 to
   account for the fact they'll be paired against each other

3. **Final round special case**: Simplified logic for last round where no
   more pairing changes can occur

4. **Removed "current top cut" requirement**: This was causing cascading IDs
   where all 8 players would draw even when 10+ were competing for spots

## Testing Strategy

- **Unit tests**: Individual components (Player, Pairing, ID logic)
- **Integration tests**: Full tournament simulations
- **Edge case tests**: Boundary conditions (exactly cut_size threats, etc.)
- **Determinism tests**: Verify same seed produces same results
- **Max ID test**: Verify no more than cut_size/2 IDs per round

## Known Limitations

The Swiss pairing heuristic (dividing by 2) is an approximation. In practice:
- Early rounds: Players at different scores may be paired together
- The actual threat count depends on detailed pairing across all future rounds
- The heuristic is conservative but may still allow IDs in edge cases

For perfect accuracy, would need to simulate all possible future pairings,
which is computationally expensive.

## Troubleshooting

### Import Error: "cannot import name 'Tournament'"

If you get an import error, make sure you're running scripts from the directory that contains the `tournament/` folder:

```bash
# Your directory structure should look like:
swiss/
├── tournament/
│   ├── __init__.py
│   ├── player.py
│   ├── pairing.py
│   ├── match.py
│   └── tournament.py
├── tests/
├── run_tests.py
├── examples.py
└── README.md

# Run from the swiss/ directory:
cd swiss
python3 run_tests.py
python3 examples.py
```

### Alternative: Use PYTHONPATH

If you want to import from anywhere:

```bash
export PYTHONPATH=/path/to/swiss:$PYTHONPATH
python3 -c "from tournament import Tournament; print('Success!')"
```

### In a Python script

Add this at the top of your script:

```python
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tournament import Tournament
```