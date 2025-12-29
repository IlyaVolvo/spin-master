/**
 * Script to recalculate all player ratings from scratch
 * 
 * This script processes all completed tournaments chronologically
 * and recalculates ratings using the USATT 4-pass algorithm.
 * 
 * Usage:
 *   npx tsx scripts/recalculateAllRatings.ts
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import { recalculateAllRatings } from '../src/services/usattRatingService';

dotenv.config({ path: '.env' });

const prisma = new PrismaClient();

async function main() {
  console.log('\n=== Recalculating All Player Ratings ===\n');

  try {
    // Get count of completed tournaments
    const tournamentCount = await prisma.tournament.count({
      where: { status: 'COMPLETED' },
    });

    console.log(`Found ${tournamentCount} completed tournament(s) to process.`);

    if (tournamentCount === 0) {
      console.log('No completed tournaments found. Nothing to recalculate.');
      return;
    }

    // Get player count
    const playerCount = await prisma.player.count({
      where: { isActive: true },
    });

    console.log(`Processing ratings for ${playerCount} active player(s).\n`);

    // Get initial ratings snapshot
    const playersBefore = await prisma.player.findMany({
      where: { isActive: true },
      select: { id: true, firstName: true, lastName: true, rating: true },
      orderBy: { rating: 'desc' },
    });

    console.log('Current ratings (before recalculation):');
    playersBefore.slice(0, 10).forEach((player, index) => {
      console.log(`  ${index + 1}. ${player.firstName} ${player.lastName}: ${player.rating ?? 'Unrated'}`);
    });
    if (playersBefore.length > 10) {
      console.log(`  ... and ${playersBefore.length - 10} more`);
    }
    console.log('');

    // Recalculate all ratings
    console.log('Starting recalculation...\n');
    await recalculateAllRatings();
    console.log('✓ Recalculation complete\n');

    // Get updated ratings snapshot
    const playersAfter = await prisma.player.findMany({
      where: { isActive: true },
      select: { id: true, firstName: true, lastName: true, rating: true },
      orderBy: { rating: 'desc' },
    });

    console.log('Updated ratings (after recalculation):');
    playersAfter.slice(0, 10).forEach((player, index) => {
      const beforePlayer = playersBefore.find(p => p.id === player.id);
      const beforeRating = beforePlayer?.rating ?? null;
      const afterRating = player.rating ?? null;
      const change = beforeRating !== null && afterRating !== null 
        ? (afterRating - beforeRating >= 0 ? '+' : '') + (afterRating - beforeRating)
        : 'N/A';
      
      console.log(`  ${index + 1}. ${player.firstName} ${player.lastName}: ${afterRating ?? 'Unrated'} (${change})`);
    });
    if (playersAfter.length > 10) {
      console.log(`  ... and ${playersAfter.length - 10} more`);
    }

    console.log('\n✅ All ratings have been recalculated successfully!\n');
  } catch (error) {
    console.error('\n❌ Error recalculating ratings:', error);
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

