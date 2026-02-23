// Module-level caches and utility functions for match data.
// These have no React dependencies and are shared across components.

export interface CachedMatch {
  id: number;
  member1Id: number;
  member2Id: number | null;
  updatedAt: string;
  createdAt: string;
}

export const matchesCache: {
  data: CachedMatch[] | null;
  lastFetch: number;
} = {
  data: null,
  lastFetch: 0,
};

// Cache for match counts - stores counts for each time period configuration
export const matchCountsCache: Map<string, Map<number, number>> = new Map();

// Helper function to get cache key for a time period configuration
export const getMatchCountsCacheKey = (
  timePeriod: string,
  customStartDate: string | null,
  customEndDate: string | null
): string => {
  return `${timePeriod}_${customStartDate || ''}_${customEndDate || ''}`;
};

// Function to update match counts cache incrementally when a match is added/updated
export const updateMatchCountsCache = (
  match: CachedMatch,
  isNewMatch: boolean
) => {
  if (!matchesCache.data) {
    // Initialize matches cache if it doesn't exist
    matchesCache.data = [];
  }

  // Update matches cache
  if (isNewMatch) {
    matchesCache.data.push(match);
  } else {
    const index = matchesCache.data.findIndex(m => m.id === match.id);
    if (index !== -1) {
      matchesCache.data[index] = match;
    } else {
      // Match not found, add it as new
      matchesCache.data.push(match);
    }
  }
  matchesCache.lastFetch = Date.now();

  // Recalculate counts for the two players involved in this match
  // This ensures accuracy for both new and updated matches
  const playerIds = [match.member1Id, match.member2Id].filter(id => id !== null) as number[];
  
  recalculateCountsForPlayers(playerIds);
};

// Function to remove a match from cache and update counts
export const removeMatchFromCache = (matchId: number, member1Id: number, member2Id: number | null) => {
  if (!matchesCache.data) return;

  // Remove match from cache
  const index = matchesCache.data.findIndex(m => m.id === matchId);
  if (index !== -1) {
    matchesCache.data.splice(index, 1);
    matchesCache.lastFetch = Date.now();

    // Recalculate counts for both players from remaining matches
    const playerIds = [member1Id, member2Id].filter(id => id !== null) as number[];
    
    recalculateCountsForPlayers(playerIds);
  }
};

// Shared helper to recalculate match counts for given player IDs across all cached time periods
function recalculateCountsForPlayers(playerIds: number[]) {
  matchCountsCache.forEach((counts, cacheKey) => {
    // Parse cache key to get time period info
    const parts = cacheKey.split('_');
    const timePeriod = parts[0];
    const customStartStr = parts.slice(1, -1).join('_') || null;
    const customEndStr = parts[parts.length - 1] || null;
    const customStartDate = customStartStr && customStartStr !== '' ? customStartStr : null;
    const customEndDate = customEndStr && customEndStr !== '' ? customEndStr : null;

    // Calculate date range for this cache entry
    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    if (timePeriod === 'today') {
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
    } else if (timePeriod === 'week') {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
    } else if (timePeriod === 'month') {
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 1);
      startDate.setHours(0, 0, 0, 0);
    } else if (timePeriod === 'custom' && customStartDate && customEndDate) {
      startDate = new Date(customStartDate);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(customEndDate);
      endDate.setHours(23, 59, 59, 999);
    } else if (timePeriod === 'all') {
      // For 'all', count all matches regardless of date
      playerIds.forEach(playerId => {
        let count = 0;
        matchesCache.data!.forEach(m => {
          if (m.member1Id === playerId || m.member2Id === playerId) {
            count++;
          }
        });
        counts.set(playerId, count);
      });
      return; // Early return for 'all' since we've already processed it
    } else {
      return; // Skip invalid cache entries
    }

    // Recalculate counts for both players from all matches in cache
    playerIds.forEach(playerId => {
      let count = 0;
      matchesCache.data!.forEach(m => {
        const mDate = new Date(m.updatedAt || m.createdAt);
        if (mDate >= startDate && mDate <= endDate) {
          if (m.member1Id === playerId || m.member2Id === playerId) {
            count++;
          }
        }
      });
      counts.set(playerId, count);
    });
  });
}
