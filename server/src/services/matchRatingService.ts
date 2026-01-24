import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export interface MatchRatingResult {
  player1RatingBefore: number | null;
  player1RatingChange: number | null;
  player2RatingBefore: number | null;
  player2RatingChange: number | null;
}

/**
 * Process rating changes for a match
 * @param member1Id - First player ID
 * @param member2Id - Second player ID
 * @param player1Won - Whether player 1 won the match
 * @param tournamentId - Tournament ID (null for standalone matches)
 * @param matchId - Match ID to store rating changes
 * @param isForfeit - Whether this is a forfeit match (forfeits don't change ratings)
 * @param useIncrementalRating - If true, use current player rating (for PLAYOFF). If false, use playerRatingAtTime (for SINGLE_MATCH)
 * @returns MatchRatingResult if ratings were applied, null if skipped (BYE or forfeit)
 */
export async function processMatchRating(
  member1Id: number,
  member2Id: number,
  player1Won: boolean,
  tournamentId: number | null,
  matchId: number,
  isForfeit: boolean = false,
  useIncrementalRating: boolean = false
): Promise<MatchRatingResult | null> {
  // BYE matches should not affect ratings
  if (member1Id === 0 || member2Id === 0 || member2Id === null) {
    return null;
  }

  // Forfeited matches should not change ratings
  if (isForfeit) {
    return null;
  }

  let rating1: number | null;
  let rating2: number | null;

  // For standalone matches, use current player ratings
  if (!tournamentId) {
    const member1 = await prisma.member.findUnique({
      where: { id: member1Id },
      select: { rating: true }
    });
    
    const member2 = await prisma.member.findUnique({
      where: { id: member2Id },
      select: { rating: true }
    });
    
    if (!member1 || !member2) {
      throw new Error('Player not found');
    }
    
    rating1 = member1.rating;
    rating2 = member2.rating;
  } else {
    // Get tournament with participants
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        participants: {
          include: { member: true },
        },
      },
    });

    if (!tournament) {
      throw new Error('Tournament not found');
    }

    const participant1 = tournament.participants.find(p => p.memberId === member1Id);
    const participant2 = tournament.participants.find(p => p.memberId === member2Id);

    if (!participant1 || !participant2) {
      throw new Error('Players not found in tournament participants');
    }

    // Use playerRatingAtTime from tournament participants
    rating1 = participant1.playerRatingAtTime;
    rating2 = participant2.playerRatingAtTime;
  }

  // Store ratings before changes
  const player1RatingBefore = rating1;
  const player2RatingBefore = rating2;

  // Calculate rating changes using point exchange rules
  const ratingDiff = rating2! - rating1!;
  const expectedScore1 = 1 / (1 + Math.pow(10, -ratingDiff / 400));
  const expectedScore2 = 1 - expectedScore1;

  const actualScore1 = player1Won ? 1 : 0;
  const actualScore2 = player1Won ? 0 : 1;

  const kFactor = 32; // Standard K-factor for chess-like rating systems

  const ratingChange1 = Math.round(kFactor * (actualScore1 - expectedScore1));
  const ratingChange2 = Math.round(kFactor * (actualScore2 - expectedScore2));

  const newRating1 = rating1! + ratingChange1;
  const newRating2 = rating2! + ratingChange2;

  // Update player ratings
  await prisma.member.update({
    where: { id: member1Id },
    data: { rating: newRating1 }
  });

  await prisma.member.update({
    where: { id: member2Id },
    data: { rating: newRating2 }
  });

  // Create rating history entries
  await prisma.ratingHistory.createMany({
    data: [
      {
        memberId: member1Id,
        rating: newRating1,
        ratingChange: ratingChange1,
        timestamp: new Date(),
        reason: 'MATCH_COMPLETED',
        tournamentId,
        matchId,
      },
      {
        memberId: member2Id,
        rating: newRating2,
        ratingChange: ratingChange2,
        timestamp: new Date(),
        reason: 'MATCH_COMPLETED',
        tournamentId,
        matchId,
      },
    ],
  });

  logger.info('Rating changes processed', {
    member1Id,
    member2Id,
    player1Won,
    ratingChange1,
    ratingChange2,
    newRating1,
    newRating2,
    tournamentId,
    matchId,
  });

  return {
    player1RatingBefore,
    player1RatingChange: ratingChange1,
    player2RatingBefore,
    player2RatingChange: ratingChange2,
  };
}
