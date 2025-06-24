import React, { useState } from 'react';

const SwissTournamentSimulator = () => {
    const [players, setPlayers] = useState(32);
    const [rounds, setRounds] = useState(5);
    const [drawChance, setDrawChance] = useState(5);
    const [simulations, setSimulations] = useState(1000);
    const [results, setResults] = useState(null);
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
    const simulateMatch = (player1, player2, drawPercent) => {
        if (!player2) {
            // Bye - player gets 3 points
            return { winner: player1, loser: null, draw: false, bye: true };
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
    const runTournament = (numPlayers, numRounds, drawPercent) => {
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
        for (let round = 0; round < numRounds; round++) {
            const pairs = pairPlayers(playerScores);

            pairs.forEach(([p1, p2]) => {
                const result = simulateMatch(p1, p2, drawPercent);

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

    // Run multiple simulations
    const runSimulations = () => {
        setIsRunning(true);

        // Use setTimeout to allow UI to update
        setTimeout(() => {
            const recordData = {};

            for (let sim = 0; sim < simulations; sim++) {
                const tournamentResult = runTournament(players, rounds, drawChance);

                // Count players by record
                const recordCounts = {};
                tournamentResult.forEach(player => {
                    const record = getRecordString(player);
                    const targetRecord = isTargetRecord(record);
                    if (targetRecord) {
                        recordCounts[targetRecord] = (recordCounts[targetRecord] || 0) + 1;
                    }
                });

                // Store the counts for this simulation
                Object.keys(recordCounts).forEach(record => {
                    if (!recordData[record]) {
                        recordData[record] = [];
                    }
                    recordData[record].push(recordCounts[record]);
                });

                // Also store 0 counts for records that didn't appear
                const targetRecords = [`${rounds}-0`, `${rounds - 1}-0-1`, `${rounds - 1}-1`, `${rounds - 2}-1-1`, `${rounds - 2}-2`];
                targetRecords.forEach(record => {
                    if (!recordCounts[record]) {
                        if (!recordData[record]) {
                            recordData[record] = [];
                        }
                        recordData[record].push(0);
                    }
                });
            }

            // Calculate statistics for each record
            const processedResults = {};

            Object.keys(recordData).forEach(record => {
                const counts = recordData[record];

                // Distribution of players at this exact record
                const distribution = {};
                counts.forEach(count => {
                    distribution[count] = (distribution[count] || 0) + 1;
                });

                // Convert to percentages
                const distributionPercentages = {};
                Object.keys(distribution).forEach(count => {
                    distributionPercentages[count] = (distribution[count] / simulations * 100).toFixed(1);
                });

                // Calculate "this record and better" statistics
                const recordAndBetterCounts = [];
                for (let sim = 0; sim < simulations; sim++) {
                    let totalAtThisRecordAndBetter = 0;

                    // Get all records from this simulation and count those at this record or better
                    const allRecordsThisSim = {};
                    const tournamentResult = runTournament(players, rounds, drawChance);

                    tournamentResult.forEach(player => {
                        const playerRecord = getRecordString(player);
                        const targetRecord = isTargetRecord(playerRecord);
                        if (targetRecord) {
                            allRecordsThisSim[targetRecord] = (allRecordsThisSim[targetRecord] || 0) + 1;
                        }
                    });

                    // Count players at this record or better
                    Object.keys(allRecordsThisSim).forEach(otherRecord => {
                        if (compareRecords(otherRecord, record) <= 0) { // otherRecord is same or better
                            totalAtThisRecordAndBetter += allRecordsThisSim[otherRecord];
                        }
                    });

                    recordAndBetterCounts.push(totalAtThisRecordAndBetter);
                }

                // Distribution of players at this record and better
                const recordAndBetterDistribution = {};
                recordAndBetterCounts.forEach(count => {
                    recordAndBetterDistribution[count] = (recordAndBetterDistribution[count] || 0) + 1;
                });

                const recordAndBetterPercentages = {};
                Object.keys(recordAndBetterDistribution).forEach(count => {
                    recordAndBetterPercentages[count] = (recordAndBetterDistribution[count] / simulations * 100).toFixed(1);
                });

                processedResults[record] = {
                    exactDistribution: distributionPercentages,
                    recordAndBetterDistribution: recordAndBetterPercentages
                };
            });

            setResults(processedResults);
            setIsRunning(false);
        }, 100);
    };

    const maxPossiblePoints = rounds * 3;
    const expectedPoints = rounds * (3 * 0.5 * (1 - drawChance / 100) + 1 * (drawChance / 100));

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

            {results && (
                <div className="space-y-6">
                    {Object.keys(results).sort(compareRecords).map(record => (
                        <div key={record} className="bg-white p-6 rounded-lg border">
                            <h3 className="text-2xl font-bold mb-4 text-blue-600">{record} Record</h3>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <h4 className="text-lg font-semibold mb-3">Players at Exactly {record}</h4>
                                    <div className="space-y-2 max-h-64 overflow-y-auto">
                                        {Object.entries(results[record].exactDistribution)
                                            .sort(([a], [b]) => parseInt(a) - parseInt(b))
                                            .map(([count, percentage]) => (
                                                <div key={count} className="flex justify-between text-sm">
                                                    <span>{count} players:</span>
                                                    <span className="font-bold">{percentage}%</span>
                                                </div>
                                            ))}
                                    </div>
                                </div>

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
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default SwissTournamentSimulator;