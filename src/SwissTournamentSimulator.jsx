import React, { useState } from 'react';

// --- Intentional draw safety (aligned with Python tournament/match.py) ---
// 9th place overall = 7th-highest among others (we and opponent take 2 of top 9).

/** Swiss-constrained max 7th-highest score after n rounds. Each round only ~half of each score group can win. */
function maxSeventhAfterNRounds(scores, rounds = 2) {
    if (!scores || scores.length < 7) return -1;
    let current = [...scores];
    for (let r = 0; r < rounds; r++) {
        const groups = {};
        current.forEach(s => {
            groups[s] = (groups[s] || 0) + 1;
        });
        const nextScores = [];
        Object.keys(groups)
            .map(Number)
            .sort((a, b) => b - a)
            .forEach(s => {
                const count = groups[s];
                const winners = Math.floor((count + 1) / 2);
                for (let i = 0; i < winners; i++) nextScores.push(s + 3);
                for (let i = 0; i < count - winners; i++) nextScores.push(s);
            });
        current = nextScores;
    }
    current.sort((a, b) => b - a);
    return current[6];
}

/** Earlier rounds: only ~half of each score group can win each round (Swiss heuristic). */
function isSafeEarlierRound(player, opponent, allPlayers, cutSize, playerScoreAfterDraw, roundsRemaining) {
    const scoreGroups = {};
    allPlayers.forEach(p => {
        if (p.id === player.id || p.id === opponent.id) return;
        const currentScore = p.points;
        const maxPossibleScore = currentScore + 3 * (1 + roundsRemaining);
        if (maxPossibleScore > playerScoreAfterDraw) {
            scoreGroups[currentScore] = (scoreGroups[currentScore] || 0) + 1;
        }
    });
    let realisticThreats = 0;
    Object.values(scoreGroups).forEach(count => {
        realisticThreats += Math.floor((count + 1) / 2);
    });
    return realisticThreats < cutSize;
}

const isSafeForCut = (player, opponent, allPlayers, cut, currentRound, totalRounds) => {
    const playerScoreAfterDraw = player.points + 1;
    const roundsRemaining = totalRounds - currentRound;

    const others = allPlayers
        .filter(p => p.id !== player.id && p.id !== opponent.id)
        .sort((a, b) => (b.points !== a.points ? b.points - a.points : a.id - b.id));

    if (others.length < cut) return true;
    const seventhBestOtherPoints = others[cut - 2].points;

    if (roundsRemaining === 0) {
        // Final round: safe iff our score after draw > max possible score of 9th place (7th-best other + 3).
        const maxNinthPlace = seventhBestOtherPoints + 3;
        return playerScoreAfterDraw > maxNinthPlace;
    }

    if (roundsRemaining === 1) {
        // Penultimate: safe iff X-0-2 is above 9th at end. Use Swiss-constrained max 7th-highest.
        const ourScoreAfterTwoDraws = player.points + 2;
        const otherScores = others.map(p => p.points);
        const maxSeventh = maxSeventhAfterNRounds(otherScores, 2);
        return ourScoreAfterTwoDraws > maxSeventh;
    }

    return isSafeEarlierRound(player, opponent, allPlayers, cut, playerScoreAfterDraw, roundsRemaining);
};

const SwissTournamentSimulator = () => {
    const [players, setPlayers] = useState(32);
    const [rounds, setRounds] = useState(5);
    const [drawChance, setDrawChance] = useState(5);
    const [simulations, setSimulations] = useState(10000);
    const [analyzeTop4, setAnalyzeTop4] = useState(true);
    const [analyzeTop8, setAnalyzeTop8] = useState(true);
    const [results, setResults] = useState(null);
    const [bubbleStats, setBubbleStats] = useState(null);
    const [resultsID4, setResultsID4] = useState(null);
    const [bubbleStatsID4, setBubbleStatsID4] = useState(null);
    const [resultsID8, setResultsID8] = useState(null);
    const [bubbleStatsID8, setBubbleStatsID8] = useState(null);
    const [discrepancyStats, setDiscrepancyStats] = useState(null);
    const [isRunning, setIsRunning] = useState(false);

    const formatPercentageAsOneIn = (percentageStr) => {
        const percentage = parseFloat(percentageStr);
        if (isNaN(percentage) || percentage <= 0.05) { // Treat very small numbers as "never"
            return `Never (${percentageStr || '0.0'}%)`;
        }
        if (percentage >= 99.95) { // Close enough to 100 to call it always
            return `Always (${percentageStr}%)`;
        }
        const oneIn = Math.round(100 / percentage);
        return `~1 in ${oneIn} tournaments (${percentageStr}%)`;
    };

    // Swiss tournament pairing function
    const pairPlayers = (playerScores) => {
        // Sort players by score (descending), then by ID for consistency
        const sorted = [...playerScores].sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            return a.id - b.id;
        });

        const pairs = [];
        const used = new Set();

        for (let i = 0; i < sorted.length; i++) {
            if (used.has(sorted[i].id)) continue;

            // Find opponent with closest score who hasn't been used
            for (let j = i + 1; j < sorted.length; j++) {
                if (!used.has(sorted[j].id)) {
                    pairs.push([sorted[i], sorted[j]]);
                    used.add(sorted[i].id);
                    used.add(sorted[j].id);
                    break;
                }
            }
        }

        // Handle bye if odd number of players
        if (used.size < sorted.length) {
            const byePlayer = sorted.find(p => !used.has(p.id));
            pairs.push([byePlayer, null]); // null represents bye
        }

        return pairs;
    };

    // Simulate a single match
    const simulateMatch = (player1, player2, drawPercent, useID = false, allPlayers = [], currentRound = 0, totalRounds = 0, cutSize = 8, rand) => {
        if (!player2) {
            // This is handled in processRound now, but kept for safety
            return { winner: player1, loser: null, draw: false, bye: true };
        }

        if (useID && totalRounds > 0 && totalRounds - currentRound <= 2) {
            const p1Safe = isSafeForCut(player1, player2, allPlayers, cutSize, currentRound, totalRounds);
            const p2Safe = isSafeForCut(player2, player1, allPlayers, cutSize, currentRound, totalRounds);
            if (p1Safe && p2Safe) {
                return { winner: null, loser: null, draw: true, bye: false };
            }
        }

        if (rand < drawPercent) {
            return { winner: null, loser: null, draw: true, bye: false };
        } else if (rand < 50 + drawPercent / 2) {
            return { winner: player1, loser: player2, draw: false, bye: false };
        } else {
            return { winner: player2, loser: player1, draw: false, bye: false };
        }
    };

    const rankPlayers = (playerScores) => {
        // Calculate opponent win percentages for tiebreakers
        playerScores.forEach(player => {
            if (player.opponents.length > 0) {
                const opponentWinPercentages = player.opponents.map(oppId => {
                    const opponent = playerScores[oppId]; // Direct lookup
                    if (!opponent) return 0; // Should not happen in a consistent state
                    const totalGames = opponent.wins + opponent.losses + opponent.draws;
                    return totalGames > 0 ? (opponent.wins + opponent.draws * 0.5) / totalGames : 0;
                });
                player.opponentWinPercentage = opponentWinPercentages.reduce((sum, pct) => sum + pct, 0) / opponentWinPercentages.length;
            } else {
                player.opponentWinPercentage = 0;
            }
        });

        // Sort players by official Magic tournament ranking:
        // 1. Points (descending)
        // 2. Opponent Match Win Percentage (descending)
        // 3. Player ID (ascending, for consistency)
        const rankedPlayers = [...playerScores].sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            if (b.opponentWinPercentage !== a.opponentWinPercentage) return b.opponentWinPercentage - a.opponentWinPercentage;
            return a.id - b.id;
        });

        return rankedPlayers;
    };

    const processRound = (playerScores, pairs, drawPercent, useID, cutSize, round, numRounds, getMatchOutcome) => {
        pairs.forEach(([p1, p2]) => {
            // Handle bye case first
            if (!p2) {
                playerScores[p1.id].points += 3;
                playerScores[p1.id].wins += 1;
                return;
            }

            const rand = getMatchOutcome(p1, p2);
            // We pass the original p1/p2 from pairings to simulateMatch for its logic
            const result = simulateMatch(p1, p2, drawPercent, useID, playerScores, round, numRounds, cutSize, rand);

            if (result.draw) {
                playerScores[p1.id].points += 1;
                playerScores[p2.id].points += 1;
                playerScores[p1.id].draws += 1;
                playerScores[p2.id].draws += 1;
                playerScores[p1.id].opponents.push(p2.id);
                playerScores[p2.id].opponents.push(p1.id);
            } else { // Win/Loss
                playerScores[result.winner.id].points += 3;
                playerScores[result.winner.id].wins += 1;
                playerScores[result.loser.id].losses += 1;
                playerScores[result.winner.id].opponents.push(result.loser.id);
                playerScores[result.loser.id].opponents.push(result.winner.id);
            }
        });
    };

    // Run a single tournament - THIS IS NOW OBSOLETE AND REMOVED
    // const runTournament = ...

    // Helper function to get record string
    const getRecordString = (player) => {
        if (player.draws > 0) {
            return `${player.wins}-${player.losses}-${player.draws}`;
        }
        return `${player.wins}-${player.losses}`;
    };

    // Helper function to determine if a record matches our target patterns
    const isTargetRecord = (record) => {
        const parts = record.split('-').map(Number);
        const wins = parts[0];
        const losses = parts[1];
        const draws = parts[2] || 0;

        // X-0 pattern (undefeated)
        if (losses === 0 && draws === 0) return `${wins}-0`;

        // X-0-1 pattern (one draw, no losses)
        if (losses === 0 && draws === 1) return `${wins}-0-1`;

        // X-1 pattern (one loss, no draws)
        if (losses === 1 && draws === 0) return `${wins}-1`;

        // X-1-1 pattern (one loss, one draw)
        if (losses === 1 && draws === 1) return `${wins}-1-1`;

        // X-2 pattern (two losses, no draws)
        if (losses === 2 && draws === 0) return `${wins}-2`;

        return null;
    };

    // Helper function to compare records for sorting (better records first)
    const compareRecords = (a, b) => {
        const aParts = a.split('-').map(Number);
        const bParts = b.split('-').map(Number);
        const aWins = aParts[0];
        const aLosses = aParts[1];
        const aDraws = aParts[2] || 0;
        const bWins = bParts[0];
        const bLosses = bParts[1];
        const bDraws = bParts[2] || 0;

        // Points comparison (wins*3 + draws*1)
        const aPoints = aWins * 3 + aDraws;
        const bPoints = bWins * 3 + bDraws;

        if (bPoints !== aPoints) return bPoints - aPoints;
        if (aLosses !== bLosses) return aLosses - bLosses;
        return aDraws - bDraws;
    };

    const processSimulationResults = (allSimResults, numSimulations, numRounds, includeTop4 = true, includeTop8 = true) => {
        // 2. Process Bubble Analysis from all results
        const top4Bubbles = [];
        const top8Bubbles = [];

        allSimResults.forEach(tournamentResult => {
            if (includeTop4) {
                if (tournamentResult.length >= 4) {
                    const fourthPlacePoints = tournamentResult[3].points;
                    let top4Bubble = 0;
                    for (let i = 4; i < tournamentResult.length; i++) {
                        if (tournamentResult[i].points === fourthPlacePoints) {
                            top4Bubble++;
                        } else {
                            break; // Players are sorted by points
                        }
                    }
                    top4Bubbles.push(top4Bubble);
                } else {
                    top4Bubbles.push(0);
                }
            }

            if (includeTop8) {
                if (tournamentResult.length >= 8) {
                    const eighthPlacePoints = tournamentResult[7].points;
                    let top8Bubble = 0;
                    for (let i = 8; i < tournamentResult.length; i++) {
                        if (tournamentResult[i].points === eighthPlacePoints) {
                            top8Bubble++;
                        } else {
                            break;
                        }
                    }
                    top8Bubbles.push(top8Bubble);
                } else {
                    top8Bubbles.push(0);
                }
            }
        });

        const calculateBubbleStats = (bubbleSizes) => {
            if (bubbleSizes.length === 0) {
                return {
                    average: (0).toFixed(2),
                    median: (0).toFixed(2),
                    frequency: (0).toFixed(1),
                    distribution: {}
                };
            }

            const sortedSizes = [...bubbleSizes].sort((a, b) => a - b);
            const mid = Math.floor(sortedSizes.length / 2);
            const median = sortedSizes.length % 2 !== 0 ? sortedSizes[mid] : (sortedSizes[mid - 1] + sortedSizes[mid]) / 2;
            const totalBubblePlayers = bubbleSizes.reduce((sum, size) => sum + size, 0);
            const average = totalBubblePlayers / bubbleSizes.length;
            const frequency = (bubbleSizes.filter(size => size > 0).length / bubbleSizes.length) * 100;

            const distributionCounts = {};
            bubbleSizes.forEach(size => {
                distributionCounts[size] = (distributionCounts[size] || 0) + 1;
            });

            const distributionPercentages = {};
            Object.keys(distributionCounts).forEach(size => {
                distributionPercentages[size] = (distributionCounts[size] / numSimulations * 100).toFixed(1);
            });

            return {
                average: average.toFixed(2),
                median: median.toFixed(2),
                frequency: frequency.toFixed(1),
                distribution: distributionPercentages,
            };
        };

        const bubbleStatsResult = {};
        if (includeTop4) {
            bubbleStatsResult.top4 = calculateBubbleStats(top4Bubbles);
        }
        if (includeTop8) {
            bubbleStatsResult.top8 = calculateBubbleStats(top8Bubbles);
        }


        // 3. Process Record Analysis from all results
        const processedResults = {};
        const targetRecords = [`${numRounds}-0`, `${numRounds - 1}-0-1`, `${numRounds - 1}-1`, `${numRounds - 2}-1-1`, `${numRounds - 2}-2`];

        targetRecords.forEach(record => {
            const recordAndBetterCounts = allSimResults.map(tournamentResult => {
                return tournamentResult.filter(p => {
                    const playerRecord = getRecordString(p);
                    const targetRecord = isTargetRecord(playerRecord);
                    return targetRecord && compareRecords(targetRecord, record) <= 0;
                }).length;
            });

            const distribution = {};
            recordAndBetterCounts.forEach(count => {
                if (count > 0) { // Only show distributions for non-zero counts
                    distribution[count] = (distribution[count] || 0) + 1;
                }
            });

            if (Object.keys(distribution).length > 0) {
                const percentages = {};
                Object.keys(distribution).forEach(count => {
                    percentages[count] = (distribution[count] / numSimulations * 100).toFixed(1);
                });
                processedResults[record] = {
                    recordAndBetterDistribution: percentages
                };
            }
        });


        return { bubbleStats: bubbleStatsResult, processedResults };
    }

    // Run multiple simulations
    const runSimulations = () => {
        // Validate that at least one cut is selected
        if (!analyzeTop4 && !analyzeTop8) {
            return;
        }

        // Validate and clamp input values before running
        const clampedPlayers = Math.max(2, Math.min(10000, parseInt(players, 10) || 2));
        const clampedRounds = Math.max(1, Math.min(20, parseInt(rounds, 10) || 1));
        const clampedDrawChance = Math.max(0, Math.min(100, parseInt(drawChance, 10) || 0));
        const clampedSimulations = Math.max(100, Math.min(10000, parseInt(simulations, 10) || 100));

        // Update state to reflect clamped values in the UI, ensuring consistency
        setPlayers(clampedPlayers);
        setRounds(clampedRounds);
        setDrawChance(clampedDrawChance);
        setSimulations(clampedSimulations);

        setIsRunning(true);
        setResults(null);
        setBubbleStats(null);
        setResultsID4(null);
        setBubbleStatsID4(null);
        setResultsID8(null);
        setBubbleStatsID8(null);
        setDiscrepancyStats(null);


        // Use setTimeout to allow UI to update
        setTimeout(() => {
            const finalStandardResults = [];
            const finalId4Results = analyzeTop4 ? [] : null;
            const finalId8Results = analyzeTop8 ? [] : null;

            for (let i = 0; i < clampedSimulations; i++) {
                // Initialize states for this single simulation run
                let players_standard = Array.from({ length: clampedPlayers }, (_, j) => ({ id: j, points: 0, wins: 0, losses: 0, draws: 0, opponents: [], opponentWinPercentage: 0 }));
                let players_id4 = analyzeTop4 ? JSON.parse(JSON.stringify(players_standard)) : null;
                let players_id8 = analyzeTop8 ? JSON.parse(JSON.stringify(players_standard)) : null;

                // Round-by-round simulation for all states in lockstep
                for (let round = 1; round <= clampedRounds; round++) {
                    // Pairings can diverge, so calculate them for each state
                    const pairs_standard = pairPlayers(players_standard);
                    const pairs_id4 = analyzeTop4 ? pairPlayers(players_id4) : null;
                    const pairs_id8 = analyzeTop8 ? pairPlayers(players_id8) : null;

                    // Create a map for this round's outcomes, generated on-demand.
                    const roundOutcomes = new Map();
                    const getMatchOutcome = (p1, p2) => {
                        if (!p1 || !p2) return 0;
                        // Create a canonical key for the pair to ensure order doesn't matter.
                        const key = p1.id < p2.id ? `${p1.id}-${p2.id}` : `${p2.id}-${p1.id}`;
                        if (!roundOutcomes.has(key)) {
                            // If we haven't seen this pair this round, generate and store their outcome.
                            roundOutcomes.set(key, Math.random() * 100);
                        }
                        return roundOutcomes.get(key);
                    };

                    // Now, process the rounds for each state using the same outcome function.
                    // The first time a pair is seen, its outcome is generated and stored.
                    // Subsequent requests for the same pair get the stored outcome.
                    processRound(players_standard, pairs_standard, clampedDrawChance, false, 0, round, clampedRounds, getMatchOutcome);
                    if (analyzeTop4) {
                        processRound(players_id4, pairs_id4, clampedDrawChance, true, 4, round, clampedRounds, getMatchOutcome);
                    }
                    if (analyzeTop8) {
                        processRound(players_id8, pairs_id8, clampedDrawChance, true, 8, round, clampedRounds, getMatchOutcome);
                    }
                }

                // After all rounds, rank the players for each state
                finalStandardResults.push(rankPlayers(players_standard));
                if (analyzeTop4) {
                    finalId4Results.push(rankPlayers(players_id4));
                }
                if (analyzeTop8) {
                    finalId8Results.push(rankPlayers(players_id8));
                }
            }


            // --- Discrepancy Calculation ---
            const top4DiscrepancyCounts = [];
            const top8DiscrepancyCounts = [];

            if (analyzeTop4) {
                for (let i = 0; i < clampedSimulations; i++) {
                    const standardResult = finalStandardResults[i];
                    const id4Result = finalId4Results[i];

                    const standardTop4Ids = new Set(standardResult.slice(0, 4).map(p => p.id));
                    const id4Top4Ids = new Set(id4Result.slice(0, 4).map(p => p.id));
                    let top4Discrepancy = 0;
                    for (const playerId of standardTop4Ids) {
                        if (!id4Top4Ids.has(playerId)) {
                            top4Discrepancy++;
                        }
                    }
                    top4DiscrepancyCounts.push(top4Discrepancy);
                }
            }

            if (analyzeTop8) {
                for (let i = 0; i < clampedSimulations; i++) {
                    const standardResult = finalStandardResults[i];
                    const id8Result = finalId8Results[i];

                    const standardTop8Ids = new Set(standardResult.slice(0, 8).map(p => p.id));
                    const id8Top8Ids = new Set(id8Result.slice(0, 8).map(p => p.id));
                    let top8Discrepancy = 0;
                    for (const playerId of standardTop8Ids) {
                        if (!id8Top8Ids.has(playerId)) {
                            top8Discrepancy++;
                        }
                    }
                    top8DiscrepancyCounts.push(top8Discrepancy);
                }
            }


            // --- Process Results ---
            const { bubbleStats, processedResults } = processSimulationResults(finalStandardResults, clampedSimulations, clampedRounds, analyzeTop4, analyzeTop8);
            setBubbleStats(bubbleStats);
            setResults(processedResults);

            if (analyzeTop4) {
                const { bubbleStats: bubbleStatsID4, processedResults: processedResultsID4 } = processSimulationResults(finalId4Results, clampedSimulations, clampedRounds, analyzeTop4, analyzeTop8);
                setBubbleStatsID4(bubbleStatsID4);
                setResultsID4(processedResultsID4);
            } else {
                setBubbleStatsID4(null);
                setResultsID4(null);
            }

            if (analyzeTop8) {
                const { bubbleStats: bubbleStatsID8, processedResults: processedResultsID8 } = processSimulationResults(finalId8Results, clampedSimulations, clampedRounds, analyzeTop4, analyzeTop8);
                setBubbleStatsID8(bubbleStatsID8);
                setResultsID8(processedResultsID8);
            } else {
                setBubbleStatsID8(null);
                setResultsID8(null);
            }

            // --- Process Discrepancy Stats ---
            const calculateDiscrepancyStats = (counts) => {
                if (counts.length === 0) {
                    return { average: '0.00', median: '0.00', distribution: {} };
                }
                const sortedCounts = [...counts].sort((a, b) => a - b);
                const mid = Math.floor(sortedCounts.length / 2);
                const median = sortedCounts.length % 2 !== 0 ? sortedCounts[mid] : (sortedCounts[mid - 1] + sortedCounts[mid]) / 2;
                const total = counts.reduce((sum, count) => sum + count, 0);
                const average = total / counts.length;

                const distributionCounts = {};
                counts.forEach(size => {
                    distributionCounts[size] = (distributionCounts[size] || 0) + 1;
                });

                const distributionPercentages = {};
                Object.keys(distributionCounts).forEach(size => {
                    distributionPercentages[size] = (distributionCounts[size] / clampedSimulations * 100).toFixed(1);
                });

                return {
                    average: average.toFixed(2),
                    median: median.toFixed(2),
                    distribution: distributionPercentages,
                };
            };

            const discrepancyStatsResult = {};
            if (analyzeTop4) {
                discrepancyStatsResult.top4 = calculateDiscrepancyStats(top4DiscrepancyCounts);
            }
            if (analyzeTop8) {
                discrepancyStatsResult.top8 = calculateDiscrepancyStats(top8DiscrepancyCounts);
            }
            setDiscrepancyStats(Object.keys(discrepancyStatsResult).length > 0 ? discrepancyStatsResult : null);


            setIsRunning(false);
        }, 100);
    };

    const maxPossiblePoints = (parseInt(rounds, 10) || 0) * 3;

    const ResultsDisplay = ({ bubbleStats, results, compareRecords, analyzeTop4, analyzeTop8 }) => (
        <>
            {bubbleStats && (
                <div className="bg-white p-6 rounded-lg border mb-6">
                    <details>
                        <summary className="text-xl font-bold text-purple-600 cursor-pointer">Bubble Analysis</summary>
                        <p className="text-sm text-gray-600 mt-2 mb-4">
                            This analyzes how often players miss a top spot (like Top 4 or Top 8) due to tiebreakers, even when they have the same point total as a player who made the cut. The "bubble" is the number of players ranked just outside the cut-off with the same points.
                        </p>
                        <div className="grid grid-cols-1 gap-6 mt-4">
                            {/* Top 4 Bubble */}
                            {analyzeTop4 && bubbleStats.top4 && (
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <h4 className="text-lg font-semibold mb-3">Top 4 Bubble Analysis</h4>
                                    <div className="space-y-2 text-sm mb-4">
                                        <div className="flex justify-between"><span>Average players on bubble:</span><span className="font-bold">{bubbleStats.top4.average}</span></div>
                                        <div className="flex justify-between"><span>Median players on bubble:</span><span className="font-bold">{bubbleStats.top4.median}</span></div>
                                        <div className="flex justify-between"><span>Chance of a bubble occurring:</span><span className="font-bold">{bubbleStats.top4.frequency}%</span></div>
                                    </div>
                                    <h5 className="font-semibold mb-2 text-gray-800">Distribution of Bubble Sizes</h5>
                                    <div className="space-y-1 max-h-48 overflow-y-auto text-sm">
                                        {Object.entries(bubbleStats.top4.distribution)
                                            .sort(([a], [b]) => parseInt(a) - parseInt(b))
                                            .map(([count, percentage]) => (
                                                <div key={count} className="flex justify-between">
                                                    <span>{count === '0' ? 'No bubble' : `${count} players`}:</span>
                                                    <span className="font-bold">{percentage}% of sims</span>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            )}
                            {/* Top 8 Bubble */}
                            {analyzeTop8 && bubbleStats.top8 && (
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <h4 className="text-lg font-semibold mb-3">Top 8 Bubble Analysis</h4>
                                    <div className="space-y-2 text-sm mb-4">
                                        <div className="flex justify-between"><span>Average players on bubble:</span><span className="font-bold">{bubbleStats.top8.average}</span></div>
                                        <div className="flex justify-between"><span>Median players on bubble:</span><span className="font-bold">{bubbleStats.top8.median}</span></div>
                                        <div className="flex justify-between"><span>Chance of a bubble occurring:</span><span className="font-bold">{bubbleStats.top8.frequency}%</span></div>
                                    </div>
                                    <h5 className="font-semibold mb-2 text-gray-800">Distribution of Bubble Sizes</h5>
                                    <div className="space-y-1 max-h-48 overflow-y-auto text-sm">
                                        {Object.entries(bubbleStats.top8.distribution)
                                            .sort(([a], [b]) => parseInt(a) - parseInt(b))
                                            .map(([count, percentage]) => (
                                                <div key={count} className="flex justify-between">
                                                    <span>{count === '0' ? 'No bubble' : `${count} players`}:</span>
                                                    <span className="font-bold">{percentage}% of sims</span>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </details>
                </div>
            )}

            {results && (
                <div className="space-y-6">
                    <details>
                        <summary className="text-xl font-bold text-blue-600 cursor-pointer">Record Analysis</summary>
                        {Object.keys(results).length === 0 && (
                            <div className="text-center text-gray-500 py-8">
                                No players achieved the target records in any simulation. Try increasing the player count or simulations.
                            </div>
                        )}
                        {Object.keys(results).sort(compareRecords).map(record => (
                            <div key={record} className="bg-white p-6 rounded-lg border mt-4">
                                <h3 className="text-2xl font-bold mb-4 text-blue-600">{record} Record</h3>

                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <h4 className="text-lg font-semibold mb-3">Players at {record} or Better</h4>
                                    <div className="space-y-2 max-h-64 overflow-y-auto">
                                        {Object.entries(results[record].recordAndBetterDistribution)
                                            .sort(([a], [b]) => parseInt(a) - parseInt(b))
                                            .map(([count, percentage]) => (
                                                <div key={count} className="flex justify-between text-sm">
                                                    <span>{count} players:</span>
                                                    <span className="font-bold">{percentage}% of sims</span>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </details>
                </div>
            )}
        </>
    );

    return (
        <div className="p-6 max-w-6xl mx-auto bg-white">
            <h1 className="text-3xl font-bold mb-6 text-center text-gray-800">
                Swiss Magic Tournament Simulator
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-50 p-4 rounded-lg">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Number of Players
                    </label>
                    <input
                        type="number"
                        value={players}
                        onChange={(e) => setPlayers(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        min="2"
                        max="10000"
                    />
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Number of Rounds
                    </label>
                    <input
                        type="number"
                        value={rounds}
                        onChange={(e) => setRounds(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        min="1"
                        max="20"
                    />
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Unintentional Draw Chance (%)
                    </label>
                    <input
                        type="number"
                        value={drawChance}
                        onChange={(e) => setDrawChance(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        min="0"
                        max="100"
                    />
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Simulations
                    </label>
                    <input
                        type="number"
                        value={simulations}
                        onChange={(e) => setSimulations(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        min="100"
                        max="10000"
                    />
                </div>
            </div>

            <div className="mb-6 p-4 bg-purple-50 rounded-lg">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                    Top Cut Analysis
                </label>
                <div className="flex gap-6">
                    <label className="flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={analyzeTop4}
                            onChange={(e) => setAnalyzeTop4(e.target.checked)}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm text-gray-700">Top 4</span>
                    </label>
                    <label className="flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={analyzeTop8}
                            onChange={(e) => setAnalyzeTop8(e.target.checked)}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm text-gray-700">Top 8</span>
                    </label>
                </div>
                {!analyzeTop4 && !analyzeTop8 && (
                    <p className="text-sm text-red-600 mt-2">Please select at least one cut size to analyze.</p>
                )}
            </div>

            <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                <h3 className="text-lg font-semibold mb-2">Tournament Info</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="space-y-1">
                        <div>Max Points: <span className="font-bold">{maxPossiblePoints}</span></div>
                    </div>
                    <div className="space-y-1">
                        <div>Win = 3pts, Draw = 1pt, Loss = 0pts</div>
                    </div>
                </div>
            </div>

            <button
                onClick={runSimulations}
                disabled={isRunning || (!analyzeTop4 && !analyzeTop8)}
                className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed mb-6"
            >
                {isRunning ? 'Running Simulation...' : 'Run Simulation'}
            </button>

            {discrepancyStats && (
                <div className="bg-white p-6 rounded-lg border-2 border-red-200 mb-6">
                    <h2 className="text-2xl font-bold mb-4 text-red-600">Impact of Intentional Draws</h2>
                    <p className="text-sm text-gray-600 mb-4">
                        This shows how many players would have made a top cut without Intentional Draws (IDs), but were pushed out when IDs were allowed. It measures the negative impact of strategic drawing on players who play out their matches.
                    </p>
                    <div className={`grid gap-x-12 ${analyzeTop4 && analyzeTop8 ? 'md:grid-cols-2' : 'md:grid-cols-1'}`}>
                        {/* Top 4 Discrepancy */}
                        {analyzeTop4 && discrepancyStats.top4 && (
                            <div className="bg-red-50 p-4 rounded-lg">
                                <h4 className="text-lg font-semibold mb-3">Top 4 "Pushed Out" Players</h4>
                                <h5 className="font-semibold mb-2 text-gray-800">Distribution of Pushed Out Players</h5>
                                <div className="space-y-1 max-h-48 overflow-y-auto text-sm">
                                    {(() => {
                                        const distribution = discrepancyStats.top4.distribution;
                                        const pushedOutEntries = Object.entries(distribution)
                                            .filter(([count]) => parseInt(count) > 0)
                                            .map(([count, percentageStr]) => ({ count: parseInt(count), percentage: parseFloat(percentageStr) }))
                                            .sort((a, b) => a.count - b.count);

                                        const totalPushedOutPercentage = pushedOutEntries.reduce((sum, item) => sum + item.percentage, 0);
                                        const noPushedOutPercentage = 100 - totalPushedOutPercentage;

                                        let noPushedOutStr;
                                        let pushedOutStr;

                                        const pushedOutIsRarer = totalPushedOutPercentage < 50;
                                        const rarePercentage = pushedOutIsRarer ? totalPushedOutPercentage : noPushedOutPercentage;

                                        if (rarePercentage < 0.05) {
                                            noPushedOutStr = `Almost always (${noPushedOutPercentage.toFixed(1)}%)`;
                                            pushedOutStr = `Almost never (${totalPushedOutPercentage.toFixed(1)}%)`;
                                        } else {
                                            const oneIn = Math.round(100 / rarePercentage);
                                            if (oneIn > 1) {
                                                if (pushedOutIsRarer) {
                                                    pushedOutStr = `~1 in ${oneIn} tournaments (${totalPushedOutPercentage.toFixed(1)}%)`;
                                                    noPushedOutStr = `~${oneIn - 1} in ${oneIn} tournaments (${noPushedOutPercentage.toFixed(1)}%)`;
                                                } else { // No pushed out is rarer
                                                    noPushedOutStr = `~1 in ${oneIn} tournaments (${noPushedOutPercentage.toFixed(1)}%)`;
                                                    pushedOutStr = `~${oneIn - 1} in ${oneIn} tournaments (${totalPushedOutPercentage.toFixed(1)}%)`;
                                                }
                                            } else { // Fallback if rounding makes it weird
                                                noPushedOutStr = `${noPushedOutPercentage.toFixed(1)}%`;
                                                pushedOutStr = `${totalPushedOutPercentage.toFixed(1)}%`;
                                            }
                                        }

                                        return (
                                            <>
                                                <div className="flex justify-between">
                                                    <span>No one pushed out:</span>
                                                    <span className="font-bold">{noPushedOutStr}</span>
                                                </div>

                                                {pushedOutEntries.length > 0 && (
                                                    <>
                                                        <div className="flex justify-between pt-2">
                                                            <span className="font-semibold">One or more players pushed out:</span>
                                                            <span className="font-bold">{pushedOutStr}</span>
                                                        </div>

                                                        {pushedOutEntries.map(({ count, percentage }) => (
                                                            <div key={count} className="flex justify-between pl-4">
                                                                <span>{`${count} player${count === 1 ? '' : 's'}`}:</span>
                                                                <span className="font-bold">{formatPercentageAsOneIn(percentage.toFixed(1))}</span>
                                                            </div>
                                                        ))}
                                                    </>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                                <details className="text-sm mt-3">
                                    <summary className="cursor-pointer text-gray-600">Show More Stats</summary>
                                    <div className="space-y-2 text-sm mt-2">
                                        <div className="flex justify-between"><span>Average players pushed out:</span><span className="font-bold">{discrepancyStats.top4.average}</span></div>
                                        <div className="flex justify-between"><span>Median players pushed out:</span><span className="font-bold">{discrepancyStats.top4.median}</span></div>
                                    </div>
                                </details>
                            </div>
                        )}
                        {/* Top 8 Discrepancy */}
                        {analyzeTop8 && discrepancyStats.top8 && (
                            <div className="bg-red-50 p-4 rounded-lg">
                                <h4 className="text-lg font-semibold mb-3">Top 8 "Pushed Out" Players</h4>
                                <h5 className="font-semibold mb-2 text-gray-800">Distribution of Pushed Out Players</h5>
                                <div className="space-y-1 max-h-48 overflow-y-auto text-sm">
                                    {(() => {
                                        const distribution = discrepancyStats.top8.distribution;
                                        const pushedOutEntries = Object.entries(distribution)
                                            .filter(([count]) => parseInt(count) > 0)
                                            .map(([count, percentageStr]) => ({ count: parseInt(count), percentage: parseFloat(percentageStr) }))
                                            .sort((a, b) => a.count - b.count);

                                        const totalPushedOutPercentage = pushedOutEntries.reduce((sum, item) => sum + item.percentage, 0);
                                        const noPushedOutPercentage = 100 - totalPushedOutPercentage;

                                        let noPushedOutStr;
                                        let pushedOutStr;

                                        const pushedOutIsRarer = totalPushedOutPercentage < 50;
                                        const rarePercentage = pushedOutIsRarer ? totalPushedOutPercentage : noPushedOutPercentage;

                                        if (rarePercentage < 0.05) {
                                            noPushedOutStr = `Almost always (${noPushedOutPercentage.toFixed(1)}%)`;
                                            pushedOutStr = `Almost never (${totalPushedOutPercentage.toFixed(1)}%)`;
                                        } else {
                                            const oneIn = Math.round(100 / rarePercentage);
                                            if (oneIn > 1) {
                                                if (pushedOutIsRarer) {
                                                    pushedOutStr = `~1 in ${oneIn} tournaments (${totalPushedOutPercentage.toFixed(1)}%)`;
                                                    noPushedOutStr = `~${oneIn - 1} in ${oneIn} tournaments (${noPushedOutPercentage.toFixed(1)}%)`;
                                                } else { // No pushed out is rarer
                                                    noPushedOutStr = `~1 in ${oneIn} tournaments (${noPushedOutPercentage.toFixed(1)}%)`;
                                                    pushedOutStr = `~${oneIn - 1} in ${oneIn} tournaments (${totalPushedOutPercentage.toFixed(1)}%)`;
                                                }
                                            } else { // Fallback if rounding makes it weird
                                                noPushedOutStr = `${noPushedOutPercentage.toFixed(1)}%`;
                                                pushedOutStr = `${totalPushedOutPercentage.toFixed(1)}%`;
                                            }
                                        }

                                        return (
                                            <>
                                                <div className="flex justify-between">
                                                    <span>No one pushed out:</span>
                                                    <span className="font-bold">{noPushedOutStr}</span>
                                                </div>

                                                {pushedOutEntries.length > 0 && (
                                                    <>
                                                        <div className="flex justify-between pt-2">
                                                            <span className="font-semibold">One or more players pushed out:</span>
                                                            <span className="font-bold">{pushedOutStr}</span>
                                                        </div>

                                                        {pushedOutEntries.map(({ count, percentage }) => (
                                                            <div key={count} className="flex justify-between pl-4">
                                                                <span>{`${count} player${count === 1 ? '' : 's'}`}:</span>
                                                                <span className="font-bold">{formatPercentageAsOneIn(percentage.toFixed(1))}</span>
                                                            </div>
                                                        ))}
                                                    </>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                                <details className="text-sm mt-3">
                                    <summary className="cursor-pointer text-gray-600">Show More Stats</summary>
                                    <div className="space-y-2 text-sm mt-2">
                                        <div className="flex justify-between"><span>Average players pushed out:</span><span className="font-bold">{discrepancyStats.top8.average}</span></div>
                                        <div className="flex justify-between"><span>Median players pushed out:</span><span className="font-bold">{discrepancyStats.top8.median}</span></div>
                                    </div>
                                </details>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {bubbleStats && (
                <div className="bg-white p-6 rounded-lg border mb-6">
                    <p className="text-sm text-gray-600 mb-2">
                        The "With Intentional Draws" simulation models a scenario where players draw if it guarantees a top spot.
                        {analyzeTop4 && analyzeTop8 && " The Top 4 analysis assumes players aim for a Top 4 cut, and the Top 8 analysis assumes they aim for a Top 8 cut."}
                        {analyzeTop4 && !analyzeTop8 && " Players aim for a Top 4 cut."}
                        {!analyzeTop4 && analyzeTop8 && " Players aim for a Top 8 cut."}
                    </p>
                    {((analyzeTop4 && bubbleStatsID4) || (analyzeTop8 && bubbleStatsID8)) && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                            <p className="text-sm text-yellow-800 font-semibold mb-2">Why Bubble Analyses May Be Identical</p>
                            <p className="text-sm text-yellow-700 mb-2">
                                Intentional draws only occur when <strong>both players would still make the cut</strong> even after drawing (i.e., they are already "safe" for the cut).
                                Since bubble analysis measures players <strong>just outside the cut</strong> who have the same point total as the cut position, intentional draws
                                typically don't affect bubble sizes. This is because the players drawing intentionally are already safely qualified and aren't at the bubble.
                                If you observe identical bubble statistics, this is expected behavior and indicates that intentional draws are primarily occurring between
                                players who are already safely in the cut, rather than affecting the competitive edge at the bubble.
                            </p>
                            <p className="text-sm text-yellow-700">
                                <strong>Note:</strong> In theory, there are edge cases where disallowing intentional draws could push a "barely safe" player onto the bubble
                                (by giving them 0 points instead of 1). However, this is more likely with <strong>small cut sizes (C ≤ 4)</strong> and <strong>few rounds (R ≤ 4)</strong>,
                                which create tighter score clustering. With larger cuts or more rounds, players typically have larger safety margins, making this edge case rare.
                                See the <a href="proof-id-bubble-impact.html" target="_blank" className="underline font-semibold text-yellow-900 hover:text-yellow-950">detailed characterization</a> for the relationship between cut size, rounds, and when IDs can affect bubble statistics.
                            </p>
                        </div>
                    )}
                    <div className={`grid gap-x-12 mt-4 ${(analyzeTop4 && bubbleStatsID4) || (analyzeTop8 && bubbleStatsID8) ? 'md:grid-cols-2' : 'md:grid-cols-1'}`}>
                        <div>
                            <h2 className="text-2xl font-bold mb-4 text-center">Without Intentional Draws</h2>
                            <ResultsDisplay bubbleStats={bubbleStats} results={results} compareRecords={compareRecords} analyzeTop4={analyzeTop4} analyzeTop8={analyzeTop8} />
                        </div>
                        {((analyzeTop4 && bubbleStatsID4) || (analyzeTop8 && bubbleStatsID8)) && (
                            <div>
                                <h2 className="text-2xl font-bold mb-4 text-center">With Intentional Draws</h2>
                                <ResultsDisplay
                                    bubbleStats={{
                                        ...(analyzeTop4 && bubbleStatsID4 ? { top4: bubbleStatsID4.top4 } : {}),
                                        ...(analyzeTop8 && bubbleStatsID8 ? { top8: bubbleStatsID8.top8 } : {}),
                                    }}
                                    results={analyzeTop8 ? resultsID8 : resultsID4}
                                    compareRecords={compareRecords}
                                    analyzeTop4={analyzeTop4}
                                    analyzeTop8={analyzeTop8}
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SwissTournamentSimulator;