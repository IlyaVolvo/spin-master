/**
 * Script to dump all tables from the database
 * 
 * Usage:
 *   cd server
 *   npx tsx scripts/dumpAllTables.ts
 * 
 * Options:
 *   npx tsx scripts/dumpAllTables.ts > all_tables_dump.txt    # Save to file
 *   npx tsx scripts/dumpAllTables.ts | jq                      # Pretty JSON output (requires jq)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function dumpAllTables() {
  try {
    console.log('='.repeat(100));
    console.log('DATABASE DUMP - ALL TABLES');
    console.log('='.repeat(100));
    console.log(`Generated: ${new Date().toISOString()}\n`);

    // ============================================================================
    // MEMBERS TABLE
    // ============================================================================
    console.log('\n' + '='.repeat(100));
    console.log('TABLE: players');
    console.log('='.repeat(100));
    const players = await prisma.player.findMany({
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    console.log(`Total records: ${players.length}\n`);
    if (players.length > 0) {
      players.forEach((player, idx) => {
        console.log(`Player #${idx + 1}:`);
        console.log(`  ID: ${player.id}`);
        console.log(`  First Name: ${player.firstName}`);
        console.log(`  Last Name: ${player.lastName}`);
        console.log(`  Birth Date: ${player.birthDate ? new Date(player.birthDate).toISOString().split('T')[0] : 'N/A'}`);
        console.log(`  Status: ${player.isActive ? 'ACTIVE' : 'INACTIVE'}`);
        console.log(`  Rating: ${player.rating !== null ? player.rating : 'N/A'}`);
        console.log(`  Created: ${player.createdAt.toISOString()}`);
        console.log(`  Updated: ${player.updatedAt.toISOString()}`);
        console.log('');
      });
    } else {
      console.log('(No players found)\n');
    }

    // ============================================================================
    // TOURNAMENTS TABLE
    // ============================================================================
    console.log('\n' + '='.repeat(100));
    console.log('TABLE: tournaments');
    console.log('='.repeat(100));
    const tournaments = await prisma.tournament.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            participants: true,
            matches: true,
          },
        },
      },
    });
    console.log(`Total records: ${tournaments.length}\n`);
    if (tournaments.length > 0) {
      tournaments.forEach((tournament, idx) => {
        console.log(`Tournament #${idx + 1}:`);
        console.log(`  ID: ${tournament.id}`);
        console.log(`  Name: ${tournament.name || 'Unnamed'}`);
        console.log(`  Status: ${tournament.status}`);
        console.log(`  Created: ${tournament.createdAt.toISOString()}`);
        console.log(`  Recorded: ${tournament.recordedAt.toISOString()}`);
        console.log(`  Participants: ${tournament._count.participants}`);
        console.log(`  Matches: ${tournament._count.matches}`);
        console.log('');
      });
    } else {
      console.log('(No tournaments found)\n');
    }

    // ============================================================================
    // TOURNAMENT_PARTICIPANTS TABLE
    // ============================================================================
    console.log('\n' + '='.repeat(100));
    console.log('TABLE: tournament_participants');
    console.log('='.repeat(100));
    const participants = await prisma.tournamentParticipant.findMany({
      include: {
        tournament: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
        player: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [{ tournamentId: 'asc' }, { playerId: 'asc' }],
    });
    console.log(`Total records: ${participants.length}\n`);
    if (participants.length > 0) {
      participants.forEach((participant, idx) => {
        console.log(`Participant #${idx + 1}:`);
        console.log(`  ID: ${participant.id}`);
        console.log(`  Tournament: #${participant.tournament.id} "${participant.tournament.name || 'Unnamed'}" (${participant.tournament.status})`);
        console.log(`  Player: #${participant.player.id} ${participant.player.firstName} ${participant.player.lastName}`);
        console.log(`  Rating at Time: ${participant.playerRatingAtTime !== null ? participant.playerRatingAtTime : 'N/A'}`);
        console.log('');
      });
    } else {
      console.log('(No participants found)\n');
    }

    // ============================================================================
    // MATCHES TABLE
    // ============================================================================
    console.log('\n' + '='.repeat(100));
    console.log('TABLE: matches');
    console.log('='.repeat(100));
    const matches = await prisma.match.findMany({
      include: {
        tournament: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
      orderBy: [{ tournamentId: 'asc' }, { id: 'asc' }],
    });
    console.log(`Total records: ${matches.length}\n`);
    if (matches.length > 0) {
      matches.forEach((match, idx) => {
        console.log(`Match #${idx + 1}:`);
        console.log(`  ID: ${match.id}`);
        console.log(`  Tournament: #${match.tournament.id} "${match.tournament.name || 'Unnamed'}" (${match.tournament.status})`);
        console.log(`  Player 1 ID: ${match.player1Id}`);
        console.log(`  Player 2 ID: ${match.player2Id}`);
        console.log(`  Score: ${match.player1Sets} - ${match.player2Sets}`);
        if (match.player1Forfeit || match.player2Forfeit) {
          console.log(`  Forfeit: Player ${match.player1Forfeit ? '1' : '2'} forfeited`);
        }
        console.log(`  Created: ${match.createdAt.toISOString()}`);
        console.log(`  Updated: ${match.updatedAt.toISOString()}`);
        console.log('');
      });
    } else {
      console.log('(No matches found)\n');
    }

    // ============================================================================
    // RANKING_HISTORY TABLE
    // ============================================================================
    console.log('\n' + '='.repeat(100));
    console.log('TABLE: ranking_history');
    console.log('='.repeat(100));
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
      orderBy: { timestamp: 'asc' },
    });
    console.log(`Total records: ${rankingHistory.length}\n`);
    if (rankingHistory.length > 0) {
      rankingHistory.forEach((entry, idx) => {
        console.log(`Entry #${idx + 1}:`);
        console.log(`  ID: ${entry.id}`);
        console.log(`  Player: #${entry.player.id} ${entry.player.firstName} ${entry.player.lastName}`);
        console.log(`  Ranking: ${entry.ranking !== null ? entry.ranking : 'N/A'}`);
        console.log(`  Timestamp: ${entry.timestamp.toISOString()}`);
        console.log(`  Reason: ${entry.reason}`);
        console.log(`  Tournament ID: ${entry.tournamentId !== null ? entry.tournamentId : 'N/A'}`);
        console.log('');
      });
    } else {
      console.log('(No ranking history found)\n');
    }

    // ============================================================================
    // SUMMARY STATISTICS
    // ============================================================================
    console.log('\n' + '='.repeat(100));
    console.log('SUMMARY STATISTICS');
    console.log('='.repeat(100));
    console.log(`Total Players: ${players.length}`);
    console.log(`  - Active: ${players.filter(p => p.isActive).length}`);
    console.log(`  - Inactive: ${players.filter(p => !p.isActive).length}`);
    console.log(`  - With Rating: ${players.filter(p => p.rating !== null).length}`);
    console.log(`Total Tournaments: ${tournaments.length}`);
    console.log(`  - Active: ${tournaments.filter(t => t.status === 'ACTIVE').length}`);
    console.log(`  - Completed: ${tournaments.filter(t => t.status === 'COMPLETED').length}`);
    console.log(`Total Tournament Participants: ${participants.length}`);
    console.log(`Total Matches: ${matches.length}`);
    console.log(`Total Ranking History Entries: ${rankingHistory.length}`);
    console.log('\n' + '='.repeat(100));

    // ============================================================================
    // JSON EXPORT
    // ============================================================================
    console.log('\n' + '='.repeat(100));
    console.log('JSON EXPORT (for programmatic use)');
    console.log('='.repeat(100));
    const jsonExport = {
      players: players.map(p => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        birthDate: p.birthDate ? p.birthDate.toISOString() : null,
        isActive: p.isActive,
        rating: p.rating,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
      tournaments: tournaments.map(t => ({
        id: t.id,
        name: t.name,
        status: t.status,
        createdAt: t.createdAt.toISOString(),
        recordedAt: t.recordedAt.toISOString(),
        participantCount: t._count.participants,
        matchCount: t._count.matches,
      })),
      tournamentParticipants: participants.map(p => ({
        id: p.id,
        tournamentId: p.tournamentId,
        playerId: p.playerId,
        playerRatingAtTime: p.playerRatingAtTime,
      })),
      matches: matches.map(m => ({
        id: m.id,
        tournamentId: m.tournamentId,
        player1Id: m.player1Id,
        player2Id: m.player2Id,
        player1Sets: m.player1Sets,
        player2Sets: m.player2Sets,
        player1Forfeit: m.player1Forfeit,
        player2Forfeit: m.player2Forfeit,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      })),
      rankingHistory: rankingHistory.map(r => ({
        id: r.id,
        playerId: r.playerId,
        ranking: r.ranking,
        timestamp: r.timestamp.toISOString(),
        reason: r.reason,
        tournamentId: r.tournamentId,
      })),
    };
    console.log(JSON.stringify(jsonExport, null, 2));

  } catch (error) {
    console.error('Error dumping tables:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
dumpAllTables()
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

