#!/usr/bin/env python3
"""
Setup script to ensure the tournament package can be imported.
Run this if you get import errors.
"""

import os
import sys

# Add the parent directory to Python path
parent_dir = os.path.dirname(os.path.abspath(__file__))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

print(f"Added {parent_dir} to Python path")
print("Tournament package should now be importable")

# Verify it works
try:
    from tournament.tournament import Tournament, TournamentSimulation

    print("✓ Successfully imported Tournament and TournamentSimulation")
except ImportError as e:
    print(f"✗ Import failed: {e}")
    sys.exit(1)
