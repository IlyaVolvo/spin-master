/**
 * Script to delete inactive players from the database
 * 
 * Usage:
 *   cd server
 *   npx tsx scripts/deleteInactivePlayers.ts
 * 
 * This script:
 * - Finds all players with isActive: false
 * - Deletes players without tournament participations
 * - Warns about players that cannot be deleted (have tournament history)
 * - Automatically deletes ranking history (cascade delete)
 * 
 * Note: Players without ratings are NOT considered inactive.
 * Only players with isActive: false are deleted.
 * 
 * See README.md "Maintenance" section for more details.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deleteInactivePlayers() {
  try {
    console.log('Checking for inactive players...');
    
    // First, get all inactive players
    const inactivePlayers = await prisma.player.findMany({
      where: { isActive: false },
      include: {
        tournamentParticipants: true,
        rankingHistory: true,
      },
    });

    console.log(`Found ${inactivePlayers.length} inactive player(s)`);

    if (inactivePlayers.length === 0) {
      console.log('No inactive players to delete.');
      return;
    }

    // Check which players have tournament participations
    const playersWithTournaments = inactivePlayers.filter(
      p => p.tournamentParticipants.length > 0
    );
    const playersWithoutTournaments = inactivePlayers.filter(
      p => p.tournamentParticipants.length === 0
    );

    if (playersWithTournaments.length > 0) {
      console.log(`\n⚠️  Warning: ${playersWithTournaments.length} inactive player(s) have tournament participations:`);
      playersWithTournaments.forEach(p => {
        console.log(`  - ${p.name} (ID: ${p.id}) - ${p.tournamentParticipants.length} tournament(s)`);
      });
      console.log('\nThese players cannot be deleted because they have tournament history.');
      console.log('You would need to delete their tournament participations first, which may affect tournament results.');
    }

    if (playersWithoutTournaments.length > 0) {
      console.log(`\nDeleting ${playersWithoutTournaments.length} inactive player(s) without tournament participations...`);
      
      // Delete players without tournament participations
      // RankingHistory will be automatically deleted due to Cascade
      for (const player of playersWithoutTournaments) {
        await prisma.player.delete({
          where: { id: player.id },
        });
        console.log(`  ✓ Deleted: ${player.firstName} ${player.lastName} (ID: ${player.id})`);
      }
      
      console.log(`\n✅ Successfully deleted ${playersWithoutTournaments.length} inactive player(s).`);
    }

    // Summary
    console.log('\n--- Summary ---');
    console.log(`Total inactive players: ${inactivePlayers.length}`);
    console.log(`Deleted: ${playersWithoutTournaments.length}`);
    console.log(`Cannot delete (have tournaments): ${playersWithTournaments.length}`);

  } catch (error) {
    console.error('Error deleting inactive players:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
deleteInactivePlayers()
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

