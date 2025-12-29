import { prisma } from '../index';
import { getPointExchange } from './usattRatingService';

/**
 * Match Rating Service
 * Handles rating calculations for individual matches in tournaments.
 * This service is used for both regular matches and playoff bracket matches.
 */

export interface MatchRatingResult {
  player1NewRating: number;
  player2NewRating: number;
  player1RatingChange: number; // Positive if increased, negative if decreased
  player2RatingChange: number;
  player1OldRating: number;
  player2OldRating: number;
}

/**
 * Calculate rating changes for a single match
 * @param member1Id - First player ID
 * @param member2Id - Second player ID
 * @param player1Won - Whether player 1 won
 * @param tournamentId - Tournament ID
 * @param player1RatingAtTime - Player 1's rating when tournament started
 * @param player2RatingAtTime - Player 2's rating when tournament started
 * @returns MatchRatingResult with new ratings and changes
 */
export async function calculateMatchRatingChanges(
  member1Id: number,
  member2Id: number,
  player1Won: boolean,
  tournamentId: number,
  player1RatingAtTime: number | null,
  player2RatingAtTime: number | null
): Promise<MatchRatingResult> {
  // BYE matches should not affect ratings
  if (member1Id === 0 || member2Id === 0 || member2Id === null) {
    throw new Error('Cannot calculate ratings for BYE matches');
  }

  // Use playerRatingAtTime (rating when tournament was created), not current rating
  // Default to 1200 if unrated
  const rating1 = player1RatingAtTime ?? 1200;
  const rating2 = player2RatingAtTime ?? 1200;

  // Calculate rating difference
  const ratingDiff = rating2 - rating1;
  // An upset occurs when the lower-rated player wins
  // Player 1 wins as underdog: player1Won && ratingDiff > 0 (Player 2 is higher rated)
  // Player 2 wins as underdog: !player1Won && ratingDiff < 0 (Player 1 is higher rated)
  const isUpset = (player1Won && ratingDiff > 0) || (!player1Won && ratingDiff < 0);

  // Get point exchange
  const points = await getPointExchange(Math.abs(ratingDiff), isUpset);

  // Calculate new ratings
  // IMPORTANT: Winner always gains points, loser always loses points
  let newRating1 = rating1;
  let newRating2 = rating2;

  if (player1Won) {
    // Player 1 won: they gain points, player 2 loses points
    newRating1 += points;
    newRating2 -= points;
  } else {
    // Player 2 won: they gain points, player 1 loses points
    newRating1 -= points;
    newRating2 += points;
  }
  
  // Validate: winner should never lose points
  if ((player1Won && newRating1 < rating1) || (!player1Won && newRating2 < rating2)) {
    const { logger } = await import('../utils/logger');
    logger.error('Rating calculation error: winner lost points', {
      member1Id,
      member2Id,
      player1Won,
      rating1,
      rating2,
      ratingDiff,
      isUpset,
      points,
      newRating1,
      newRating2,
      player1Change: newRating1 - rating1,
      player2Change: newRating2 - rating2
    });
    throw new Error('Rating calculation error: winner cannot lose points');
  }

  // Ensure ratings don't go below 0
  newRating1 = Math.max(0, Math.round(newRating1));
  newRating2 = Math.max(0, Math.round(newRating2));

  return {
    player1NewRating: newRating1,
    player2NewRating: newRating2,
    player1RatingChange: newRating1 - rating1,
    player2RatingChange: newRating2 - rating2,
    player1OldRating: rating1,
    player2OldRating: rating2,
  };
}

/**
 * Apply rating changes from a match result to the database
 * This updates the player ratings in the database
 * @param result - MatchRatingResult from calculateMatchRatingChanges
 * @param member1Id - First player ID
 * @param member2Id - Second player ID
 */
export async function applyMatchRatingChanges(
  result: MatchRatingResult,
  member1Id: number,
  member2Id: number
): Promise<void> {
  // Update player ratings
  await prisma.member.update({
    where: { id: member1Id },
    data: { rating: result.player1NewRating },
  });

  await prisma.member.update({
    where: { id: member2Id },
    data: { rating: result.player2NewRating },
  });
}

/**
 * Calculate and apply rating changes for a match
 * This is the main function to use for processing match results
 * For PLAYOFF tournaments, uses incremental ratings (current player rating)
 * For SINGLE_MATCH, uses playerRatingAtTime
 * @param member1Id - First player ID
 * @param member2Id - Second player ID
 * @param player1Won - Whether player 1 won
 * @param tournamentId - Tournament ID
 * @param matchId - Match ID to store rating changes
 * @param isForfeit - Whether this is a forfeit match (forfeits don't change ratings)
 * @param useIncrementalRating - If true, use current player rating (for PLAYOFF). If false, use playerRatingAtTime (for SINGLE_MATCH)
 * @returns MatchRatingResult if ratings were applied, null if skipped (BYE or forfeit)
 */
export async function processMatchRating(
  member1Id: number,
  member2Id: number,
  player1Won: boolean,
  tournamentId: number,
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

  // Determine which ratings to use
  let rating1: number | null;
  let rating2: number | null;
  
  // Get match creation time for filtering rating history (must be before current match)
  const matchForTimestamp = await prisma.match.findUnique({
    where: { id: matchId },
    select: { createdAt: true },
  });
  const matchCreatedAt = matchForTimestamp?.createdAt || new Date();

  if (useIncrementalRating) {
    // For PLAYOFF and SINGLE_MATCH with incremental ratings: 
    // Get the most recent rating from RatingHistory BEFORE this match's timestamp
    // This ensures we always build on the correct previous rating chronologically
    // We need to get entries that are before this match, not just exclude this match
    const player1HistoryBefore = await (prisma as any).ratingHistory.findMany({
      where: { 
        memberId: member1Id,
        timestamp: { lt: matchCreatedAt }, // Only entries before this match
      },
      orderBy: { timestamp: 'desc' },
      take: 1,
      select: { rating: true },
    });
    const player2HistoryBefore = await (prisma as any).ratingHistory.findMany({
      where: { 
        memberId: member2Id,
        timestamp: { lt: matchCreatedAt }, // Only entries before this match
      },
      orderBy: { timestamp: 'desc' },
      take: 1,
      select: { rating: true },
    });
    
    const player1LatestHistory = player1HistoryBefore[0] || null;
    const player2LatestHistory = player2HistoryBefore[0] || null;
    
    // Use rating from most recent history entry before this match, fallback to current player rating, then playerRatingAtTime
    rating1 = player1LatestHistory?.rating ?? 
              (await prisma.member.findUnique({ where: { id: member1Id }, select: { rating: true } }))?.rating ?? 
              participant1.playerRatingAtTime ?? 
              1200;
    rating2 = player2LatestHistory?.rating ?? 
              (await prisma.member.findUnique({ where: { id: member2Id }, select: { rating: true } }))?.rating ?? 
              participant2.playerRatingAtTime ?? 
              1200;
  } else {
    // For SINGLE_MATCH without incremental: use playerRatingAtTime (rating when tournament started)
    rating1 = participant1.playerRatingAtTime ?? 1200;
    rating2 = participant2.playerRatingAtTime ?? 1200;
  }

  // Calculate rating changes
  const result = await calculateMatchRatingChanges(
    member1Id,
    member2Id,
    player1Won,
    tournamentId,
    rating1,
    rating2
  );

  // Apply changes to player ratings in database
  await applyMatchRatingChanges(result, member1Id, member2Id);

  // Get match creation time for timestamp (needed for rating history query and entry creation)
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { createdAt: true },
  });
  const matchTimestamp = match?.createdAt || new Date();

  // Determine the reason based on tournament type
  // For playoff tournaments, use PLAYOFF_MATCH_COMPLETED; otherwise use MATCH_COMPLETED
  const ratingChangeReason = tournament.type === 'PLAYOFF' ? 'PLAYOFF_MATCH_COMPLETED' : 'MATCH_COMPLETED';

  // Create rating history entries with appropriate reason
  // Use match creation time as timestamp
  await (prisma as any).ratingHistory.create({
    data: {
      memberId: member1Id,
      rating: result.player1NewRating,
      ratingChange: result.player1RatingChange,
      reason: ratingChangeReason,
      tournamentId: tournamentId,
      matchId: matchId,
      timestamp: matchTimestamp,
    },
  });

  await (prisma as any).ratingHistory.create({
    data: {
      memberId: member2Id,
      rating: result.player2NewRating,
      ratingChange: result.player2RatingChange,
      reason: ratingChangeReason,
      tournamentId: tournamentId,
      matchId: matchId,
      timestamp: matchTimestamp,
    },
  });

  return result;
}

