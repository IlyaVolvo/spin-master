/**
 * Script to generate a round-robin tournament with randomly selected players
 * 
 * Usage:
 *   npx tsx scripts/generateRandomRoundRobinTournament.ts <numPlayers> [minRating] [maxRating] [tournamentName]
 * 
 * Examples:
 *   npx tsx scripts/generateRandomRoundRobinTournament.ts 5
 *   (Creates a tournament with 5 random players)
 * 
 *   npx tsx scripts/generateRandomRoundRobinTournament.ts 8 1200 1800
 *   (Creates a tournament with 8 random players with ratings between 1200 and 1800)
 * 
 *   npx tsx scripts/generateRandomRoundRobinTournament.ts 6 1500 2000 "Mid-Level Championship"
 *   (Creates a tournament with 6 random players (1500-2000 rating) with custom name)
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const prisma = new PrismaClient();

/**
 * Calculate probability of player 1 winning a set based on rating difference
 * Uses Elo-style formula: P = 1 / (1 + 10^((rating2 - rating1) / 400))
 */
function calculateWinProbability(rating1: number, rating2: number): number {
  const ratingDiff = rating2 - rating1;
  return 1 / (1 + Math.pow(10, ratingDiff / 400));
}

/**
 * Simulate a single set - returns true if player1 wins
 */
function simulateSet(player1WinProbability: number): boolean {
  return Math.random() < player1WinProbability;
}

/**
 * Generate a best-of-5 match score probabilistically
 * Returns { player1Sets, player2Sets }
 */
function generateBestOf5Score(rating1: number, rating2: number): { player1Sets: number; player2Sets: number } {
  const player1WinProbability = calculateWinProbability(rating1, rating2);
  let player1Sets = 0;
  let player2Sets = 0;

  // Play sets until someone wins 3
  while (player1Sets < 3 && player2Sets < 3) {
    if (simulateSet(player1WinProbability)) {
      player1Sets++;
    } else {
      player2Sets++;
    }
  }

  return { player1Sets, player2Sets };
}

/**
 * Generate all round-robin matchups for n players
 * Returns array of [player1Index, player2Index] pairs
 */
function generateRoundRobinMatchups(numPlayers: number): Array<[number, number]> {
  const matchups: Array<[number, number]> = [];
  for (let i = 0; i < numPlayers; i++) {
    for (let j = i + 1; j < numPlayers; j++) {
      matchups.push([i, j]);
    }
  }
  return matchups;
}

/**
 * Shuffle an array randomly (Fisher-Yates algorithm)
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

async function generateRandomRoundRobinTournament(
  numPlayers: number,
  minRating?: number,
  maxRating?: number,
  tournamentName?: string
) {
  console.log(`\n=== Generating Round-Robin Tournament with ${numPlayers} Random Players ===\n`);

  // Build where clause for player selection
  const whereClause: any = {
    isActive: true,
    rating: { not: null },
  };

  if (minRating !== undefined || maxRating !== undefined) {
    whereClause.rating = {};
    if (minRating !== undefined) {
      whereClause.rating.gte = minRating;
    }
    if (maxRating !== undefined) {
      whereClause.rating.lte = maxRating;
    }
  }

  // Get all eligible players
  const allEligiblePlayers = await prisma.player.findMany({
    where: whereClause,
    orderBy: { rating: 'desc' },
  });

  if (allEligiblePlayers.length < numPlayers) {
    console.error(
      `❌ Not enough players found. Need ${numPlayers} players, but only found ${allEligiblePlayers.length} eligible players.`
    );
    if (minRating !== undefined || maxRating !== undefined) {
      console.error(`   Rating filter: ${minRating ?? 'no min'} - ${maxRating ?? 'no max'}`);
    }
    process.exit(1);
  }

  // Randomly select players
  const shuffledPlayers = shuffleArray(allEligiblePlayers);
  const selectedPlayers = shuffledPlayers.slice(0, numPlayers);

  console.log(`Selected ${numPlayers} random player(s):`);
  selectedPlayers.forEach((player, index) => {
    console.log(`  ${index + 1}. ${player.firstName} ${player.lastName} (Rating: ${player.rating}, ID: ${player.id})`);
  });
  console.log('');

  // Generate tournament name
  if (!tournamentName) {
    const dateStr = new Date().toLocaleDateString();
    const ratingFilter = minRating !== undefined || maxRating !== undefined
      ? ` (${minRating ?? 'any'}-${maxRating ?? 'any'} rating)`
      : '';
    tournamentName = `Random Round-Robin Tournament - ${dateStr}${ratingFilter}`;
  }

  // Create tournament with participants
  console.log(`Creating tournament: "${tournamentName}"...`);
  const tournament = await prisma.tournament.create({
    data: {
      name: tournamentName,
      type: 'ROUND_ROBIN',
      status: 'ACTIVE',
      participants: {
        create: selectedPlayers.map((player) => ({
          playerId: player.id,
          playerRatingAtTime: player.rating,
        })),
      },
    },
    include: {
      participants: {
        include: {
          player: true,
        },
      },
    },
  });

  console.log(`✓ Tournament created (ID: ${tournament.id})\n`);

  // Generate all round-robin matchups
  const matchups = generateRoundRobinMatchups(selectedPlayers.length);
  console.log(`Generating ${matchups.length} matches...\n`);

  const matches: Array<{
    player1Id: number;
    player2Id: number;
    player1Sets: number;
    player2Sets: number;
    player1Name: string;
    player2Name: string;
  }> = [];

  // Create all matches
  for (const [idx1, idx2] of matchups) {
    const player1 = selectedPlayers[idx1];
    const player2 = selectedPlayers[idx2];
    const rating1 = player1.rating ?? 1200;
    const rating2 = player2.rating ?? 1200;

    // Generate score probabilistically
    const { player1Sets, player2Sets } = generateBestOf5Score(rating1, rating2);

    // Create match in database
    await prisma.match.create({
      data: {
        tournamentId: tournament.id,
        player1Id: player1.id,
        player2Id: player2.id,
        player1Sets,
        player2Sets,
      },
    });

    const winner =
      player1Sets > player2Sets
        ? `${player1.firstName} ${player1.lastName}`
        : `${player2.firstName} ${player2.lastName}`;

    console.log(
      `  ${player1.firstName} ${player1.lastName} (${rating1}) vs ${player2.firstName} ${player2.lastName} (${rating2}) → ${player1Sets}-${player2Sets} | Winner: ${winner}`
    );

    matches.push({
      player1Id: player1.id,
      player2Id: player2.id,
      player1Sets,
      player2Sets,
      player1Name: `${player1.firstName} ${player1.lastName}`,
      player2Name: `${player2.firstName} ${player2.lastName}`,
    });
  }

  console.log('\n✓ All matches created\n');

  // Complete the tournament
  console.log('Completing tournament and recalculating ratings...');
  await prisma.tournament.update({
    where: { id: tournament.id },
    data: { status: 'COMPLETED' },
  });

  // Recalculate rankings (this also recalculates all ratings automatically)
  const { recalculateRankings } = await import('../src/services/rankingService');
  await recalculateRankings(tournament.id);

  console.log('✓ Tournament completed and ratings/rankings recalculated\n');

  // Show final standings
  console.log('=== Final Standings ===\n');

  // Reload players to get updated ratings
  const updatedPlayers = await prisma.player.findMany({
    where: {
      id: { in: selectedPlayers.map(p => p.id) },
    },
    orderBy: { rating: 'desc' },
  });

  // Calculate wins and losses for each player
  const playerStats = new Map<
    number,
    {
      wins: number;
      losses: number;
      setsWon: number;
      setsLost: number;
    }
  >();

  selectedPlayers.forEach((player) => {
    playerStats.set(player.id, {
      wins: 0,
      losses: 0,
      setsWon: 0,
      setsLost: 0,
    });
  });

  matches.forEach((match) => {
    const stats1 = playerStats.get(match.player1Id)!;
    const stats2 = playerStats.get(match.player2Id)!;

    stats1.setsWon += match.player1Sets;
    stats1.setsLost += match.player2Sets;
    stats2.setsWon += match.player2Sets;
    stats2.setsLost += match.player1Sets;

    if (match.player1Sets > match.player2Sets) {
      stats1.wins++;
      stats2.losses++;
    } else {
      stats1.losses++;
      stats2.wins++;
    }
  });

  // Display standings
  updatedPlayers.forEach((player, index) => {
    const stats = playerStats.get(player.id)!;
    const originalRating = selectedPlayers.find((p) => p.id === player.id)?.rating ?? 0;
    const ratingChange = (player.rating ?? 0) - originalRating;
    const ratingChangeStr = ratingChange !== 0 ? ` (${ratingChange > 0 ? '+' : ''}${ratingChange})` : '';

    console.log(
      `${index + 1}. ${player.firstName} ${player.lastName} - W: ${stats.wins}, L: ${stats.losses} | Rating: ${player.rating}${ratingChangeStr}`
    );
  });

  console.log('\n✅ Tournament generation complete!\n');
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: npx tsx scripts/generateRandomRoundRobinTournament.ts <numPlayers> [minRating] [maxRating] [tournamentName]');
    console.error('\nExamples:');
    console.error('  npx tsx scripts/generateRandomRoundRobinTournament.ts 5');
    console.error('  npx tsx scripts/generateRandomRoundRobinTournament.ts 8 1200 1800');
    console.error('  npx tsx scripts/generateRandomRoundRobinTournament.ts 6 1500 2000 "Mid-Level Championship"');
    process.exit(1);
  }

  const numPlayers = parseInt(args[0]);
  const minRating = args[1] ? parseInt(args[1]) : undefined;
  const maxRating = args[2] ? parseInt(args[2]) : undefined;
  const tournamentName = args[3] ? args.slice(3).join(' ') : undefined;

  if (isNaN(numPlayers) || numPlayers < 2) {
    console.error('❌ Error: numPlayers must be a valid integer >= 2');
    process.exit(1);
  }

  if (minRating !== undefined && (isNaN(minRating) || minRating < 0)) {
    console.error('❌ Error: minRating must be a valid non-negative number');
    process.exit(1);
  }

  if (maxRating !== undefined && (isNaN(maxRating) || maxRating < 0)) {
    console.error('❌ Error: maxRating must be a valid non-negative number');
    process.exit(1);
  }

  if (minRating !== undefined && maxRating !== undefined && minRating > maxRating) {
    console.error('❌ Error: minRating must be less than or equal to maxRating');
    process.exit(1);
  }

  try {
    await generateRandomRoundRobinTournament(numPlayers, minRating, maxRating, tournamentName);
  } catch (error) {
    console.error('❌ Fatal error:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

