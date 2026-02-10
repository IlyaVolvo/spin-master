/**
 * Script to populate random matches for players within a specified rating bracket
 * 
 * Usage:
 *   npx tsx scripts/generateRatingBracketMatches.ts <minRating> <maxRating> <numMatches>
 * 
 * Example:
 *   npx tsx scripts/generateRatingBracketMatches.ts 1200 1600 20
 *   (Creates 20 matches between players with ratings between 1200 and 1600)
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
 * Get a random pair of players from the list
 */
function getRandomPair<T>(players: T[]): [T, T] | null {
  if (players.length < 2) return null;

  const shuffled = [...players].sort(() => Math.random() - 0.5);
  return [shuffled[0], shuffled[1]];
}

async function generateMatches(minRating: number, maxRating: number, numMatches: number) {
  console.log(`\n=== Generating ${numMatches} matches for players with ratings between ${minRating} and ${maxRating} ===\n`);

  // Find players within the rating bracket
  const players = await prisma.player.findMany({
    where: {
      isActive: true,
      rating: {
        gte: minRating,
        lte: maxRating,
      },
    },
    orderBy: { rating: 'desc' },
  });

  if (players.length < 2) {
    console.error(`❌ Not enough players found. Need at least 2 players, found ${players.length}.`);
    console.log(`   Players with ratings between ${minRating} and ${maxRating}:`);
    if (players.length === 1) {
      console.log(`   - ${players[0].firstName} ${players[0].lastName} (Rating: ${players[0].rating})`);
    }
    process.exit(1);
  }

  console.log(`Found ${players.length} player(s) in rating bracket:`);
  players.forEach((player) => {
    console.log(`  - ${player.firstName} ${player.lastName} (Rating: ${player.rating ?? 'Unrated'}, ID: ${player.id})`);
  });
  console.log('');

  // Generate matches
  const matchesCreated: Array<{ player1: string; player2: string; score: string }> = [];
  let created = 0;
  let skipped = 0;

  for (let i = 0; i < numMatches; i++) {
    // Get random pair
    const pair = getRandomPair(players);
    if (!pair) {
      console.error('❌ Not enough players to create a match');
      break;
    }

    const [player1, player2] = pair;

    // Reload players to get current ratings (they may have changed)
    const currentPlayers = await prisma.player.findMany({
      where: { id: { in: [player1.id, player2.id] } },
    });

    const currentPlayer1 = currentPlayers.find(p => p.id === player1.id) ?? player1;
    const currentPlayer2 = currentPlayers.find(p => p.id === player2.id) ?? player2;

    const rating1 = currentPlayer1.rating ?? 1200;
    const rating2 = currentPlayer2.rating ?? 1200;

    // Generate match score
    const { player1Sets, player2Sets } = generateBestOf5Score(rating1, rating2);

    // Create tournament for the match
    const tournamentName = `${player1.firstName} ${player1.lastName} vs ${player2.firstName} ${player2.lastName} - ${new Date().toLocaleDateString()}`;

    try {
      // Create tournament with participants
      const tournament = await prisma.tournament.create({
        data: {
          name: tournamentName,
          type: 'ROUND_ROBIN',
          status: 'COMPLETED',
          participants: {
            create: [
              {
                playerId: player1.id,
                playerRatingAtTime: rating1,
              },
              {
                playerId: player2.id,
                playerRatingAtTime: rating2,
              },
            ],
          },
        },
      });

      // Create match
      const match = await prisma.match.create({
        data: {
          tournamentId: tournament.id,
          player1Id: player1.id,
          player2Id: player2.id,
          player1Sets,
          player2Sets,
        },
      });

      // Determine winner and update ratings
      const player1Won = player1Sets > player2Sets;

      // Import rating adjustment function
      const { adjustRatingsForSingleMatch } = await import('../src/services/usattRatingService');
      await adjustRatingsForSingleMatch(player1.id, player2.id, player1Won, tournament.id);

      // Create ranking history entries (ratings are tracked, not rankings for single matches)
      // Rankings are recalculated separately based on tournament results

      // Mark tournament as completed
      await prisma.tournament.update({
        where: { id: tournament.id },
        data: { status: 'COMPLETED' },
      });

      // Reload players to get updated ratings
      const finalPlayers = await prisma.player.findMany({
        where: { id: { in: [player1.id, player2.id] } },
      });
      const finalPlayer1 = finalPlayers.find(p => p.id === player1.id);
      const finalPlayer2 = finalPlayers.find(p => p.id === player2.id);

      const winnerName = player1Won
        ? `${player1.firstName} ${player1.lastName}`
        : `${player2.firstName} ${player2.lastName}`;

      console.log(
        `✓ Match ${i + 1}/${numMatches}: ${player1.firstName} ${player1.lastName} (${rating1}) vs ${player2.firstName} ${player2.lastName} (${rating2}) → ${player1Sets}-${player2Sets} | Winner: ${winnerName}`
      );
      console.log(
        `  Ratings updated: ${player1.firstName} ${player1.lastName}: ${rating1} → ${finalPlayer1?.rating ?? 'N/A'}, ${player2.firstName} ${player2.lastName}: ${rating2} → ${finalPlayer2?.rating ?? 'N/A'}`
      );

      matchesCreated.push({
        player1: `${player1.firstName} ${player1.lastName}`,
        player2: `${player2.firstName} ${player2.lastName}`,
        score: `${player1Sets}-${player2Sets}`,
      });

      created++;
    } catch (error) {
      console.error(`❌ Error creating match ${i + 1}:`, error instanceof Error ? error.message : String(error));
      skipped++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`✅ Successfully created: ${created} match(es)`);
  if (skipped > 0) {
    console.log(`⚠️  Skipped: ${skipped} match(es)`);
  }

  // Show final player ratings
  console.log(`\n=== Updated Player Ratings ===`);
  const finalPlayersList = await prisma.player.findMany({
    where: {
      id: { in: players.map(p => p.id) },
    },
    orderBy: { rating: 'desc' },
  });

  finalPlayersList.forEach((player) => {
    const originalRating = players.find(p => p.id === player.id)?.rating;
    const currentRating = player.rating;
    const change = originalRating && currentRating ? currentRating - originalRating : 0;
    const changeStr = change !== 0 ? ` (${change > 0 ? '+' : ''}${change})` : '';
    console.log(`  ${player.firstName} ${player.lastName}: ${currentRating ?? 'Unrated'}${changeStr}`);
  });
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  if (args.length !== 3) {
    console.error('Usage: npx tsx scripts/generateRatingBracketMatches.ts <minRating> <maxRating> <numMatches>');
    console.error('Example: npx tsx scripts/generateRatingBracketMatches.ts 1200 1600 20');
    process.exit(1);
  }

  const minRating = parseInt(args[0]);
  const maxRating = parseInt(args[1]);
  const numMatches = parseInt(args[2]);

  if (isNaN(minRating) || isNaN(maxRating) || isNaN(numMatches)) {
    console.error('❌ Error: All arguments must be valid numbers');
    process.exit(1);
  }

  if (minRating < 0 || maxRating < 0 || numMatches < 1) {
    console.error('❌ Error: Ratings must be non-negative and number of matches must be at least 1');
    process.exit(1);
  }

  if (minRating > maxRating) {
    console.error('❌ Error: minRating must be less than or equal to maxRating');
    process.exit(1);
  }

  try {
    await generateMatches(minRating, maxRating, numMatches);
  } catch (error) {
    console.error('❌ Fatal error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

