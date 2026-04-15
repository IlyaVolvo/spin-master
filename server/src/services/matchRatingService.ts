import { PrismaClient } from '@prisma/client';
import { broadcastMembersUpdated } from './playerSocketBroadcast';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

const FALLBACK_POINT_EXCHANGE_RULES = [
  { minDiff: 0, maxDiff: 12, expectedPoints: 8, upsetPoints: 8 },
  { minDiff: 13, maxDiff: 37, expectedPoints: 7, upsetPoints: 10 },
  { minDiff: 38, maxDiff: 62, expectedPoints: 6, upsetPoints: 13 },
  { minDiff: 63, maxDiff: 87, expectedPoints: 5, upsetPoints: 16 },
  { minDiff: 88, maxDiff: 112, expectedPoints: 4, upsetPoints: 20 },
  { minDiff: 113, maxDiff: 137, expectedPoints: 3, upsetPoints: 25 },
  { minDiff: 138, maxDiff: 162, expectedPoints: 2, upsetPoints: 30 },
  { minDiff: 163, maxDiff: 187, expectedPoints: 2, upsetPoints: 35 },
  { minDiff: 188, maxDiff: 212, expectedPoints: 1, upsetPoints: 40 },
  { minDiff: 213, maxDiff: 237, expectedPoints: 1, upsetPoints: 45 },
  { minDiff: 238, maxDiff: 262, expectedPoints: 0, upsetPoints: 50 },
  { minDiff: 263, maxDiff: 287, expectedPoints: 0, upsetPoints: 55 },
  { minDiff: 288, maxDiff: 312, expectedPoints: 0, upsetPoints: 60 },
  { minDiff: 313, maxDiff: 337, expectedPoints: 0, upsetPoints: 65 },
  { minDiff: 338, maxDiff: 362, expectedPoints: 0, upsetPoints: 70 },
  { minDiff: 363, maxDiff: 387, expectedPoints: 0, upsetPoints: 75 },
  { minDiff: 388, maxDiff: 412, expectedPoints: 0, upsetPoints: 80 },
  { minDiff: 413, maxDiff: 437, expectedPoints: 0, upsetPoints: 85 },
  { minDiff: 438, maxDiff: 462, expectedPoints: 0, upsetPoints: 90 },
  { minDiff: 463, maxDiff: 487, expectedPoints: 0, upsetPoints: 95 },
  { minDiff: 488, maxDiff: 512, expectedPoints: 0, upsetPoints: 100 },
  { minDiff: 513, maxDiff: 99999, expectedPoints: 0, upsetPoints: 100 },
];

async function getPointExchange(ratingDiff: number, isUpset: boolean): Promise<number> {
  const now = new Date();
  const allRules = await prisma.pointExchangeRule.findMany({
    where: {
      effectiveFrom: {
        lte: now,
      },
    },
    orderBy: [
      { effectiveFrom: 'desc' },
      { minDiff: 'asc' },
    ],
  });

  const activeRules = allRules.length > 0
    ? allRules.filter((rule) => rule.effectiveFrom.getTime() === allRules[0].effectiveFrom.getTime())
    : FALLBACK_POINT_EXCHANGE_RULES;

  for (const rule of activeRules) {
    if (ratingDiff >= rule.minDiff && ratingDiff <= rule.maxDiff) {
      return isUpset ? rule.upsetPoints : rule.expectedPoints;
    }
  }

  return 0;
}

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
 * @param useIncrementalRating - If true, use current player rating (for PLAYOFF). If false, use playerRatingAtTime
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

  // Unrated players default to 1200 for single-match processing.
  const rating1Before = rating1 ?? 1200;
  const rating2Before = rating2 ?? 1200;

  // Store ratings before changes
  const player1RatingBefore = rating1;
  const player2RatingBefore = rating2;

  // Calculate rating changes using USATT-style point exchange rules.
  const ratingDiff = rating2Before - rating1Before;
  const isUpset = (player1Won && ratingDiff > 0) || (!player1Won && ratingDiff < 0);
  const points = await getPointExchange(Math.abs(ratingDiff), isUpset);

  const ratingChange1 = player1Won ? points : -points;
  const ratingChange2 = -ratingChange1;

  const newRating1 = Math.max(0, Math.round(rating1Before + ratingChange1));
  const newRating2 = Math.max(0, Math.round(rating2Before + ratingChange2));

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

  await broadcastMembersUpdated(prisma, [member1Id, member2Id]);

  return {
    player1RatingBefore,
    player1RatingChange: ratingChange1,
    player2RatingBefore,
    player2RatingChange: ratingChange2,
  };
}
