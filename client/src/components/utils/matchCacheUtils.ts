// Module-level caches and utility functions for match data.
// These have no React dependencies and are shared across components.

export interface CachedMatch {
  id: number;
  member1Id: number;
  member2Id: number | null;
  updatedAt: string;
  createdAt: string;
  /** When present, used to exclude unplayed 0–0 shells from “games played”. */
  player1Sets?: number;
  player2Sets?: number;
  player1Forfeit?: boolean;
  player2Forfeit?: boolean;
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

function toIsoString(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.length > 0) return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return fallback;
}

/**
 * Normalize one API / Prisma match row for caches and counts.
 * Coerces ids to numbers so Map lookups match numeric member ids from the roster.
 */
export function cachedMatchFromLooseApi(raw: unknown): CachedMatch | null {
  if (raw == null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = Number(r.id);
  const member1Id = Number(r.member1Id);
  if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(member1Id) || member1Id <= 0) {
    return null;
  }
  let member2Id: number | null = null;
  if (r.member2Id != null && r.member2Id !== '') {
    const m2 = Number(r.member2Id);
    if (Number.isFinite(m2) && m2 > 0) member2Id = m2;
  }
  const created = toIsoString(r.createdAt, new Date(0).toISOString());
  const updated = toIsoString(r.updatedAt, created);
  const p1s = r.player1Sets;
  const p2s = r.player2Sets;
  const p1f = r.player1Forfeit;
  const p2f = r.player2Forfeit;
  const out: CachedMatch = {
    id,
    member1Id,
    member2Id,
    updatedAt: updated,
    createdAt: created,
  };
  if (typeof p1s === 'number' && Number.isFinite(p1s)) out.player1Sets = p1s;
  if (typeof p2s === 'number' && Number.isFinite(p2s)) out.player2Sets = p2s;
  if (typeof p1f === 'boolean') out.player1Forfeit = p1f;
  if (typeof p2f === 'boolean') out.player2Forfeit = p2f;
  return out;
}

/** True if this row should count toward “games played” (excludes scheduled 0–0 with no forfeit). */
export function matchCountsAsGamesPlayed(m: CachedMatch): boolean {
  const hasScoreData =
    m.player1Sets !== undefined ||
    m.player2Sets !== undefined ||
    m.player1Forfeit === true ||
    m.player2Forfeit === true;
  if (!hasScoreData) return true;
  if (m.player1Forfeit || m.player2Forfeit) return true;
  const p1 = m.player1Sets ?? 0;
  const p2 = m.player2Sets ?? 0;
  return p1 > 0 || p2 > 0;
}

export function normalizeCachedMatchRows(raw: unknown): CachedMatch[] {
  if (!Array.isArray(raw)) return [];
  const out: CachedMatch[] = [];
  for (const row of raw) {
    const m = cachedMatchFromLooseApi(row);
    if (m) out.push(m);
  }
  return out;
}

/** Flatten matches from GET /tournaments (merged with DB rows for completeness). */
export function collectCachedMatchesFromTournamentsPayload(tournaments: unknown): CachedMatch[] {
  const byId = new Map<number, CachedMatch>();

  const pushMatch = (raw: unknown) => {
    const m = cachedMatchFromLooseApi(raw);
    if (m) byId.set(m.id, m);
  };

  const walk = (node: any) => {
    if (node == null || typeof node !== 'object') return;
    if (Array.isArray(node.matches)) {
      for (const m of node.matches) pushMatch(m);
    }
    if (Array.isArray(node.bracketMatches)) {
      for (const bm of node.bracketMatches) {
        if (bm?.match) pushMatch(bm.match);
      }
    }
    if (Array.isArray(node.childTournaments)) {
      for (const child of node.childTournaments) walk(child);
    }
  };

  if (!Array.isArray(tournaments)) return [];
  for (const t of tournaments) walk(t);
  return Array.from(byId.values());
}

// Function to update match counts cache incrementally when a match is added/updated
export const updateMatchCountsCache = (
  match: CachedMatch | Record<string, unknown>,
  isNewMatch: boolean
) => {
  const normalized = cachedMatchFromLooseApi(match);
  if (!normalized) return;

  if (!matchesCache.data) {
    // Initialize matches cache if it doesn't exist
    matchesCache.data = [];
  }

  // Update matches cache
  if (isNewMatch) {
    matchesCache.data.push(normalized);
  } else {
    const index = matchesCache.data.findIndex(m => m.id === normalized.id);
    if (index !== -1) {
      matchesCache.data[index] = normalized;
    } else {
      // Match not found, add it as new
      matchesCache.data.push(normalized);
    }
  }
  matchesCache.lastFetch = Date.now();

  // Recalculate counts for the two players involved in this match
  // This ensures accuracy for both new and updated matches
  const playerIds = [normalized.member1Id, normalized.member2Id].filter(id => id !== null) as number[];

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
          if (!matchCountsAsGamesPlayed(m)) return;
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
        if (!matchCountsAsGamesPlayed(m)) return;
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
