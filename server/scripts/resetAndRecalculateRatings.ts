/**
 * Script to reset all player ratings to their first tournament's playerRatingAtTime
 * and then recalculate all ratings from scratch
 * 
 * This ensures we start with the correct baseline ratings
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import { recalculateAllRatings } from '../src/services/usattRatingService';

dotenv.config({ path: '.env' });

const prisma = new PrismaClient();

async function main() {
  console.log('\n=== Resetting and Recalculating All Ratings ===\n');

  try {
    // Get all completed tournaments in chronological order
    const tournaments = await prisma.tournament.findMany({
      where: { status: 'COMPLETED' },
      orderBy: { createdAt: 'asc' },
      include: {
        participants: {
          include: { player: true },
        },
      },
    });

    // Find first tournament appearance for each player
    const firstTournamentRatings = new Map<number, number | null>();
    
    for (const tournament of tournaments) {
      for (const participant of tournament.participants) {
        if (!firstTournamentRatings.has(participant.playerId)) {
          firstTournamentRatings.set(participant.playerId, participant.playerRatingAtTime);
        }
      }
    }

    console.log(`Found ${firstTournamentRatings.size} players in tournaments`);
    console.log('Resetting all player ratings to their first tournament appearance...\n');

    // Reset all player ratings to their first tournament's playerRatingAtTime
    for (const [playerId, rating] of firstTournamentRatings.entries()) {
      await prisma.player.update({
        where: { id: playerId },
        data: { rating },
      });
    }

    // Also reset ratings for players not in any tournament (keep their current rating or set to null)
    const allPlayers = await prisma.player.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    const playersInTournaments = new Set(firstTournamentRatings.keys());
    for (const player of allPlayers) {
      if (!playersInTournaments.has(player.id)) {
        // Keep current rating for players not in tournaments
        // (don't update them)
      }
    }

    console.log('✓ All ratings reset to first tournament appearance\n');
    console.log('Starting full recalculation...\n');

    // Now recalculate all ratings from scratch
    await recalculateAllRatings();

    console.log('\n✅ All ratings have been reset and recalculated!\n');

    // Show some examples
    const samplePlayers = await prisma.player.findMany({
      where: { 
        id: { in: Array.from(firstTournamentRatings.keys()).slice(0, 10) }
      },
      select: { id: true, firstName: true, lastName: true, rating: true },
      orderBy: { rating: 'desc' },
    });

    console.log('Sample updated ratings:');
    for (const player of samplePlayers) {
      const originalRating = firstTournamentRatings.get(player.id);
      const change = originalRating !== null && player.rating !== null 
        ? (player.rating - originalRating >= 0 ? '+' : '') + (player.rating - originalRating)
        : 'N/A';
      console.log(`  ${player.firstName} ${player.lastName}: ${player.rating ?? 'Unrated'} (from ${originalRating ?? 'null'}, change: ${change})`);
    }
  } catch (error) {
    console.error('\n❌ Error:', error);
    throw error;
  }
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

