/**
 * Tiny in-memory LRU for enriched GET /tournaments/:id payloads.
 * Caps at 3 entries so "today's" events stay warm without unbounded growth.
 */

const MAX_ENTRIES = 3;

type CacheEntry = {
  data: any;
  updatedAt: number;
};

const cache = new Map<number, CacheEntry>();

function touch(id: number, entry: CacheEntry): void {
  // Map iteration order = insertion order; re-insert to mark as most-recently used.
  cache.delete(id);
  cache.set(id, entry);
}

function treeContainsTournamentId(tournament: any, id: number): boolean {
  if (!tournament) return false;
  if (tournament.id === id) return true;
  const children = tournament.childTournaments;
  if (!Array.isArray(children)) return false;
  return children.some((child: any) => treeContainsTournamentId(child, id));
}

export function getTournamentDetailCache(tournamentId: number): any | undefined {
  const entry = cache.get(tournamentId);
  if (!entry) return undefined;
  touch(tournamentId, entry);
  return entry.data;
}

export function setTournamentDetailCache(tournamentId: number, data: any): void {
  if (cache.has(tournamentId)) {
    touch(tournamentId, { data, updatedAt: Date.now() });
    return;
  }
  while (cache.size >= MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
  cache.set(tournamentId, { data, updatedAt: Date.now() });
}

/**
 * Invalidate the given tournament id and any cached root that nests it
 * (so child match updates clear the parent detail cache).
 */
export function invalidateTournamentDetailCache(tournamentId: number): void {
  if (!Number.isFinite(tournamentId)) return;
  const keysToDelete: number[] = [];
  for (const [key, entry] of cache.entries()) {
    if (key === tournamentId || treeContainsTournamentId(entry.data, tournamentId)) {
      keysToDelete.push(key);
    }
  }
  for (const key of keysToDelete) {
    cache.delete(key);
  }
}

/** Test helper */
export function clearTournamentDetailCache(): void {
  cache.clear();
}

/** Test helper */
export function getTournamentDetailCacheSize(): number {
  return cache.size;
}
