/**
 * Debug script to trace rating changes for a specific player across all tournaments
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const prisma = new PrismaClient();

async function main() {
  const playerName = process.argv[2] || 'Khanh Duong';
  
  console.log(`\n=== Tracing Rating Changes for ${playerName} ===\n`);

  // Find the player
  const players = await prisma.player.findMany({
    where: {
      OR: [
        { firstName: { contains: playerName.split(' ')[0], mode: 'insensitive' } },
        { lastName: { contains: playerName.split(' ')[1] || playerName, mode: 'insensitive' } },
      ],
    },
  });

  if (players.length === 0) {
    console.log('Player not found');
    return;
  }

  const player = players[0];
  console.log(`Found player: ${player.firstName} ${player.lastName} (ID: ${player.id})`);
  console.log(`Current rating: ${player.rating ?? 'Unrated'}\n`);

  // Get all tournaments this player participated in, in chronological order
  const tournaments = await prisma.tournament.findMany({
    where: {
      status: 'COMPLETED',
      participants: {
        some: { playerId: player.id },
      },
    },
    include: {
      participants: {
        include: { player: true },
      },
      matches: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Player participated in ${tournaments.length} completed tournament(s)\n`);

  let currentRating = null;
  
  for (let i = 0; i < tournaments.length; i++) {
    const tournament = tournaments[i];
    const participant = tournament.participants.find(p => p.playerId === player.id);
    
    if (!participant) continue;

    const ratingAtTournamentStart = participant.playerRatingAtTime;
    
    console.log(`Tournament ${i + 1}: ${tournament.name || `ID ${tournament.id}`}`);
    console.log(`  Type: ${tournament.type}`);
    console.log(`  Created: ${tournament.createdAt}`);
    console.log(`  Rating at tournament start: ${ratingAtTournamentStart ?? 'null'}`);
    
    // Show matches for this player
    const playerMatches = tournament.matches.filter(
      m => m.player1Id === player.id || m.player2Id === player.id
    );
    
    console.log(`  Matches: ${playerMatches.length}`);
    for (const match of playerMatches) {
      const isPlayer1 = match.player1Id === player.id;
      const opponentId = isPlayer1 ? match.player2Id : match.player1Id;
      const opponent = tournament.participants.find(p => p.playerId === opponentId)?.player;
      const opponentName = opponent ? `${opponent.firstName} ${opponent.lastName}` : `ID ${opponentId}`;
      const opponentRating = tournament.participants.find(p => p.playerId === opponentId)?.playerRatingAtTime;
      
      const playerSets = isPlayer1 ? match.player1Sets : match.player2Sets;
      const opponentSets = isPlayer1 ? match.player2Sets : match.player1Sets;
      const playerWon = playerSets > opponentSets;
      
      console.log(`    vs ${opponentName} (${opponentRating ?? 'unrated'}): ${playerSets}-${opponentSets} ${playerWon ? 'WIN' : 'LOSS'}`);
    }
    
    // If this is the first tournament, note the starting rating
    if (i === 0) {
      currentRating = ratingAtTournamentStart;
      console.log(`  Starting rating: ${currentRating ?? 'Unrated'}`);
    } else {
      // Show what the rating should be after this tournament
      const ratingChange = ratingAtTournamentStart && currentRating 
        ? ratingAtTournamentStart - currentRating
        : null;
      console.log(`  Expected rating change from previous tournament: ${ratingChange !== null ? (ratingChange >= 0 ? '+' : '') + ratingChange : 'N/A'}`);
      currentRating = ratingAtTournamentStart;
    }
    
    console.log('');
  }

  console.log(`Final rating: ${player.rating ?? 'Unrated'}`);
  if (tournaments.length > 0) {
    const firstTournament = tournaments[0];
    const firstParticipant = firstTournament.participants.find(p => p.playerId === player.id);
    const firstRating = firstParticipant?.playerRatingAtTime;
    if (firstRating !== null && player.rating !== null) {
      const totalChange = player.rating - firstRating;
      console.log(`Total change from first tournament: ${totalChange >= 0 ? '+' : ''}${totalChange}`);
    }
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

