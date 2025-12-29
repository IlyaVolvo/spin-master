import { prisma } from '../index';
import { logger } from '../utils/logger';

/**
 * Cache service for post-tournament ratings
 * Keeps cache always up-to-date and persists across server restarts
 */

// In-memory cache: Map<`${tournamentId}-${memberId}`, rating>
const postTournamentRatingsCache = new Map<string, number | null>();

// Cache metadata: tracks when cache was last updated
let cacheLastUpdated: number = 0;
let cacheInitialized: boolean = false;

/**
 * Initialize cache by loading all post-tournament ratings from database
 * This is called on server startup to ensure cache is always up-to-date
 */
export async function initializeCache(): Promise<void> {
  if (cacheInitialized) {
    return;
  }

  try {
    logger.info('Initializing post-tournament ratings cache...');
    
    // Get all completed tournaments
    const completedTournaments = await prisma.tournament.findMany({
      where: { status: 'COMPLETED' },
      include: {
        participants: {
          include: { member: true },
        },
        matches: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Calculate ratings chronologically (same logic as recalculateAllRatings)
    const currentRatings = new Map<number, number | null>();
    
    // Initialize ratings from first tournament appearance
    const allPlayerIds = new Set<number>();
    const firstTournamentRating = new Map<number, number | null>();
    
    for (const tournament of completedTournaments) {
      for (const participant of tournament.participants) {
        allPlayerIds.add(participant.memberId);
        if (!firstTournamentRating.has(participant.memberId)) {
          firstTournamentRating.set(participant.memberId, participant.playerRatingAtTime);
        }
      }
    }

    // Get current ratings from database
    const playersInDb = await prisma.member.findMany({
      where: { id: { in: Array.from(allPlayerIds) } },
      select: { id: true, rating: true },
    });
    const dbRatings = new Map(playersInDb.map(p => [p.id, p.rating]));

    // Initialize ratings
    for (const memberId of allPlayerIds) {
      const firstTournamentRatingValue = firstTournamentRating.get(memberId);
      const dbRating = dbRatings.get(memberId);
      currentRatings.set(memberId, firstTournamentRatingValue ?? dbRating ?? null);
    }

    // Process each tournament chronologically and cache post-tournament ratings
    const { getPostTournamentRating } = await import('./usattRatingService');
    
    for (const tournament of completedTournaments) {
      // Calculate ratings for this tournament
      const tournamentRatings = new Map<number, number | null>();
      
      for (const participant of tournament.participants) {
        const rating = await getPostTournamentRating(tournament.id, participant.memberId);
        tournamentRatings.set(participant.memberId, rating ?? null);
        
        // Cache the rating
        const cacheKey = `${tournament.id}-${participant.memberId}`;
        postTournamentRatingsCache.set(cacheKey, rating ?? null);
      }
      
      // Update current ratings for next tournament
      for (const [memberId, rating] of tournamentRatings.entries()) {
        currentRatings.set(memberId, rating);
      }
    }

    cacheLastUpdated = Date.now();
    cacheInitialized = true;
    
    logger.info('Post-tournament ratings cache initialized', {
      tournamentsProcessed: completedTournaments.length,
      cacheSize: postTournamentRatingsCache.size,
    });
  } catch (error) {
    logger.error('Error initializing cache', { error: error instanceof Error ? error.message : String(error) });
    // Continue anyway - cache will be built on-demand
  }
}

/**
 * Get post-tournament rating from cache
 */
export function getCachedPostTournamentRating(tournamentId: number, memberId: number): number | null | undefined {
  const cacheKey = `${tournamentId}-${memberId}`;
  return postTournamentRatingsCache.get(cacheKey);
}

/**
 * Set post-tournament rating in cache
 */
export function setCachedPostTournamentRating(tournamentId: number, memberId: number, rating: number | null): void {
  const cacheKey = `${tournamentId}-${memberId}`;
  postTournamentRatingsCache.set(cacheKey, rating);
  cacheLastUpdated = Date.now();
}

/**
 * Invalidate cache for a specific tournament
 * This is called when a tournament is updated or matches are changed
 */
export function invalidateTournamentCache(tournamentId: number): void {
  // Remove all entries for this tournament
  const keysToDelete: string[] = [];
  for (const key of postTournamentRatingsCache.keys()) {
    if (key.startsWith(`${tournamentId}-`)) {
      keysToDelete.push(key);
    }
  }
  
  keysToDelete.forEach(key => postTournamentRatingsCache.delete(key));
  
  logger.debug('Invalidated tournament cache', {
    tournamentId,
    entriesRemoved: keysToDelete.length,
  });
}

/**
 * Invalidate cache for all tournaments after a specific date
 * This is called when a tournament is completed or matches are updated
 */
export function invalidateCacheAfterTournament(tournamentId: number): Promise<void> {
  return new Promise(async (resolve) => {
    try {
      // Get the tournament's createdAt date
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: { createdAt: true },
      });

      if (!tournament) {
        resolve();
        return;
      }

      // Get all tournaments created after this one
      const laterTournaments = await prisma.tournament.findMany({
        where: {
          createdAt: { gt: tournament.createdAt },
        },
        select: { id: true },
      });

      // Invalidate cache for all later tournaments
      for (const laterTournament of laterTournaments) {
        invalidateTournamentCache(laterTournament.id);
      }

      // Also invalidate this tournament
      invalidateTournamentCache(tournamentId);

      logger.debug('Invalidated cache for tournament and later tournaments', {
        tournamentId,
        laterTournamentsCount: laterTournaments.length,
      });
    } catch (error) {
      logger.error('Error invalidating cache after tournament', {
        error: error instanceof Error ? error.message : String(error),
        tournamentId,
      });
    }
    
    resolve();
  });
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    size: postTournamentRatingsCache.size,
    lastUpdated: cacheLastUpdated,
    initialized: cacheInitialized,
  };
}

