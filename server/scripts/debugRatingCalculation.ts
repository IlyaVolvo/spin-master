/**
 * Debug script to check rating calculations for specific matches
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const prisma = new PrismaClient();

async function main() {
  console.log('\n=== Debugging Rating Calculations ===\n');

  // Find a specific single match tournament to debug
  const singleMatches = await prisma.tournament.findMany({
    where: { 
      type: 'SINGLE_MATCH',
      status: 'COMPLETED'
    },
    include: {
      participants: {
        include: { player: true }
      },
      matches: true
    },
    orderBy: { createdAt: 'desc' },
    take: 5
  });

  console.log(`Found ${singleMatches.length} single match tournaments\n`);

  for (const tournament of singleMatches) {
    console.log(`Tournament: ${tournament.name || `ID ${tournament.id}`}`);
    console.log(`Created: ${tournament.createdAt}`);
    
    if (tournament.matches.length === 0) {
      console.log('  No matches found\n');
      continue;
    }

    const match = tournament.matches[0];
    const participant1 = tournament.participants.find(p => p.playerId === match.player1Id);
    const participant2 = tournament.participants.find(p => p.playerId === match.player2Id);

    if (!participant1 || !participant2) {
      console.log('  Participants not found\n');
      continue;
    }

    console.log(`  Match: ${match.player1Sets} - ${match.player2Sets}`);
    console.log(`  Player 1: ${participant1.player.firstName} ${participant1.player.lastName}`);
    console.log(`    Rating at tournament start: ${participant1.playerRatingAtTime ?? 'null'}`);
    console.log(`    Current rating: ${participant1.player.rating ?? 'null'}`);
    console.log(`  Player 2: ${participant2.player.firstName} ${participant2.player.lastName}`);
    console.log(`    Rating at tournament start: ${participant2.playerRatingAtTime ?? 'null'}`);
    console.log(`    Current rating: ${participant2.player.rating ?? 'null'}`);
    
    const player1Won = match.player1Sets > match.player2Sets;
    const rating1 = participant1.playerRatingAtTime ?? 1200;
    const rating2 = participant2.playerRatingAtTime ?? 1200;
    const ratingDiff = rating2 - rating1;
    const isUpset = (player1Won && ratingDiff > 0) || (!player1Won && ratingDiff < 0);
    
    console.log(`  Calculation:`);
    console.log(`    Rating diff: ${ratingDiff}`);
    console.log(`    Player 1 won: ${player1Won}`);
    console.log(`    Is upset: ${isUpset}`);
    
    // Calculate expected point exchange
    const absDiff = Math.abs(ratingDiff);
    let points = 0;
    if (absDiff <= 12) points = 8;
    else if (absDiff <= 37) points = isUpset ? 10 : 7;
    else if (absDiff <= 62) points = isUpset ? 13 : 6;
    else if (absDiff <= 87) points = isUpset ? 16 : 5;
    else if (absDiff <= 112) points = isUpset ? 20 : 4;
    else if (absDiff <= 137) points = isUpset ? 25 : 3;
    else if (absDiff <= 162) points = isUpset ? 30 : 2;
    else if (absDiff <= 187) points = isUpset ? 35 : 2;
    else if (absDiff <= 212) points = isUpset ? 40 : 1;
    else if (absDiff <= 237) points = isUpset ? 45 : 1;
    else if (absDiff <= 262) points = isUpset ? 50 : 0;
    else if (absDiff <= 287) points = isUpset ? 55 : 0;
    else if (absDiff <= 312) points = isUpset ? 60 : 0;
    else if (absDiff <= 337) points = isUpset ? 65 : 0;
    else if (absDiff <= 362) points = isUpset ? 70 : 0;
    else if (absDiff <= 387) points = isUpset ? 75 : 0;
    else if (absDiff <= 412) points = isUpset ? 80 : 0;
    else if (absDiff <= 437) points = isUpset ? 85 : 0;
    else if (absDiff <= 462) points = isUpset ? 90 : 0;
    else if (absDiff <= 487) points = isUpset ? 95 : 0;
    else if (absDiff <= 512) points = isUpset ? 100 : 0;
    else points = isUpset ? 100 : 0;
    
    console.log(`    Point exchange: ${points}`);
    
    let expectedRating1 = rating1;
    let expectedRating2 = rating2;
    if (player1Won) {
      expectedRating1 += points;
      expectedRating2 -= points;
    } else {
      expectedRating1 -= points;
      expectedRating2 += points;
    }
    
    console.log(`  Expected after match:`);
    console.log(`    Player 1: ${expectedRating1} (change: ${expectedRating1 - rating1 >= 0 ? '+' : ''}${expectedRating1 - rating1})`);
    console.log(`    Player 2: ${expectedRating2} (change: ${expectedRating2 - rating2 >= 0 ? '+' : ''}${expectedRating2 - rating2})`);
    console.log(`  Actual current ratings:`);
    console.log(`    Player 1: ${participant1.player.rating ?? 'null'} (change: ${participant1.player.rating && rating1 ? (participant1.player.rating - rating1 >= 0 ? '+' : '') + (participant1.player.rating - rating1) : 'N/A'})`);
    console.log(`    Player 2: ${participant2.player.rating ?? 'null'} (change: ${participant2.player.rating && rating2 ? (participant2.player.rating - rating2 >= 0 ? '+' : '') + (participant2.player.rating - rating2) : 'N/A'})`);
    console.log('');
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

