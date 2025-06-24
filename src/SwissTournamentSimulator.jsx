import React, { useState } from 'react';

const isSafeForCut = (player, opponent, allPlayers, cut, currentRound, totalRounds) => {
    const playerScoreAfterDraw = player.points + 1;
    const minFinalPlayerScore = playerScoreAfterDraw; // Assumes losing all remaining matches

    let potentialPassers = 0;
    for (const p of allPlayers) {
        if (p.id === player.id) continue;

        let maxPossibleScore;
        // For the opponent in the match, they also get 1 point from the draw.
        if (p.id === opponent.id) {
            maxPossibleScore = p.points + 1 + 3 * (totalRounds - currentRound);
        } else {
            // Other players can win their matches in this and all subsequent rounds.
            maxPossibleScore = p.points + 3 * (totalRounds - (currentRound - 1));
        }

        // We assume worst-case for tiebreakers, so if scores can be equal, they can pass.
        if (maxPossibleScore >= minFinalPlayerScore) {
            potentialPassers++;
        }
    }

    return potentialPassers < cut;
};

const SwissTournamentSimulator = () => {
    const [players, setPlayers] = useState(32);
    const [rounds, setRounds] = useState(5);
    const [drawChance, setDrawChance] = useState(5);
    const [simulations, setSimulations] = useState(1000);
    const [allowID, setAllowID] = useState(true);
    const [results, setResults] = useState(null);
    const [bubbleStats, setBubbleStats] = useState(null);
    const [resultsWithID, setResultsWithID] = useState(null);
    const [bubbleStatsWithID, setBubbleStatsWithID] = useState(null);
    const [isRunning, setIsRunning] = useState(false);

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
    const simulateMatch = (player1, player2, drawPercent, useID = false, allPlayers = [], currentRound = 0, totalRounds = 0) => {
        if (!player2) {
            // Bye - player gets 3 points
            return { winner: player1, loser: null, draw: false, bye: true };
        }

        if (useID && totalRounds > 0 && totalRounds - currentRound <= 2) {
            const p1Safe = isSafeForCut(player1, player2, allPlayers, 8, currentRound, totalRounds);
            const p2Safe = isSafeForCut(player2, player1, allPlayers, 8, currentRound, totalRounds);
            if (p1Safe && p2Safe) {
                return { winner: null, loser: null, draw: true, bye: false };
            }
        }

        const rand = Math.random() * 100;
        if (rand < drawPercent) {
            return { winner: null, loser: null, draw: true, bye: false };
        } else if (rand < 50 + drawPercent / 2) {
            return { winner: player1, loser: player2, draw: false, bye: false };
        } else {
            return { winner: player2, loser: player1, draw: false, bye: false };
        }
    };

    // Run a single tournament
    const runTournament = (numPlayers, numRounds, drawPercent, useID = false) => {
        // Initialize players
        let playerScores = Array.from({ length: numPlayers }, (_, i) => ({
            id: i,
            points: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            opponents: [],
            opponentWinPercentage: 0
        }));

        // Run each round
        for (let round = 1; round <= numRounds; round++) {
            const pairs = pairPlayers(playerScores);

            pairs.forEach(([p1, p2]) => {
                const result = simulateMatch(p1, p2, drawPercent, useID, playerScores, round, numRounds);

                if (result.bye) {
                    p1.points += 3;
                    p1.wins += 1;
                } else if (result.draw) {
                    p1.points += 1;
                    p2.points += 1;
                    p1.draws += 1;
                    p2.draws += 1;
                    p1.opponents.push(p2.id);
                    p2.opponents.push(p1.id);
                } else {
                    result.winner.points += 3;
                    result.winner.wins += 1;
                    result.loser.losses += 1;
                    result.winner.opponents.push(result.loser.id);
                    result.loser.opponents.push(result.winner.id);
                }
            });
        }

        // Calculate opponent win percentages for tiebreakers
        playerScores.forEach(player => {
            if (player.opponents.length > 0) {
                const opponentWinPercentages = player.opponents.map(oppId => {
                    const opponent = playerScores[oppId];
                    const totalGames = opponent.wins + opponent.losses + opponent.draws;
                    return totalGames > 0 ? (opponent.wins + opponent.draws * 0.5) / totalGames : 0;
                });
                player.opponentWinPercentage = opponentWinPercentages.reduce((sum, pct) => sum + pct, 0) / opponentWinPercentages.length;
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

    const processSimulationResults = (allSimResults, numSimulations, numRounds) => {
        // 2. Process Bubble Analysis from all results
        const top4Bubbles = [];
        const top8Bubbles = [];

        allSimResults.forEach(tournamentResult => {
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
        });

        const calculateBubbleStats = (bubbleSizes) => {
            if (bubbleSizes.length === 0) {
                return {
                    average: (0).toFixed(2),
                    median: (0).toFixed(2),
                    max: 0,
                    frequency: (0).toFixed(1),
                    distribution: {}
                };
            }

            const sortedSizes = [...bubbleSizes].sort((a, b) => a - b);
            const mid = Math.floor(sortedSizes.length / 2);
            const median = sortedSizes.length % 2 !== 0 ? sortedSizes[mid] : (sortedSizes[mid - 1] + sortedSizes[mid]) / 2;
            const totalBubblePlayers = bubbleSizes.reduce((sum, size) => sum + size, 0);
            const average = totalBubblePlayers / bubbleSizes.length;
            const max = sortedSizes[sortedSizes.length - 1];
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
                max,
                frequency: frequency.toFixed(1),
                distribution: distributionPercentages,
            };
        };

        const bubbleStatsResult = {
            top4: calculateBubbleStats(top4Bubbles),
            top8: calculateBubbleStats(top8Bubbles),
        };


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
        setIsRunning(true);
        setResults(null);
        setBubbleStats(null);
        setResultsWithID(null);
        setBubbleStatsWithID(null);


        // Use setTimeout to allow UI to update
        setTimeout(() => {
            // --- Refactored Simulation Logic ---
            const standardSimResults = [];
            for (let i = 0; i < simulations; i++) {
                standardSimResults.push(runTournament(players, rounds, drawChance, false));
            }

            const { bubbleStats, processedResults } = processSimulationResults(standardSimResults, simulations, rounds);
            setBubbleStats(bubbleStats);
            setResults(processedResults);


            if (allowID) {
                const idSimResults = [];
                for (let i = 0; i < simulations; i++) {
                    idSimResults.push(runTournament(players, rounds, drawChance, true));
                }
                const { bubbleStats: bubbleStatsID, processedResults: processedResultsID } = processSimulationResults(idSimResults, simulations, rounds);
                setBubbleStatsWithID(bubbleStatsID);
                setResultsWithID(processedResultsID);
            }


            setIsRunning(false);
        }, 100);
    };

    const maxPossiblePoints = rounds * 3;
    const expectedPoints = rounds * (3 * 0.5 * (1 - drawChance / 100) + 1 * (drawChance / 100));

    const ResultsDisplay = ({ bubbleStats, results, compareRecords }) => (
        <>
            {bubbleStats && (
                <div className="bg-white p-6 rounded-lg border mb-6">
                    <h3 className="text-2xl font-bold mb-4 text-purple-600">Bubble Analysis</h3>
                    <p className="text-sm text-gray-600 mb-6">
                        This analyzes how often players miss a top spot (like Top 4 or Top 8) due to tiebreakers, even when they have the same point total as a player who made the cut. The "bubble" is the number of players ranked just outside the cut-off with the same points.
                    </p>
                    <div className="grid grid-cols-1 gap-6">
                        {/* Top 4 Bubble */}
                        <div className="bg-gray-50 p-4 rounded-lg">
                            <h4 className="text-lg font-semibold mb-3">Top 4 Bubble Analysis</h4>
                            <div className="space-y-2 text-sm mb-4">
                                <div className="flex justify-between"><span>Average players on bubble:</span><span className="font-bold">{bubbleStats.top4.average}</span></div>
                                <div className="flex justify-between"><span>Median players on bubble:</span><span className="font-bold">{bubbleStats.top4.median}</span></div>
                                <div className="flex justify-between"><span>Most players on bubble (one sim):</span><span className="font-bold">{bubbleStats.top4.max}</span></div>
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
                        {/* Top 8 Bubble */}
                        <div className="bg-gray-50 p-4 rounded-lg">
                            <h4 className="text-lg font-semibold mb-3">Top 8 Bubble Analysis</h4>
                            <div className="space-y-2 text-sm mb-4">
                                <div className="flex justify-between"><span>Average players on bubble:</span><span className="font-bold">{bubbleStats.top8.average}</span></div>
                                <div className="flex justify-between"><span>Median players on bubble:</span><span className="font-bold">{bubbleStats.top8.median}</span></div>
                                <div className="flex justify-between"><span>Most players on bubble (one sim):</span><span className="font-bold">{bubbleStats.top8.max}</span></div>
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
                    </div>
                </div>
            )}

            {results && (
                <div className="space-y-6">
                    {Object.keys(results).length === 0 && (
                        <div className="text-center text-gray-500 py-8">
                            No players achieved the target records in any simulation. Try increasing the player count or simulations.
                        </div>
                    )}
                    {Object.keys(results).sort(compareRecords).map(record => (
                        <div key={record} className="bg-white p-6 rounded-lg border">
                            <h3 className="text-2xl font-bold mb-4 text-blue-600">{record} Record</h3>

                            <div className="bg-gray-50 p-4 rounded-lg">
                                <h4 className="text-lg font-semibold mb-3">Players at {record} or Better</h4>
                                <div className="space-y-2 max-h-64 overflow-y-auto">
                                    {Object.entries(results[record].recordAndBetterDistribution)
                                        .sort(([a], [b]) => parseInt(a) - parseInt(b))
                                        .map(([count, percentage]) => (
                                            <div key={count} className="flex justify-between text-sm">
                                                <span>{count} players:</span>
                                                <span className="font-bold">{percentage}%</span>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        </div>
                    ))}
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
                        onChange={(e) => setPlayers(Math.max(2, parseInt(e.target.value) || 2))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        min="2"
                        max="1000"
                    />
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Number of Rounds
                    </label>
                    <input
                        type="number"
                        value={rounds}
                        onChange={(e) => setRounds(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        min="1"
                        max="20"
                    />
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Draw Chance (%)
                    </label>
                    <input
                        type="number"
                        value={drawChance}
                        onChange={(e) => setDrawChance(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
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
                        onChange={(e) => setSimulations(Math.max(100, parseInt(e.target.value) || 100))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        min="100"
                        max="10000"
                    />
                </div>
            </div>

            <div className="mb-6 flex justify-center items-center">
                <div className="flex items-center">
                    <input
                        id="allow-id-checkbox"
                        type="checkbox"
                        checked={allowID}
                        onChange={(e) => setAllowID(e.target.checked)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor="allow-id-checkbox" className="ml-2 block text-sm text-gray-900">
                        Allow Intentional Draws (if both players lock Top 8)
                    </label>
                </div>
            </div>

            <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                <h3 className="text-lg font-semibold mb-2">Tournament Info</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="space-y-1">
                        <div>Max Points: <span className="font-bold">{maxPossiblePoints}</span></div>
                        <div>Expected Points: <span className="font-bold">{expectedPoints.toFixed(2)}</span></div>
                    </div>
                    <div className="space-y-1">
                        <div>Win = 3pts, Draw = 1pt, Loss = 0pts</div>
                        <div>Ranking: Points → Opponent Win% → Player ID</div>
                    </div>
                </div>
            </div>

            <button
                onClick={runSimulations}
                disabled={isRunning}
                className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed mb-6"
            >
                {isRunning ? 'Running Simulation...' : 'Run Simulation'}
            </button>

            {bubbleStats && (
                <div className={`grid ${allowID && bubbleStatsWithID ? 'md:grid-cols-2 gap-x-12' : 'grid-cols-1'}`}>
                    <div>
                        {allowID && bubbleStatsWithID && <h2 className="text-2xl font-bold mb-4 text-center">Without Intentional Draws</h2>}
                        <ResultsDisplay bubbleStats={bubbleStats} results={results} compareRecords={compareRecords} />
                    </div>
                    {allowID && bubbleStatsWithID && (
                        <div>
                            <h2 className="text-2xl font-bold mb-4 text-center">With Intentional Draws</h2>
                            <ResultsDisplay bubbleStats={bubbleStatsWithID} results={resultsWithID} compareRecords={compareRecords} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default SwissTournamentSimulator;