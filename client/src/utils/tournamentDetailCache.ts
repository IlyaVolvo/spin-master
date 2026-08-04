import type { Tournament } from '../types/tournament';

type CacheEntry = {
  tournament: Tournament;
  fetchedAt: number;
};

/** In-memory detail payloads for tournaments the user has opened this session. */
const byRootId = new Map<number, CacheEntry>();
/** Maps nested child tournament ids to their cached root id. */
const childToRootId = new Map<number, number>();

function collectTournamentAndChildIds(tournament: Tournament): number[] {
  const ids: number[] = [tournament.id];
  for (const child of tournament.childTournaments ?? []) {
    ids.push(...collectTournamentAndChildIds(child));
  }
  return ids;
}

function clearChildIndexForRoot(rootId: number, tournament: Tournament | undefined): void {
  if (!tournament) return;
  for (const id of collectTournamentAndChildIds(tournament)) {
    if (id !== rootId) {
      childToRootId.delete(id);
    }
  }
}

function resolveRootId(tournamentId: number): number | null {
  if (byRootId.has(tournamentId)) return tournamentId;
  return childToRootId.get(tournamentId) ?? null;
}

/**
 * Return a cached root tournament for this id (root or nested child).
 * Caller should navigate to `tournament.id` when it differs from the requested id.
 */
export function getCachedTournamentDetail(tournamentId: number): Tournament | null {
  const rootId = resolveRootId(tournamentId);
  if (rootId == null) return null;
  return byRootId.get(rootId)?.tournament ?? null;
}

/**
 * Replace a node (root or nested child) that matches `updated.id` inside a tournament tree.
 * Returns the original reference when nothing changed.
 */
export function replaceTournamentInTree(root: Tournament, updated: Tournament): Tournament {
  if (root.id === updated.id) return updated;
  const children = root.childTournaments;
  if (!children?.length) return root;
  let changed = false;
  const nextChildren = children.map((child) => {
    const next = replaceTournamentInTree(child, updated);
    if (next !== child) changed = true;
    return next;
  });
  if (!changed) return root;
  return { ...root, childTournaments: nextChildren };
}

/**
 * Cache a root tournament detail payload. Never cache a child (parentTournamentId set) —
 * invalidate the parent instead so the next load refetches the full tree.
 */
export function setCachedTournamentDetail(tournament: Tournament): void {
  const parentId = (tournament as { parentTournamentId?: number | null }).parentTournamentId;
  if (parentId != null) {
    invalidateTournamentDetailCache(Number(parentId));
    invalidateTournamentDetailCache(tournament.id);
    return;
  }

  const existing = byRootId.get(tournament.id);
  if (existing) {
    clearChildIndexForRoot(tournament.id, existing.tournament);
  }
  byRootId.set(tournament.id, { tournament, fetchedAt: Date.now() });
  for (const id of collectTournamentAndChildIds(tournament)) {
    if (id !== tournament.id) {
      childToRootId.set(id, tournament.id);
    }
  }
}

/** Drop cache for a root or any child id that belongs to a cached tree. */
export function invalidateTournamentDetailCache(tournamentId: number): void {
  const rootId = resolveRootId(tournamentId);
  if (rootId == null) {
    byRootId.delete(tournamentId);
    return;
  }
  const entry = byRootId.get(rootId);
  clearChildIndexForRoot(rootId, entry?.tournament);
  byRootId.delete(rootId);
}

export function clearTournamentDetailCache(): void {
  byRootId.clear();
  childToRootId.clear();
}

/**
 * Completed tournaments almost never change — serve cache without a network round-trip
 * unless the entry was invalidated (socket / local mutation).
 */
export function shouldNetworkRefreshCachedTournament(tournament: Tournament): boolean {
  return tournament.status !== 'COMPLETED';
}
