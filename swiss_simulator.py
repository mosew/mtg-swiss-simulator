"""
Swiss Magic Tournament Simulator (Python port for notebook use).

Run many tournaments with the same parameters; compare standard vs intentional-draw
(Top 4 / Top 8) scenarios and get bubble stats, record distributions, and discrepancy.
"""

import copy
import random
from typing import Optional


def is_safe_for_cut(player, opponent, all_players, cut, current_round, total_rounds):
    """True if after a draw, fewer than `cut` players could tie or pass this player."""
    player_score_after_draw = player["points"] + 1
    min_final_player_score = player_score_after_draw

    potential_passers = 0
    for p in all_players:
        if p["id"] == player["id"]:
            continue
        if p["id"] == opponent["id"]:
            max_possible_score = p["points"] + 1 + 3 * (total_rounds - current_round)
        else:
            max_possible_score = p["points"] + 3 * (total_rounds - (current_round - 1))
        if max_possible_score >= min_final_player_score:
            potential_passers += 1
    return potential_passers < cut


def pair_players(player_scores):
    """Pair by score (desc), then by id. Returns list of (p1, p2) with p2 possibly None for bye."""
    sorted_players = sorted(
        player_scores,
        key=lambda p: (-p["points"], p["id"]),
    )
    pairs = []
    used = set()

    for i, p1 in enumerate(sorted_players):
        if p1["id"] in used:
            continue
        for p2 in sorted_players[i + 1 :]:
            if p2["id"] not in used:
                pairs.append((p1, p2))
                used.add(p1["id"])
                used.add(p2["id"])
                break
        else:
            # no partner -> bye
            pairs.append((p1, None))
            used.add(p1["id"])

    return pairs


def simulate_match(
    player1,
    player2,
    draw_percent,
    use_id=False,
    all_players=None,
    current_round=0,
    total_rounds=0,
    cut_size=8,
    rand=0.0,
):
    """Returns dict with winner, loser, draw, bye. all_players is id->player map or list."""
    if player2 is None:
        return {"winner": player1, "loser": None, "draw": False, "bye": True}

    if use_id and total_rounds > 0 and (total_rounds - current_round) <= 2:
        # need list of players for is_safe_for_cut
        plist = (
            list(all_players.values()) if isinstance(all_players, dict) else all_players
        )
        p1_safe = is_safe_for_cut(
            player1, player2, plist, cut_size, current_round, total_rounds
        )
        p2_safe = is_safe_for_cut(
            player2, player1, plist, cut_size, current_round, total_rounds
        )
        if p1_safe and p2_safe:
            return {"winner": None, "loser": None, "draw": True, "bye": False}

    if rand < draw_percent:
        return {"winner": None, "loser": None, "draw": True, "bye": False}
    if rand < 50 + draw_percent / 2:
        return {"winner": player1, "loser": player2, "draw": False, "bye": False}
    return {"winner": player2, "loser": player1, "draw": False, "bye": False}


def rank_players(player_scores):
    """Sort by points desc, then opponent win % desc, then id asc. Mutates opponentWinPercentage."""
    # build id->player for lookup
    by_id = {p["id"]: p for p in player_scores}
    for p in player_scores:
        if p["opponents"]:
            owps = []
            for opp_id in p["opponents"]:
                opp = by_id.get(opp_id)
                if not opp:
                    owps.append(0)
                    continue
                total = opp["wins"] + opp["losses"] + opp["draws"]
                owps.append(
                    (opp["wins"] + opp["draws"] * 0.5) / total if total > 0 else 0
                )
            p["opponentWinPercentage"] = sum(owps) / len(owps)
        else:
            p["opponentWinPercentage"] = 0

    return sorted(
        player_scores,
        key=lambda p: (-p["points"], -p["opponentWinPercentage"], p["id"]),
    )


def process_round(
    player_scores_by_id,
    pairs,
    draw_percent,
    use_id,
    cut_size,
    round_num,
    num_rounds,
    get_match_outcome,
):
    """Apply round results to player_scores_by_id (id -> player dict)."""
    for p1, p2 in pairs:
        if p2 is None:
            player_scores_by_id[p1["id"]]["points"] += 3
            player_scores_by_id[p1["id"]]["wins"] += 1
            continue
        rand = get_match_outcome(p1, p2)
        result = simulate_match(
            p1,
            p2,
            draw_percent,
            use_id,
            player_scores_by_id,
            round_num,
            num_rounds,
            cut_size,
            rand,
        )
        if result["draw"]:
            player_scores_by_id[p1["id"]]["points"] += 1
            player_scores_by_id[p2["id"]]["points"] += 1
            player_scores_by_id[p1["id"]]["draws"] += 1
            player_scores_by_id[p2["id"]]["draws"] += 1
            player_scores_by_id[p1["id"]]["opponents"].append(p2["id"])
            player_scores_by_id[p2["id"]]["opponents"].append(p1["id"])
        else:
            w, l = result["winner"], result["loser"]
            player_scores_by_id[w["id"]]["points"] += 3
            player_scores_by_id[w["id"]]["wins"] += 1
            player_scores_by_id[l["id"]]["losses"] += 1
            player_scores_by_id[w["id"]]["opponents"].append(l["id"])
            player_scores_by_id[l["id"]]["opponents"].append(w["id"])


def make_players(n):
    """List of n player dicts (id, points, wins, losses, draws, opponents, opponentWinPercentage)."""
    return [
        {
            "id": j,
            "points": 0,
            "wins": 0,
            "losses": 0,
            "draws": 0,
            "opponents": [],
            "opponentWinPercentage": 0,
        }
        for j in range(n)
    ]


def players_to_dict(players):
    return {p["id"]: copy.deepcopy(p) for p in players}


def dict_to_list(by_id):
    return list(by_id.values())


def get_record_string(player):
    if player["draws"] > 0:
        return f"{player['wins']}-{player['losses']}-{player['draws']}"
    return f"{player['wins']}-{player['losses']}"


def is_target_record(record):
    """Return normalized record string or None."""
    parts = [int(x) for x in record.split("-")]
    wins, losses = parts[0], parts[1]
    draws = parts[2] if len(parts) > 2 else 0
    if losses == 0 and draws == 0:
        return f"{wins}-0"
    if losses == 0 and draws == 1:
        return f"{wins}-0-1"
    if losses == 1 and draws == 0:
        return f"{wins}-1"
    if losses == 1 and draws == 1:
        return f"{wins}-1-1"
    if losses == 2 and draws == 0:
        return f"{wins}-2"
    return None


def compare_records(a, b):
    """Better record first: higher points, then fewer losses, then more draws."""

    def parse(r):
        parts = [int(x) for x in r.split("-")]
        wins, losses = parts[0], parts[1]
        draws = parts[2] if len(parts) > 2 else 0
        points = wins * 3 + draws
        return points, losses, draws

    pa, la, da = parse(a)
    pb, lb, db = parse(b)
    if pb != pa:
        return pb - pa
    if la != lb:
        return la - lb
    return da - db


def process_simulation_results(
    all_sim_results,
    num_simulations,
    num_rounds,
    include_top4=True,
    include_top8=True,
):
    """all_sim_results: list of ranked lists (each tournament). Returns bubble_stats and processed_results."""
    top4_bubbles = []
    top8_bubbles = []

    for tournament_result in all_sim_results:
        if include_top4:
            if len(tournament_result) >= 4:
                fourth_place_points = tournament_result[3]["points"]
                bubble = 0
                for i in range(4, len(tournament_result)):
                    if tournament_result[i]["points"] == fourth_place_points:
                        bubble += 1
                    else:
                        break
                top4_bubbles.append(bubble)
            else:
                top4_bubbles.append(0)
        if include_top8:
            if len(tournament_result) >= 8:
                eighth_place_points = tournament_result[7]["points"]
                bubble = 0
                for i in range(8, len(tournament_result)):
                    if tournament_result[i]["points"] == eighth_place_points:
                        bubble += 1
                    else:
                        break
                top8_bubbles.append(bubble)
            else:
                top8_bubbles.append(0)

    def calc_bubble_stats(bubble_sizes):
        if not bubble_sizes:
            return {
                "average": "0.00",
                "median": "0.00",
                "frequency": "0.0",
                "distribution": {},
            }
        sorted_sizes = sorted(bubble_sizes)
        n = len(sorted_sizes)
        mid = n // 2
        median = (
            sorted_sizes[mid]
            if n % 2
            else (sorted_sizes[mid - 1] + sorted_sizes[mid]) / 2
        )
        average = sum(bubble_sizes) / n
        frequency = 100 * sum(1 for s in bubble_sizes if s > 0) / n
        dist_counts = {}
        for s in bubble_sizes:
            dist_counts[s] = dist_counts.get(s, 0) + 1
        dist_pct = {
            str(k): f"{100 * v / num_simulations:.1f}" for k, v in dist_counts.items()
        }
        return {
            "average": f"{average:.2f}",
            "median": f"{median:.2f}",
            "frequency": f"{frequency:.1f}",
            "distribution": dist_pct,
        }

    bubble_stats_result = {}
    if include_top4:
        bubble_stats_result["top4"] = calc_bubble_stats(top4_bubbles)
    if include_top8:
        bubble_stats_result["top8"] = calc_bubble_stats(top8_bubbles)

    target_records = [
        f"{num_rounds}-0",
        f"{num_rounds - 1}-0-1",
        f"{num_rounds - 1}-1",
        f"{num_rounds - 2}-1-1",
        f"{num_rounds - 2}-2",
    ]
    processed_results = {}
    for record in target_records:
        record_and_better_counts = []
        for tournament_result in all_sim_results:
            count = sum(
                1
                for p in tournament_result
                if (
                    (t := is_target_record(get_record_string(p)))
                    and compare_records(t, record) <= 0
                )
            )
            record_and_better_counts.append(count)
        distribution = {}
        for c in record_and_better_counts:
            if c > 0:
                distribution[c] = distribution.get(c, 0) + 1
        if distribution:
            processed_results[record] = {
                "recordAndBetterDistribution": {
                    str(k): f"{100 * v / num_simulations:.1f}"
                    for k, v in distribution.items()
                }
            }
    return {"bubble_stats": bubble_stats_result, "processed_results": processed_results}


def count_players_at_top(ranked_list):
    """Return how many players are tied for first place (by points). 1 = sole leader."""
    if not ranked_list:
        return 0
    top_points = ranked_list[0]["points"]
    count = 0
    for p in ranked_list:
        if p["points"] != top_points:
            break
        count += 1
    return count


def run_standard_only_simulations(
    players,
    rounds,
    draw_chance,
    simulations,
    seed: Optional[int] = None,
):
    """
    Run simulations without intentional-draw variants. Returns list of ranked
    result lists (one per tournament) and params dict. Used for sole-leader analysis.
    """
    n_players = max(2, min(10000, int(players)))
    n_rounds = max(1, min(50, int(rounds)))  # allow more rounds for sole-leader search
    draw_pct = max(0, min(100, int(draw_chance)))
    n_sims = max(1, min(10000, int(simulations)))

    if seed is not None:
        random.seed(seed)

    results = []
    for _ in range(n_sims):
        base = make_players(n_players)
        players_by_id = players_to_dict(base)
        for round_num in range(1, n_rounds + 1):
            pairs = pair_players(dict_to_list(players_by_id))
            round_outcomes = {}

            def get_match_outcome(p1, p2):
                if not p1 or not p2:
                    return 0
                key = (min(p1["id"], p2["id"]), max(p1["id"], p2["id"]))
                if key not in round_outcomes:
                    round_outcomes[key] = random.random() * 100
                return round_outcomes[key]

            process_round(
                players_by_id,
                pairs,
                draw_pct,
                False,
                0,
                round_num,
                n_rounds,
                get_match_outcome,
            )
        results.append(rank_players(dict_to_list(players_by_id)))

    return results, {
        "players": n_players,
        "rounds": n_rounds,
        "draw_chance": draw_pct,
        "simulations": n_sims,
    }


def probability_single_leader(
    n_players,
    n_rounds,
    draw_pct,
    n_simulations=5000,
    seed: Optional[int] = None,
):
    """
    Fraction of tournaments (with given players, rounds, draw %) that end with
    exactly one player at the top (sole leader by points).
    """
    results, _ = run_standard_only_simulations(
        n_players, n_rounds, draw_pct, n_simulations, seed=seed
    )
    single = sum(1 for r in results if count_players_at_top(r) == 1)
    return single / len(results)


def rounds_for_single_leader(
    n_players,
    draw_pct,
    target_probability=0.9,
    n_simulations=5000,
    max_rounds=25,
    seed: Optional[int] = None,
):
    """
    Find the minimum number of rounds such that, with the given draw % and
    player count, at least target_probability of simulated tournaments have
    exactly one player at the top.

    Returns dict with:
      - rounds: minimum rounds needed (or max_rounds if never reached)
      - probability_at_rounds: empirical P(single leader) at that round count
      - by_round: optional list of (rounds, probability) for each round tried
    """
    n_players = max(2, min(10000, int(n_players)))
    draw_pct = max(0, min(100, float(draw_pct)))
    max_rounds = max(1, min(50, int(max_rounds)))

    by_round = []
    for r in range(1, max_rounds + 1):
        prob = probability_single_leader(
            n_players, r, draw_pct, n_simulations, seed=seed
        )
        by_round.append((r, prob))
        if prob >= target_probability:
            return {
                "rounds": r,
                "probability_at_rounds": prob,
                "by_round": by_round,
            }
    last_prob = by_round[-1][1] if by_round else 0
    return {
        "rounds": max_rounds,
        "probability_at_rounds": last_prob,
        "by_round": by_round,
    }


def run_simulations(
    players=32,
    rounds=5,
    draw_chance=5,
    simulations=10_000,
    analyze_top4=True,
    analyze_top8=True,
    seed: Optional[int] = None,
):
    """
    Run lockstep simulations: standard, ID-top4, ID-top8 (same random outcomes per round).
    Returns dict with:
      - bubble_stats, results (standard)
      - bubble_stats_id4, results_id4 (if analyze_top4)
      - bubble_stats_id8, results_id8 (if analyze_top8)
      - discrepancy_stats (top4/top8 pushed-out counts)
      - params (clamped inputs)
    """
    if not analyze_top4 and not analyze_top8:
        raise ValueError("Select at least one of analyze_top4 or analyze_top8")

    n_players = max(2, min(10000, int(players)))
    n_rounds = max(1, min(20, int(rounds)))
    draw_pct = max(0, min(100, int(draw_chance)))
    n_sims = max(100, min(10000, int(simulations)))

    if seed is not None:
        random.seed(seed)

    final_standard = []
    final_id4 = [] if analyze_top4 else None
    final_id8 = [] if analyze_top8 else None

    for _ in range(n_sims):
        base = make_players(n_players)
        players_standard = players_to_dict(base)
        players_id4 = players_to_dict(base) if analyze_top4 else None
        players_id8 = players_to_dict(base) if analyze_top8 else None

        for round_num in range(1, n_rounds + 1):
            pairs_standard = pair_players(dict_to_list(players_standard))
            pairs_id4 = (
                pair_players(dict_to_list(players_id4)) if analyze_top4 else None
            )
            pairs_id8 = (
                pair_players(dict_to_list(players_id8)) if analyze_top8 else None
            )

            round_outcomes = {}

            def get_match_outcome(p1, p2):
                if not p1 or not p2:
                    return 0
                key = (min(p1["id"], p2["id"]), max(p1["id"], p2["id"]))
                if key not in round_outcomes:
                    round_outcomes[key] = random.random() * 100
                return round_outcomes[key]

            process_round(
                players_standard,
                pairs_standard,
                draw_pct,
                False,
                0,
                round_num,
                n_rounds,
                get_match_outcome,
            )
            if analyze_top4:
                process_round(
                    players_id4,
                    pairs_id4,
                    draw_pct,
                    True,
                    4,
                    round_num,
                    n_rounds,
                    get_match_outcome,
                )
            if analyze_top8:
                process_round(
                    players_id8,
                    pairs_id8,
                    draw_pct,
                    True,
                    8,
                    round_num,
                    n_rounds,
                    get_match_outcome,
                )

        final_standard.append(rank_players(dict_to_list(players_standard)))
        if analyze_top4:
            final_id4.append(rank_players(dict_to_list(players_id4)))
        if analyze_top8:
            final_id8.append(rank_players(dict_to_list(players_id8)))

    # Discrepancy
    top4_discrepancy = []
    top8_discrepancy = []
    if analyze_top4:
        for i in range(n_sims):
            std_top4_ids = {p["id"] for p in final_standard[i][:4]}
            id4_top4_ids = {p["id"] for p in final_id4[i][:4]}
            top4_discrepancy.append(
                sum(1 for pid in std_top4_ids if pid not in id4_top4_ids)
            )
    if analyze_top8:
        for i in range(n_sims):
            std_top8_ids = {p["id"] for p in final_standard[i][:8]}
            id8_top8_ids = {p["id"] for p in final_id8[i][:8]}
            top8_discrepancy.append(
                sum(1 for pid in std_top8_ids if pid not in id8_top8_ids)
            )

    def calc_discrepancy_stats(counts):
        if not counts:
            return {"average": "0.00", "median": "0.00", "distribution": {}}
        sorted_counts = sorted(counts)
        n = len(sorted_counts)
        mid = n // 2
        median = (
            sorted_counts[mid]
            if n % 2
            else (sorted_counts[mid - 1] + sorted_counts[mid]) / 2
        )
        average = sum(counts) / n
        dist = {}
        for c in counts:
            dist[c] = dist.get(c, 0) + 1
        dist_pct = {str(k): f"{100 * v / n_sims:.1f}" for k, v in dist.items()}
        return {
            "average": f"{average:.2f}",
            "median": f"{median:.2f}",
            "distribution": dist_pct,
        }

    out = {}
    proc = process_simulation_results(
        final_standard, n_sims, n_rounds, analyze_top4, analyze_top8
    )
    out["bubble_stats"] = proc["bubble_stats"]
    out["results"] = proc["processed_results"]
    out["params"] = {
        "players": n_players,
        "rounds": n_rounds,
        "draw_chance": draw_pct,
        "simulations": n_sims,
    }

    if analyze_top4:
        proc4 = process_simulation_results(
            final_id4, n_sims, n_rounds, analyze_top4, analyze_top8
        )
        out["bubble_stats_id4"] = proc4["bubble_stats"]
        out["results_id4"] = proc4["processed_results"]
    else:
        out["bubble_stats_id4"] = None
        out["results_id4"] = None

    if analyze_top8:
        proc8 = process_simulation_results(
            final_id8, n_sims, n_rounds, analyze_top4, analyze_top8
        )
        out["bubble_stats_id8"] = proc8["bubble_stats"]
        out["results_id8"] = proc8["processed_results"]
    else:
        out["bubble_stats_id8"] = None
        out["results_id8"] = None

    disc = {}
    if analyze_top4:
        disc["top4"] = calc_discrepancy_stats(top4_discrepancy)
    if analyze_top8:
        disc["top8"] = calc_discrepancy_stats(top8_discrepancy)
    out["discrepancy_stats"] = disc if disc else None

    return out


def format_percentage_as_one_in(percentage_str):
    pct = float(percentage_str)
    if pct <= 0.05:
        return f"Never ({percentage_str or '0.0'}%)"
    if pct >= 99.95:
        return f"Always ({percentage_str}%)"
    one_in = round(100 / pct)
    return f"~1 in {one_in} tournaments ({percentage_str}%)"


def print_results(out, compare_records_fn=None):
    """Pretty-print the result dict from run_simulations (notebook-friendly)."""
    compare_records_fn = compare_records_fn or compare_records
    p = out["params"]
    print(
        f"Params: {p['players']} players, {p['rounds']} rounds, draw {p['draw_chance']}%, {p['simulations']} sims\n"
    )

    # Discrepancy
    if out.get("discrepancy_stats"):
        print("--- Impact of Intentional Draws (pushed out of cut) ---")
        for cut in ["top4", "top8"]:
            if cut not in out["discrepancy_stats"]:
                continue
            d = out["discrepancy_stats"][cut]
            print(f"  {cut}: avg pushed out = {d['average']}, median = {d['median']}")
            for k in sorted(d["distribution"].keys(), key=int):
                print(f"    {k} pushed out: {d['distribution'][k]}% of sims")
        print()

    # Bubble (standard)
    bs = out["bubble_stats"]
    print("--- Bubble (without IDs) ---")
    for cut in ["top4", "top8"]:
        if cut not in bs:
            continue
        b = bs[cut]
        print(
            f"  {cut}: avg bubble = {b['average']}, median = {b['median']}, frequency = {b['frequency']}%"
        )
        for k in sorted(b["distribution"].keys(), key=int):
            label = "No bubble" if k == "0" else f"{k} players"
            print(f"    {label}: {b['distribution'][k]}%")
    print()

    # Record analysis (standard)
    res = out["results"]
    if res:
        print("--- Record analysis (without IDs) ---")

        def record_sort_key(r):
            parts = [int(x) for x in r.split("-")]
            pts = parts[0] * 3 + (parts[2] if len(parts) > 2 else 0)
            return (-pts, parts[1], -(parts[2] if len(parts) > 2 else 0))

        for record in sorted(res.keys(), key=record_sort_key):
            print(f"  {record}:")
            for count in sorted(
                res[record]["recordAndBetterDistribution"].keys(), key=int
            ):
                print(
                    f"    {count} players at {record}+: {res[record]['recordAndBetterDistribution'][count]}%"
                )

    # With IDs summary
    if out.get("bubble_stats_id4") or out.get("bubble_stats_id8"):
        print(
            "\n--- With Intentional Draws (bubble stats often match; see discrepancy for ID impact) ---"
        )
        for cut in ["top4", "top8"]:
            bid = out.get("bubble_stats_id4") or out.get("bubble_stats_id8")
            if bid and cut in bid:
                b = bid[cut]
                print(
                    f"  {cut}: avg = {b['average']}, median = {b['median']}, frequency = {b['frequency']}%"
                )
