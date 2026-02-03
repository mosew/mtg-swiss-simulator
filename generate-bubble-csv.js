// Script to generate CSV with bubble size distributions
// Rows = bubble size, Columns = player size (26-45)
// Top 8 cut, 5 rounds, 5% draw frequency, intentional draws allowed, 50k simulations

import fs from 'fs';

// Core simulation functions extracted from SwissTournamentSimulator.jsx

const isSafeForCut = (player, opponent, allPlayers, cut, currentRound, totalRounds) => {
    const playerScoreAfterDraw = player.points + 1;
    const minFinalPlayerScore = playerScoreAfterDraw;

    let potentialPassers = 0;
    for (const p of allPlayers) {
        if (p.id === player.id) continue;

        let maxPossibleScore;
        if (p.id === opponent.id) {
            maxPossibleScore = p.points + 1 + 3 * (totalRounds - currentRound);
        } else {
            maxPossibleScore = p.points + 3 * (totalRounds - (currentRound - 1));
        }

        if (maxPossibleScore >= minFinalPlayerScore) {
            potentialPassers++;
        }
    }

    return potentialPassers < cut;
};

const pairPlayers = (playerScores) => {
    const sorted = [...playerScores].sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return a.id - b.id;
    });

    const pairs = [];
    const used = new Set();

    for (let i = 0; i < sorted.length; i++) {
        if (used.has(sorted[i].id)) continue;

        for (let j = i + 1; j < sorted.length; j++) {
            if (!used.has(sorted[j].id)) {
                pairs.push([sorted[i], sorted[j]]);
                used.add(sorted[i].id);
                used.add(sorted[j].id);
                break;
            }
        }
    }

    if (used.size < sorted.length) {
        const byePlayer = sorted.find(p => !used.has(p.id));
        pairs.push([byePlayer, null]);
    }

    return pairs;
};

const simulateMatch = (player1, player2, drawPercent, useID = false, allPlayers = [], currentRound = 0, totalRounds = 0, cutSize = 8, rand) => {
    if (!player2) {
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
    playerScores.forEach(player => {
        if (player.opponents.length > 0) {
            const opponentWinPercentages = player.opponents.map(oppId => {
                const opponent = playerScores[oppId];
                if (!opponent) return 0;
                const totalGames = opponent.wins + opponent.losses + opponent.draws;
                return totalGames > 0 ? (opponent.wins + opponent.draws * 0.5) / totalGames : 0;
            });
            player.opponentWinPercentage = opponentWinPercentages.reduce((sum, pct) => sum + pct, 0) / opponentWinPercentages.length;
        } else {
            player.opponentWinPercentage = 0;
        }
    });

    const rankedPlayers = [...playerScores].sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.opponentWinPercentage !== a.opponentWinPercentage) return b.opponentWinPercentage - a.opponentWinPercentage;
        return a.id - b.id;
    });

    return rankedPlayers;
};

const processRound = (playerScores, pairs, drawPercent, useID, cutSize, round, numRounds, getMatchOutcome) => {
    pairs.forEach(([p1, p2]) => {
        if (!p2) {
            playerScores[p1.id].points += 3;
            playerScores[p1.id].wins += 1;
            return;
        }

        const rand = getMatchOutcome(p1, p2);
        const result = simulateMatch(p1, p2, drawPercent, useID, playerScores, round, numRounds, cutSize, rand);

        if (result.draw) {
            playerScores[p1.id].points += 1;
            playerScores[p2.id].points += 1;
            playerScores[p1.id].draws += 1;
            playerScores[p2.id].draws += 1;
            playerScores[p1.id].opponents.push(p2.id);
            playerScores[p2.id].opponents.push(p1.id);
        } else {
            playerScores[result.winner.id].points += 3;
            playerScores[result.winner.id].wins += 1;
            playerScores[result.loser.id].losses += 1;
            playerScores[result.winner.id].opponents.push(result.loser.id);
            playerScores[result.loser.id].opponents.push(result.winner.id);
        }
    });
};

const calculateBubbleStats = (bubbleSizes, numSimulations) => {
    if (bubbleSizes.length === 0) {
        return {
            distribution: {}
        };
    }

    const distributionCounts = {};
    bubbleSizes.forEach(size => {
        distributionCounts[size] = (distributionCounts[size] || 0) + 1;
    });

    const distributionPercentages = {};
    Object.keys(distributionCounts).forEach(size => {
        distributionPercentages[size] = (distributionCounts[size] / numSimulations * 100).toFixed(1);
    });

    return {
        distribution: distributionPercentages,
    };
};

const runSimulations = (numPlayers, numRounds, drawChance, numSimulations, useID, cutSize) => {
    const allResults = [];

    for (let i = 0; i < numSimulations; i++) {
        let players = Array.from({ length: numPlayers }, (_, j) => ({
            id: j,
            points: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            opponents: [],
            opponentWinPercentage: 0
        }));

        for (let round = 1; round <= numRounds; round++) {
            const pairs = pairPlayers(players);

            const roundOutcomes = new Map();
            const getMatchOutcome = (p1, p2) => {
                if (!p1 || !p2) return 0;
                const key = p1.id < p2.id ? `${p1.id}-${p2.id}` : `${p2.id}-${p1.id}`;
                if (!roundOutcomes.has(key)) {
                    roundOutcomes.set(key, Math.random() * 100);
                }
                return roundOutcomes.get(key);
            };

            processRound(players, pairs, drawChance, useID, cutSize, round, numRounds, getMatchOutcome);
        }

        allResults.push(rankPlayers(players));
    }

    // Calculate bubble sizes for top 8
    const top8Bubbles = [];
    allResults.forEach(tournamentResult => {
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

    return calculateBubbleStats(top8Bubbles, numSimulations);
};

// Main execution
const numRounds = 6;
const drawChance = 5;
const numSimulations = 50000;
const useID = true;
const cutSize = 8;
const minPlayers = 32;
const maxPlayers = 45;

console.log(`Starting simulations: ${numSimulations} simulations per player count`);
console.log(`Player counts: ${minPlayers} to ${maxPlayers}`);
console.log(`Settings: ${numRounds} rounds, ${drawChance}% draw chance, Top ${cutSize} cut, Intentional Draws: ${useID ? 'ON' : 'OFF'}`);

const results = {};

for (let numPlayers = minPlayers; numPlayers <= maxPlayers; numPlayers++) {
    console.log(`\nRunning simulations for ${numPlayers} players...`);
    const startTime = Date.now();

    const bubbleStats = runSimulations(numPlayers, numRounds, drawChance, numSimulations, useID, cutSize);
    results[numPlayers] = bubbleStats.distribution;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`Completed ${numPlayers} players in ${elapsed}s`);
}

// Convert to CSV format
// Find all unique bubble sizes across all player counts
const allBubbleSizes = new Set();
Object.values(results).forEach(distribution => {
    Object.keys(distribution).forEach(size => {
        allBubbleSizes.add(parseInt(size));
    });
});

const sortedBubbleSizes = Array.from(allBubbleSizes).sort((a, b) => a - b);

// Create CSV content
const csvRows = [];
// Header row
const header = ['bubble size', ...Array.from({ length: maxPlayers - minPlayers + 1 }, (_, i) => minPlayers + i)];
csvRows.push(header.join(','));

// Data rows
sortedBubbleSizes.forEach(bubbleSize => {
    const row = [bubbleSize.toString()];
    for (let nPlayers = minPlayers; nPlayers <= maxPlayers; nPlayers++) {
        const percentage = results[nPlayers][bubbleSize.toString()] || '0.0';
        row.push(percentage);
    }
    csvRows.push(row.join(','));
});

// Write to file
const csvContent = csvRows.join('\n');
const filename = 'bubble-size-distribution.csv';
fs.writeFileSync(filename, csvContent, 'utf8');

console.log(`\n✓ CSV file generated: ${filename}`);
console.log(`  Rows: ${sortedBubbleSizes.length} bubble sizes`);
console.log(`  Columns: ${maxPlayers - minPlayers + 1} player counts (${minPlayers}-${maxPlayers})`);

