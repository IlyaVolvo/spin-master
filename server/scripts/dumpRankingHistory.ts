/**
 * Script to dump all ranking history from the database
 * 
 * Usage:
 *   cd server
 *   npx tsx scripts/dumpRankingHistory.ts
 * 
 * Options:
 *   npx tsx scripts/dumpRankingHistory.ts > ranking_history_dump.txt    # Save to file
 *   npx tsx scripts/dumpRankingHistory.ts | jq                          # Pretty JSON output (requires jq)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function dumpRankingHistory() {
  try {
    console.log('Fetching all ranking history from database...\n');
    
    // Get all ranking history with related player data
    const rankingHistory = await prisma.rankingHistory.findMany({
      include: {
        player: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [
        { timestamp: 'desc' }, // Most recent first
      ],
    });

    console.log(`Total ranking history entries: ${rankingHistory.length}\n`);
    console.log('='.repeat(80));
    
    // Summary statistics
    const uniquePlayers = new Set(rankingHistory.map(h => h.playerId)).size;
    const withTournament = rankingHistory.filter(h => h.tournamentId !== null).length;
    const withoutTournament = rankingHistory.filter(h => h.tournamentId === null).length;
    
    console.log('\nSummary:');
    console.log(`  Total entries: ${rankingHistory.length}`);
    console.log(`  Unique players: ${uniquePlayers}`);
    console.log(`  Entries with tournament: ${withTournament}`);
    console.log(`  Entries without tournament: ${withoutTournament}`);
    console.log('\n' + '='.repeat(80) + '\n');

    // Group by player for better readability
    const historyByPlayer = new Map<number, typeof rankingHistory>();
    rankingHistory.forEach(entry => {
      if (!historyByPlayer.has(entry.playerId)) {
        historyByPlayer.set(entry.playerId, []);
      }
      historyByPlayer.get(entry.playerId)!.push(entry);
    });

    // Display by player
    for (const [playerId, entries] of historyByPlayer.entries()) {
      const player = entries[0].player;
      console.log(`\nPlayer: ${player.firstName} ${player.lastName} (ID: ${playerId})`);
      console.log(`  Total history entries: ${entries.length}`);
      console.log('  History:');
      
      entries.forEach((entry, index) => {
        console.log(`    ${index + 1}. Ranking: ${entry.ranking ?? 'N/A'}`);
        console.log(`       Date: ${entry.timestamp.toISOString()}`);
        console.log(`       Reason: ${entry.reason}`);
        if (entry.tournamentId) {
          console.log(`       Tournament ID: ${entry.tournamentId}`);
        }
        console.log('');
      });
      
      console.log('-'.repeat(80));
    }

    // Chronological view
    console.log('\n' + '='.repeat(80));
    console.log('\nChronological View (Most Recent First):\n');
    rankingHistory.forEach((entry, index) => {
      console.log(`${index + 1}. ${entry.player.firstName} ${entry.player.lastName} (ID: ${entry.playerId})`);
      console.log(`   Ranking: ${entry.ranking ?? 'N/A'} | ${entry.timestamp.toISOString()}`);
      console.log(`   Reason: ${entry.reason}`);
      if (entry.tournamentId) {
        console.log(`   Tournament ID: ${entry.tournamentId}`);
      }
      console.log('');
    });

    // JSON export option
    console.log('\n' + '='.repeat(80));
    console.log('\nJSON Export (for programmatic use):\n');
    console.log(JSON.stringify(rankingHistory, null, 2));

  } catch (error) {
    console.error('Error dumping ranking history:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
dumpRankingHistory()
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

