import { prisma } from '../index';

/**
 * USATT Rating System Implementation
 * Based on: https://www.usatt.org/events-and-results/rating-systems-explained
 * 
 * The system uses a 4-pass algorithm with point exchange tables.
 */

// Cache for point exchange rules (keyed by effectiveFrom date)
let pointExchangeRulesCache: Array<{
  minDiff: number;
  maxDiff: number;
  expectedPoints: number;
  upsetPoints: number;
  effectiveFrom: Date;
}> | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Load point exchange rules from database (with caching)
 * Only loads rules that are effective at the current time
 */
async function loadPointExchangeRules(): Promise<Array<{
  minDiff: number;
  maxDiff: number;
  expectedPoints: number;
  upsetPoints: number;
  effectiveFrom: Date;
}>> {
  const now = Date.now();
  
  // Return cached rules if still valid
  if (pointExchangeRulesCache && (now - cacheTimestamp) < CACHE_TTL) {
    return pointExchangeRulesCache;
  }
  
  const currentDate = new Date();
  
  // Get the most recent rules that are effective (effectiveFrom <= current date)
  // For future modifications, we'll get the latest effectiveFrom date that's <= current date
  const allRules = await prisma.pointExchangeRule.findMany({
    where: {
      effectiveFrom: {
        lte: currentDate,
      },
    },
    orderBy: [
      { effectiveFrom: 'desc' },
      { minDiff: 'asc' }
    ],
  });
  
  // Group by effectiveFrom and get the most recent set
  const rulesByDate = new Map<string, typeof allRules>();
  for (const rule of allRules) {
    const dateKey = rule.effectiveFrom.toISOString();
    if (!rulesByDate.has(dateKey)) {
      rulesByDate.set(dateKey, []);
    }
    rulesByDate.get(dateKey)!.push(rule);
  }
  
  // Get the most recent set of rules
  const latestDate = Array.from(rulesByDate.keys()).sort().reverse()[0];
  const activeRules = latestDate ? rulesByDate.get(latestDate)! : [];
  
  if (activeRules.length === 0) {
    // Fallback to hardcoded values if no rules in database
    return [
      { minDiff: 0, maxDiff: 12, expectedPoints: 8, upsetPoints: 8, effectiveFrom: currentDate },
      { minDiff: 13, maxDiff: 37, expectedPoints: 7, upsetPoints: 10, effectiveFrom: currentDate },
      { minDiff: 38, maxDiff: 62, expectedPoints: 6, upsetPoints: 13, effectiveFrom: currentDate },
      { minDiff: 63, maxDiff: 87, expectedPoints: 5, upsetPoints: 16, effectiveFrom: currentDate },
      { minDiff: 88, maxDiff: 112, expectedPoints: 4, upsetPoints: 20, effectiveFrom: currentDate },
      { minDiff: 113, maxDiff: 137, expectedPoints: 3, upsetPoints: 25, effectiveFrom: currentDate },
      { minDiff: 138, maxDiff: 162, expectedPoints: 2, upsetPoints: 30, effectiveFrom: currentDate },
      { minDiff: 163, maxDiff: 187, expectedPoints: 2, upsetPoints: 35, effectiveFrom: currentDate },
      { minDiff: 188, maxDiff: 212, expectedPoints: 1, upsetPoints: 40, effectiveFrom: currentDate },
      { minDiff: 213, maxDiff: 237, expectedPoints: 1, upsetPoints: 45, effectiveFrom: currentDate },
      { minDiff: 238, maxDiff: 262, expectedPoints: 0, upsetPoints: 50, effectiveFrom: currentDate },
      { minDiff: 263, maxDiff: 287, expectedPoints: 0, upsetPoints: 55, effectiveFrom: currentDate },
      { minDiff: 288, maxDiff: 312, expectedPoints: 0, upsetPoints: 60, effectiveFrom: currentDate },
      { minDiff: 313, maxDiff: 337, expectedPoints: 0, upsetPoints: 65, effectiveFrom: currentDate },
      { minDiff: 338, maxDiff: 362, expectedPoints: 0, upsetPoints: 70, effectiveFrom: currentDate },
      { minDiff: 363, maxDiff: 387, expectedPoints: 0, upsetPoints: 75, effectiveFrom: currentDate },
      { minDiff: 388, maxDiff: 412, expectedPoints: 0, upsetPoints: 80, effectiveFrom: currentDate },
      { minDiff: 413, maxDiff: 437, expectedPoints: 0, upsetPoints: 85, effectiveFrom: currentDate },
      { minDiff: 438, maxDiff: 462, expectedPoints: 0, upsetPoints: 90, effectiveFrom: currentDate },
      { minDiff: 463, maxDiff: 487, expectedPoints: 0, upsetPoints: 95, effectiveFrom: currentDate },
      { minDiff: 488, maxDiff: 512, expectedPoints: 0, upsetPoints: 100, effectiveFrom: currentDate },
      { minDiff: 513, maxDiff: 99999, expectedPoints: 0, upsetPoints: 100, effectiveFrom: currentDate },
    ];
  }
  
  // Convert to our format
  pointExchangeRulesCache = activeRules.map(rule => ({
    minDiff: rule.minDiff,
    maxDiff: rule.maxDiff,
    expectedPoints: rule.expectedPoints,
    upsetPoints: rule.upsetPoints,
    effectiveFrom: rule.effectiveFrom,
  }));
  
  cacheTimestamp = now;
  return pointExchangeRulesCache;
}

/**
 * Get point exchange based on rating difference and whether it's an upset
 * Uses data-driven rules from database (with caching)
 * Exported for use in matchRatingService
 */
export async function getPointExchange(ratingDiff: number, isUpset: boolean): Promise<number> {
  const absDiff = Math.abs(ratingDiff);
  const rules = await loadPointExchangeRules();
  
  // Find the rule that matches this rating difference
  for (const rule of rules) {
    if (absDiff >= rule.minDiff && absDiff <= rule.maxDiff) {
      return isUpset ? rule.upsetPoints : rule.expectedPoints;
    }
  }
  
  // Fallback: if no rule matches (shouldn't happen), return 0
  return 0;
}

interface PlayerMatchResult {
  opponentId: number;
  opponentRating: number | null;
  won: boolean;
  setsWon: number;
  setsLost: number;
}

interface TournamentPlayerData {
  memberId: number;
  initialRating: number | null;
  matches: PlayerMatchResult[];
  wins: number;
  losses: number;
}

/**
 * Calculate Pass 1 rating for rated players only
 */
async function calculatePass1(
  playerData: TournamentPlayerData,
  allPlayersData: Map<number, TournamentPlayerData>
): Promise<number | null> {
  if (playerData.initialRating === null) return null;

  let rating = playerData.initialRating;
  let pointsGained = 0;

  // Only process matches against rated players
  for (const match of playerData.matches) {
    if (match.opponentRating === null) continue; // Skip unrated opponents

    const ratingDiff = match.opponentRating - rating;
    // An upset occurs when the lower-rated player wins
    // Player wins as underdog: match.won && ratingDiff > 0 (opponent is higher rated)
    // Player loses to underdog: !match.won && ratingDiff < 0 (opponent is lower rated, so opponent won as underdog)
    const isUpset = (match.won && ratingDiff > 0) || (!match.won && ratingDiff < 0);
    const points = await getPointExchange(Math.abs(ratingDiff), isUpset);

    if (match.won) {
      rating += points;
      pointsGained += points;
    } else {
      rating -= points;
      pointsGained -= points;
    }
  }

  return rating;
}

/**
 * Calculate Pass 2 adjustment for rated players
 */
function calculatePass2Adjustment(
  playerData: TournamentPlayerData,
  pass1Rating: number | null,
  allPlayersData: Map<number, TournamentPlayerData>
): number | null {
  if (playerData.initialRating === null || pass1Rating === null) return null;

  const pointsGained = pass1Rating - playerData.initialRating;

  if (pointsGained < 50) {
    return playerData.initialRating;
  }

  if (pointsGained >= 50 && pointsGained <= 74) {
    return pass1Rating;
  }

  // Points gained >= 75
  if (playerData.wins > 0 && playerData.losses > 0) {
    // Average of pass1 rating and average of best win/worst loss
    const opponentRatings = playerData.matches
      .filter(m => m.opponentRating !== null)
      .map(m => m.opponentRating!);
    
    if (opponentRatings.length === 0) return pass1Rating;
    
    const wins = playerData.matches.filter(m => m.won && m.opponentRating !== null);
    const losses = playerData.matches.filter(m => !m.won && m.opponentRating !== null);
    
    if (wins.length === 0 || losses.length === 0) return pass1Rating;
    
    const bestWin = Math.max(...wins.map(m => m.opponentRating!));
    const worstLoss = Math.min(...losses.map(m => m.opponentRating!));
    const avgOpponent = (bestWin + worstLoss) / 2;
    
    return Math.round((pass1Rating + avgOpponent) / 2);
  }

  // All wins or all losses
  const opponentRatings = playerData.matches
    .filter(m => m.opponentRating !== null)
    .map(m => m.opponentRating!);
  
  if (opponentRatings.length === 0) return pass1Rating;
  
  // For single match tournaments, don't use median - it would set rating to opponent's rating
  // Instead, use Pass 1 rating directly (which is based on point exchange table)
  // Pass 1 already correctly handles single matches with appropriate point exchanges
  if (opponentRatings.length === 1) {
    // Single match: Pass 1 already calculated the correct point exchange
    // Just use Pass 1 rating, but ensure it's reasonable (not more than 100 points from initial)
    const maxChange = 100;
    const cappedRating = Math.max(
      playerData.initialRating! - maxChange,
      Math.min(
        playerData.initialRating! + maxChange,
        pass1Rating
      )
    );
    // For losses, ensure rating doesn't go up (should only go down or stay same)
    if (playerData.losses > 0 && playerData.wins === 0) {
      return Math.min(pass1Rating, playerData.initialRating!);
    }
    // For wins, use the capped rating
    return cappedRating;
  }
  
  // Multiple matches: use median of opponent ratings
  opponentRatings.sort((a, b) => a - b);
  const median = opponentRatings[Math.floor(opponentRatings.length / 2)];
  return median;
}

/**
 * Calculate Pass 2 rating for unrated players
 */
function calculatePass2Rating(
  playerData: TournamentPlayerData,
  allPlayersData: Map<number, TournamentPlayerData>,
  pass2Adjustments: Map<number, number>
): number | null {
  if (playerData.initialRating !== null) return null; // Only for unrated players

  const ratedOpponents = playerData.matches.filter(m => {
    const opponent = allPlayersData.get(m.opponentId);
    return opponent && opponent.initialRating !== null;
  });

  if (ratedOpponents.length === 0) {
    // All matches against unrated players
    return 1200; // Default starting rating
  }

  const wins = playerData.matches.filter(m => m.won);
  const losses = playerData.matches.filter(m => !m.won);

  if (wins.length === 0 && losses.length === 0) return 1200;

  // Get opponent Pass 2 adjustments
  const opponentRatings = ratedOpponents.map(m => {
    const adjustment = pass2Adjustments.get(m.opponentId);
    return adjustment !== undefined ? adjustment : m.opponentRating;
  }).filter((r): r is number => r !== null);

  if (opponentRatings.length === 0) return 1200;

  if (wins.length > 0 && losses.length > 0) {
    // Average of best win and worst loss
    const winRatings = wins
      .map(m => pass2Adjustments.get(m.opponentId) ?? m.opponentRating)
      .filter((r): r is number => r !== null);
    const lossRatings = losses
      .map(m => pass2Adjustments.get(m.opponentId) ?? m.opponentRating)
      .filter((r): r is number => r !== null);
    
    if (winRatings.length === 0 || lossRatings.length === 0) return 1200;
    
    const bestWin = Math.max(...winRatings);
    const worstLoss = Math.min(...lossRatings);
    return Math.round((bestWin + worstLoss) / 2);
  }

  if (wins.length > 0 && losses.length === 0) {
    // All wins - use formula with intermediate values
    const winRatings = wins
      .map(m => pass2Adjustments.get(m.opponentId) ?? m.opponentRating)
      .filter((r): r is number => r !== null);
    
    if (winRatings.length === 0) return 1200;
    
    const bestWin = Math.max(...winRatings);
    const worstLoss = Math.min(...winRatings); // Best opponent they beat
    
    const diff = bestWin - worstLoss;
    let intermediate = 0;
    if (diff >= 1 && diff <= 50) intermediate = 10;
    else if (diff >= 51 && diff <= 100) intermediate = 5;
    else if (diff >= 101 && diff <= 150) intermediate = 1;
    
    return bestWin + intermediate;
  }

  if (losses.length > 0 && wins.length === 0) {
    // All losses
    const lossRatings = losses
      .map(m => pass2Adjustments.get(m.opponentId) ?? m.opponentRating)
      .filter((r): r is number => r !== null);
    
    if (lossRatings.length === 0) return 1200;
    
    const worstLoss = Math.min(...lossRatings);
    const bestLoss = Math.max(...lossRatings);
    
    const diff = bestLoss - worstLoss;
    let intermediate = 0;
    if (diff >= 1 && diff <= 50) intermediate = 10;
    else if (diff >= 51 && diff <= 100) intermediate = 5;
    else if (diff >= 101 && diff <= 150) intermediate = 1;
    
    return worstLoss - intermediate;
  }

  return 1200;
}

/**
 * Calculate ratings for all players by processing all tournaments chronologically
 * This is the main function that should be called to recalculate all ratings
 * Implements the USATT 4-pass algorithm as described at:
 * https://www.usatt.org/events-and-results/rating-systems-explained
 */
/**
 * Map to store post-tournament ratings for display purposes
 * Key: `${tournamentId}-${memberId}`, Value: rating after tournament
 * NOTE: This is now maintained by cacheService, but kept for backward compatibility
 */
const postTournamentRatings = new Map<string, number | null>();

export async function recalculateAllRatings(): Promise<void> {
  // Clear the post-tournament ratings map
  postTournamentRatings.clear();
  
  // Also clear cache service cache (it will be rebuilt)
  const { invalidateTournamentCache } = await import('./cacheService');
  // Invalidate all tournaments - cache will rebuild on next access
  postTournamentRatings.clear();
  // Get all completed tournaments in chronological order
  const tournaments = await prisma.tournament.findMany({
    where: { status: 'COMPLETED' },
    orderBy: { createdAt: 'asc' },
    include: {
      participants: {
        include: { member: true },
      },
      matches: true,
    },
  });

  // Track current ratings as we process tournaments
  const currentRatings = new Map<number, number | null>();

  // Initialize all players - use playerRatingAtTime from their first tournament appearance
  // OR use current database rating if they haven't played in any tournament yet
  const allPlayerIds = new Set<number>();
  const firstTournamentRating = new Map<number, number | null>();
  
  // Track the first tournament appearance for each player
  for (const tournament of tournaments) {
    for (const participant of tournament.participants) {
      allPlayerIds.add(participant.memberId);
      // Use playerRatingAtTime from their first tournament as initial rating
      if (!firstTournamentRating.has(participant.memberId)) {
        firstTournamentRating.set(participant.memberId, participant.playerRatingAtTime);
      }
    }
  }

  // Get current ratings from database for players who appear in tournaments
  // This is used as a fallback if playerRatingAtTime is null
  const playersInDb = await prisma.member.findMany({
    where: { id: { in: Array.from(allPlayerIds) } },
    select: { id: true, rating: true },
  });
  const dbRatings = new Map(playersInDb.map(p => [p.id, p.rating]));

  // Initialize ratings from first tournament appearance, or database rating as fallback
  for (const memberId of allPlayerIds) {
    const firstTournamentRatingValue = firstTournamentRating.get(memberId);
    const dbRating = dbRatings.get(memberId);
    // Prefer playerRatingAtTime from first tournament, fallback to database rating
    currentRatings.set(memberId, firstTournamentRatingValue ?? dbRating ?? null);
  }

  // Process each tournament chronologically
  for (const tournament of tournaments) {
    // Build player data using current ratings (before this tournament)
    const playersData = new Map<number, TournamentPlayerData>();

    for (const participant of tournament.participants) {
      const player = participant.member;
      const matches: PlayerMatchResult[] = [];

      for (const match of tournament.matches) {
        // Skip BYE matches (memberId === 0 or member2Id === null/0) - BYEs don't affect ratings
        if (match.member1Id === 0 || match.member2Id === 0 || match.member2Id === null) {
          continue;
        }
        
        // Skip forfeited matches - forfeits don't affect ratings
        if (match.player1Forfeit || match.player2Forfeit) {
          continue;
        }
        
        let opponentId: number;
        let won: boolean;
        let setsWon: number;
        let setsLost: number;

        // Skip matches that haven't been played (both sets are 0 and no forfeit)
        if ((match.player1Sets === 0 && match.player2Sets === 0) && 
            !match.player1Forfeit && !match.player2Forfeit) {
          continue;
        }

        if (match.member1Id === player.id) {
          opponentId = match.member2Id;
          // Handle forfeits
          if (match.player1Forfeit) {
            won = false;
            setsWon = 0;
            setsLost = 1;
          } else if (match.player2Forfeit) {
            won = true;
            setsWon = 1;
            setsLost = 0;
          } else {
            won = match.player1Sets > match.player2Sets;
            setsWon = match.player1Sets;
            setsLost = match.player2Sets;
          }
        } else if (match.member2Id === player.id) {
          opponentId = match.member1Id;
          // Handle forfeits
          if (match.player2Forfeit) {
            won = false;
            setsWon = 0;
            setsLost = 1;
          } else if (match.player1Forfeit) {
            won = true;
            setsWon = 1;
            setsLost = 0;
          } else {
            won = match.player2Sets > match.player1Sets;
            setsWon = match.player2Sets;
            setsLost = match.player1Sets;
          }
        } else {
          continue;
        }

        const opponentRating = currentRatings.get(opponentId) ?? null;

        matches.push({
          opponentId,
          opponentRating,
          won,
          setsWon,
          setsLost,
        });
      }

      const initialRating = currentRatings.get(player.id) ?? null;
      playersData.set(player.id, {
        memberId: player.id,
        initialRating,
        matches,
        wins: matches.filter(m => m.won).length,
        losses: matches.filter(m => !m.won).length,
      });
    }

    // Check if this is a single match tournament
    const isSingleMatchTournament = tournament.type === 'SINGLE_MATCH';
    
    // For single match tournaments, use playerRatingAtTime directly and simple point exchange
    // Skip the 4-pass algorithm which is designed for multi-match tournaments
    const finalRatings = new Map<number, number>();
    
    if (isSingleMatchTournament) {
      // For single matches, use the simple point exchange calculation
      // Use playerRatingAtTime from tournament participants (rating when tournament was created)
      for (const participant of tournament.participants) {
        const player = participant.member;
        const match = tournament.matches.find(
          m => m.member1Id === player.id || m.member2Id === player.id
        );
        
        if (!match) continue;
        
        const playerRatingAtTime = participant.playerRatingAtTime;
        if (playerRatingAtTime === null) {
          // Unrated player - skip for now (would need Pass 2 logic for unrated)
          continue;
        }
        
        // Find opponent
        const opponentId = match.member1Id === player.id ? match.member2Id : match.member1Id;
        const opponent = tournament.participants.find(p => p.memberId === opponentId);
        const opponentRatingAtTime = opponent?.playerRatingAtTime ?? null;
        
        if (opponentRatingAtTime === null) continue;
        
        // Determine winner
        const isPlayer1 = match.member1Id === player.id;
        const playerWon = isPlayer1 
          ? match.player1Sets > match.player2Sets
          : match.player2Sets > match.player1Sets;
        
        // Calculate rating difference
        const ratingDiff = opponentRatingAtTime - playerRatingAtTime;
        // Upset: player wins as underdog OR opponent wins as underdog (from player's perspective)
        const isUpset = (playerWon && ratingDiff > 0) || (!playerWon && ratingDiff < 0);
        const points = await getPointExchange(Math.abs(ratingDiff), isUpset);
        
        // Apply point exchange
        let newRating = playerRatingAtTime;
        if (playerWon) {
          newRating += points;
        } else {
          newRating -= points;
        }
        
        const finalRating = Math.max(0, Math.round(newRating));
        finalRatings.set(player.id, finalRating);
        currentRatings.set(player.id, finalRating);
        
        // Store post-tournament rating for display (in both caches)
        const { setCachedPostTournamentRating } = await import('./cacheService');
        setCachedPostTournamentRating(tournament.id, player.id, finalRating);
        postTournamentRatings.set(`${tournament.id}-${player.id}`, finalRating);
      }
    } else {
      // For multi-match tournaments, use full 4-pass algorithm
      
      // Pass 1: Process rated players only
      const pass1Ratings = new Map<number, number | null>();
      await Promise.all(
        Array.from(playersData.entries()).map(async ([memberId, data]) => {
          if (data.initialRating !== null) {
            const rating = await calculatePass1(data, playersData);
            pass1Ratings.set(memberId, rating);
          }
        })
      );
      
      // Pass 2: Calculate adjustments for rated players, ratings for unrated
      const pass2Adjustments = new Map<number, number>();
      const pass2Ratings = new Map<number, number | null>();

      for (const [memberId, data] of playersData.entries()) {
        if (data.initialRating !== null) {
          const pass1Rating = pass1Ratings.get(memberId);
          const adjustment = calculatePass2Adjustment(data, pass1Rating ?? null, playersData);
          if (adjustment !== null) {
            pass2Adjustments.set(memberId, adjustment);
          }
        } else {
          const rating = calculatePass2Rating(data, playersData, pass2Adjustments);
          if (rating !== null) {
            pass2Ratings.set(memberId, rating);
            pass2Adjustments.set(memberId, rating);
          }
        }
      }

      // Pass 3: Further adjustments
      const pass3Ratings = new Map<number, number>();
      for (const [memberId, data] of playersData.entries()) {
        const pass2Rating = pass2Adjustments.get(memberId);
        if (pass2Rating === undefined) continue;

        const finalRating = data.initialRating !== null
          ? Math.max(pass2Rating, data.initialRating)
          : pass2Rating;

        pass3Ratings.set(memberId, finalRating);
      }

      // Pass 4: Final rating using point exchange table with adjusted opponent ratings
      for (const [memberId, data] of playersData.entries()) {
        const pass3Rating = pass3Ratings.get(memberId);
        if (pass3Rating === undefined) continue;

        let rating = pass3Rating;

        // Recalculate point exchanges using Pass 3 adjusted opponent ratings
        // This refines the rating based on how opponents' ratings changed
        for (const match of data.matches) {
          const opponentPass3 = pass3Ratings.get(match.opponentId);
          if (opponentPass3 === undefined) continue;

          const ratingDiff = opponentPass3 - rating;
          // An upset occurs when the lower-rated player wins
          // Player wins as underdog: match.won && ratingDiff > 0 (opponent is higher rated)
          // Player loses as favorite: !match.won && ratingDiff < 0 (opponent is lower rated) - this is an upset from opponent's perspective
          // For this player's calculation, upset = they won against a higher-rated opponent
          const isUpset = match.won && ratingDiff > 0;
          const points = await getPointExchange(Math.abs(ratingDiff), isUpset);

          if (match.won) {
            rating += points;
          } else {
            rating -= points;
          }
        }

        const finalRating = Math.max(0, Math.round(rating));
        finalRatings.set(memberId, finalRating);
        // Update current rating for next tournament
        currentRatings.set(memberId, finalRating);
        
        // Store post-tournament rating for display (in both caches)
        const { setCachedPostTournamentRating } = await import('./cacheService');
        setCachedPostTournamentRating(tournament.id, memberId, finalRating);
        postTournamentRatings.set(`${tournament.id}-${memberId}`, finalRating);
      }
    }
  }

  // Update all player ratings in database using batch updates
  // Note: Rating history entries for ROUND_ROBIN tournaments are created
  // only when the tournament is completed, not here
  // Use Promise.all for parallel updates (faster than sequential)
  await Promise.all(
    Array.from(currentRatings.entries()).map(([memberId, rating]) =>
      prisma.member.update({
      where: { id: memberId },
      data: { rating },
      })
    )
  );
}

/**
 * Get the rating of a player after a specific tournament completed
 * This is used for display purposes to show the correct rating change for that tournament
 * First checks the cache, then recalculates if not available
 */
export async function getPostTournamentRating(tournamentId: number, memberId: number): Promise<number | null | undefined> {
  // Check cache service first (persistent cache)
  const { getCachedPostTournamentRating, setCachedPostTournamentRating } = await import('./cacheService');
  const cached = getCachedPostTournamentRating(tournamentId, memberId);
  if (cached !== undefined) {
    // Also update in-memory map for backward compatibility
    postTournamentRatings.set(`${tournamentId}-${memberId}`, cached);
    return cached;
  }
  
  // Fallback to in-memory cache (backward compatibility)
  const memoryCached = postTournamentRatings.get(`${tournamentId}-${memberId}`);
  if (memoryCached !== undefined) {
    return memoryCached;
  }
  
  // Not in cache, need to recalculate
  // First get the tournament to find its createdAt date (avoid nested query)
  const tournamentInfo = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { createdAt: true },
  });
  
  if (!tournamentInfo) {
    return undefined;
  }
  
  // Get all tournaments up to and including this one, in chronological order
  const tournaments = await prisma.tournament.findMany({
    where: { 
      status: 'COMPLETED',
      createdAt: { lte: tournamentInfo.createdAt },
    },
    orderBy: { createdAt: 'asc' },
    include: {
      participants: {
        include: { member: true },
      },
      matches: true,
    },
  });
  
  // Find the specific tournament
  const targetTournament = tournaments.find(t => t.id === tournamentId);
  if (!targetTournament) return undefined;
  
  // Recalculate ratings up to this tournament only
  const rating = await calculateRatingAfterTournament(tournaments, tournamentId, memberId);
  return rating;
}

/**
 * Calculate what a player's rating was after a specific tournament
 * For single matches, uses simple point exchange calculation
 */
async function calculateRatingAfterTournament(
  tournaments: any[],
  targetTournamentId: number,
  memberId: number
): Promise<number | null> {
  // Find the target tournament
  const targetTournament = tournaments.find(t => t.id === targetTournamentId);
  if (!targetTournament) return null;
  
  const participant = targetTournament.participants.find((p: any) => p.memberId === memberId);
  if (!participant) return null;
  
  const playerRatingAtTime = participant.playerRatingAtTime;
  if (playerRatingAtTime === null) return null;
  
  // For single match tournaments, calculate directly
  if (targetTournament.type === 'SINGLE_MATCH') {
    const match = targetTournament.matches.find((m: any) => 
      m.member1Id === memberId || m.member2Id === memberId
    );
    if (!match || match.player1Sets === 0 && match.player2Sets === 0) {
      return playerRatingAtTime; // Match not played
    }
    
    const opponentId = match.member1Id === memberId ? match.member2Id : match.member1Id;
    const opponent = targetTournament.participants.find((p: any) => p.memberId === opponentId);
    const opponentRating = opponent?.playerRatingAtTime ?? null;
    
    if (opponentRating === null) return playerRatingAtTime;
    
    const isPlayer1 = match.member1Id === memberId;
    const playerWon = isPlayer1 
      ? match.player1Sets > match.player2Sets
      : match.player2Sets > match.player1Sets;
    
    const ratingDiff = opponentRating - playerRatingAtTime;
    const isUpset = (playerWon && ratingDiff > 0) || (!playerWon && ratingDiff < 0);
    const points = await getPointExchange(Math.abs(ratingDiff), isUpset);
    
    let newRating = playerRatingAtTime;
    if (playerWon) {
      newRating += points;
    } else {
      newRating -= points;
    }
    
    return Math.max(0, Math.round(newRating));
  }
  
  // For other tournament types, would need full 4-pass algorithm
  // For now, return the starting rating (can be improved later)
  return playerRatingAtTime;
}

/**
 * Get current rating for a player (from database)
 */
export async function getPlayerRating(memberId: number): Promise<number | null> {
  const player = await prisma.member.findUnique({
    where: { id: memberId },
    select: { rating: true },
  });
  return player?.rating ?? null;
}

/**
 * Calculate ratings for a single ROUND_ROBIN tournament using the 4-pass algorithm
 * This uses playerRatingAtTime (ratings at tournament start), not current DB ratings
 */
async function calculateRatingsForRoundRobinTournament(tournament: any): Promise<Map<number, number>> {
  // Build player data using playerRatingAtTime (ratings at tournament start)
  const playersData = new Map<number, TournamentPlayerData>();

  for (const participant of tournament.participants) {
    const player = participant.member;
    const matches: PlayerMatchResult[] = [];

    for (const match of tournament.matches) {
      // Skip BYE matches and forfeited matches
      if (match.member1Id === 0 || match.member2Id === 0 || match.member2Id === null ||
          match.player1Forfeit || match.player2Forfeit) {
        continue;
      }
      
      // Skip matches that haven't been played
      if ((match.player1Sets === 0 && match.player2Sets === 0)) {
        continue;
      }

      let opponentId: number;
      let won: boolean;
      let setsWon: number;
      let setsLost: number;

      if (match.member1Id === player.id) {
        opponentId = match.member2Id;
        won = match.player1Sets > match.player2Sets;
        setsWon = match.player1Sets;
        setsLost = match.player2Sets;
      } else if (match.member2Id === player.id) {
        opponentId = match.member1Id;
        won = match.player2Sets > match.player1Sets;
        setsWon = match.player2Sets;
        setsLost = match.player1Sets;
      } else {
        continue;
      }

      // Get opponent's rating at tournament start
      const opponent = tournament.participants.find((p: any) => p.memberId === opponentId);
      const opponentRating = opponent?.playerRatingAtTime ?? null;

      matches.push({
        opponentId,
        opponentRating,
        won,
        setsWon,
        setsLost,
      });
    }

    const initialRating = participant.playerRatingAtTime ?? null;
    playersData.set(player.id, {
      memberId: player.id,
      initialRating,
      matches,
      wins: matches.filter(m => m.won).length,
      losses: matches.filter(m => !m.won).length,
    });
  }

  // Apply 4-pass algorithm
  // Pass 1: Process rated players only
  const pass1Ratings = new Map<number, number | null>();
  await Promise.all(
    Array.from(playersData.entries()).map(async ([memberId, data]) => {
      if (data.initialRating !== null) {
        const rating = await calculatePass1(data, playersData);
        pass1Ratings.set(memberId, rating);
      }
    })
  );
  
  // Pass 2: Calculate adjustments for rated players, ratings for unrated
  const pass2Adjustments = new Map<number, number>();
  const pass2Ratings = new Map<number, number | null>();

  for (const [memberId, data] of playersData.entries()) {
    if (data.initialRating !== null) {
      const pass1Rating = pass1Ratings.get(memberId);
      const adjustment = calculatePass2Adjustment(data, pass1Rating ?? null, playersData);
      if (adjustment !== null) {
        pass2Adjustments.set(memberId, adjustment);
      }
    } else {
      const rating = calculatePass2Rating(data, playersData, pass2Adjustments);
      if (rating !== null) {
        pass2Ratings.set(memberId, rating);
        pass2Adjustments.set(memberId, rating);
      }
    }
  }

  // Pass 3: Further adjustments
  const pass3Ratings = new Map<number, number>();
  for (const [memberId, data] of playersData.entries()) {
    const pass2Rating = pass2Adjustments.get(memberId);
    if (pass2Rating === undefined) continue;

    const finalRating = data.initialRating !== null
      ? Math.max(pass2Rating, data.initialRating)
      : pass2Rating;

    pass3Ratings.set(memberId, finalRating);
  }

  // Pass 4: Final rating using point exchange table with adjusted opponent ratings
  const finalRatings = new Map<number, number>();
  for (const [memberId, data] of playersData.entries()) {
    const pass3Rating = pass3Ratings.get(memberId);
    if (pass3Rating === undefined) continue;

    let rating = pass3Rating;

    // Recalculate point exchanges using Pass 3 adjusted opponent ratings
    for (const match of data.matches) {
      const opponentPass3 = pass3Ratings.get(match.opponentId);
      if (opponentPass3 === undefined) continue;

      const ratingDiff = opponentPass3 - rating;
      const isUpset = match.won && ratingDiff > 0;
      const points = await getPointExchange(Math.abs(ratingDiff), isUpset);

      if (match.won) {
        rating += points;
      } else {
        rating -= points;
      }
    }

    const finalRating = Math.max(0, Math.round(rating));
    finalRatings.set(memberId, finalRating);
  }

  return finalRatings;
}

/**
 * Calculate ratings and create rating history for a ROUND_ROBIN tournament after completion
 * This should be called once when a ROUND_ROBIN tournament is marked as COMPLETED
 */
export async function createRatingHistoryForRoundRobinTournament(tournamentId: number): Promise<void> {
  // Get the tournament with participants and matches
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      participants: {
        include: { member: true },
      },
      matches: true,
    },
  });

  if (!tournament || tournament.type !== 'ROUND_ROBIN') {
    return; // Not a ROUND_ROBIN tournament
  }

  // Calculate final ratings using 4-pass algorithm (based on playerRatingAtTime)
  const finalRatings = await calculateRatingsForRoundRobinTournament(tournament);

  // Update player ratings in database with calculated final ratings using batch updates
  await Promise.all(
    Array.from(finalRatings.entries()).map(([memberId, finalRating]) =>
      prisma.member.update({
      where: { id: memberId },
      data: { rating: finalRating },
      })
    )
  );

  // Get current ratings from database (after update) in a single query
  // These are the actual current ratings that should be stored in history
  const participantIds = tournament.participants.map(p => p.memberId);
  const members = await prisma.member.findMany({
    where: { id: { in: participantIds } },
    select: { id: true, rating: true },
  });
  const currentRatingsMap = new Map<number, number | null>();
  members.forEach(member => {
    currentRatingsMap.set(member.id, member.rating);
  });

  // Get tournament recordedAt time (or createdAt if recordedAt is null) for timestamp
  // For ROUND_ROBIN, ratings are calculated when tournament is completed, so use recordedAt
  const tournamentTimestamp = tournament.recordedAt || tournament.createdAt;

  // Create rating history entries for each participant
  // Use current rating from database, but calculate change from playerRatingAtTime
  for (const participant of tournament.participants) {
    const ratingBefore = participant.playerRatingAtTime ?? 1200;
    const ratingAfter = currentRatingsMap.get(participant.memberId) ?? ratingBefore;
    const ratingChange = ratingAfter - ratingBefore;
    
    // Only create history entry if rating changed
    if (ratingChange !== 0) {
      // Check if rating history entry already exists for this tournament+player
      const existingEntry = await (prisma as any).ratingHistory.findFirst({
        where: {
          memberId: participant.memberId,
          tournamentId: tournament.id,
          reason: 'TOURNAMENT_COMPLETED',
          matchId: null,
        },
      });
      
      // Only create if it doesn't exist (safety check)
      if (!existingEntry) {
        await (prisma as any).ratingHistory.create({
          data: {
            memberId: participant.memberId,
            rating: ratingAfter,
            ratingChange: ratingChange,
            reason: 'TOURNAMENT_COMPLETED',
            tournamentId: tournament.id,
            matchId: null, // ROUND_ROBIN changes are tournament-level, not per-match
            timestamp: tournamentTimestamp, // Use tournament recordedAt time
          },
        });
      }
    }
  }
}

/**
 * Get ratings for multiple players
 */
export async function getPlayerRatings(memberIds: number[]): Promise<Map<number, number | null>> {
  const players = await prisma.member.findMany({
    where: { id: { in: memberIds } },
    select: { id: true, rating: true },
  });

  const ratings = new Map<number, number | null>();
  for (const player of players) {
    ratings.set(player.id, player.rating);
  }

  return ratings;
}

/**
 * Calculate rating adjustment for a single match
 * Uses simplified USATT point exchange system
 */
export async function adjustRatingsForSingleMatch(
  player1Id: number,
  player2Id: number,
  player1Won: boolean,
  tournamentId: number,
  matchId?: number
): Promise<void> {
  // BYE matches (memberId === 0) should not affect ratings
  if (player1Id === 0 || player2Id === 0 || player2Id === null) {
    return; // Skip rating adjustment for BYE matches
  }

  // Get tournament with participants to use playerRatingAtTime (rating when tournament started)
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

  const participant1 = tournament.participants.find(p => p.memberId === player1Id);
  const participant2 = tournament.participants.find(p => p.memberId === player2Id);

  if (!participant1 || !participant2) {
    throw new Error('Players not found in tournament participants');
  }

  // Use playerRatingAtTime (rating when tournament was created), not current rating
  // This ensures we calculate based on ratings at the time of the match
  const rating1Before = participant1.playerRatingAtTime ?? 1200; // Default to 1200 if unrated
  const rating2Before = participant2.playerRatingAtTime ?? 1200;

  // Calculate rating difference
  const ratingDiff = rating2Before - rating1Before;
  // An upset occurs when the lower-rated player wins
  // Player 1 wins as underdog: player1Won && ratingDiff > 0 (Player 2 is higher rated)
  // Player 2 wins as underdog: !player1Won && ratingDiff < 0 (Player 1 is higher rated)
  const isUpset = (player1Won && ratingDiff > 0) || (!player1Won && ratingDiff < 0);

  // Get point exchange
  const points = await getPointExchange(Math.abs(ratingDiff), isUpset);

  // Calculate new ratings
  let newRating1 = rating1Before;
  let newRating2 = rating2Before;

  if (player1Won) {
    newRating1 += points;
    newRating2 -= points;
  } else {
    newRating1 -= points;
    newRating2 += points;
  }

  // Ensure ratings don't go below 0
  newRating1 = Math.max(0, Math.round(newRating1));
  newRating2 = Math.max(0, Math.round(newRating2));

  // Calculate rating changes
  const ratingChange1 = newRating1 - rating1Before;
  const ratingChange2 = newRating2 - rating2Before;

  // Update player ratings in parallel
  await Promise.all([
    prisma.member.update({
    where: { id: player1Id },
    data: { rating: newRating1 },
    }),
    prisma.member.update({
    where: { id: player2Id },
    data: { rating: newRating2 },
    }),
  ]);

  // Determine the reason based on tournament type
  // For playoff tournaments, use PLAYOFF_MATCH_COMPLETED; otherwise use MATCH_COMPLETED
  const ratingChangeReason = tournament.type === 'PLAYOFF' ? 'PLAYOFF_MATCH_COMPLETED' : 'MATCH_COMPLETED';

  // Create rating history entries with appropriate reason
  await (prisma as any).ratingHistory.create({
    data: {
      memberId: player1Id,
      rating: newRating1,
      ratingChange: ratingChange1,
      reason: ratingChangeReason,
      tournamentId: tournamentId,
      matchId: matchId,
    },
  });

  await (prisma as any).ratingHistory.create({
    data: {
      memberId: player2Id,
      rating: newRating2,
      ratingChange: ratingChange2,
      reason: ratingChangeReason,
      tournamentId: tournamentId,
      matchId: matchId,
    },
  });
}

