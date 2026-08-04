/**
 * Shared helpers to attach per-match rating history onto Match objects.
 * Used by basic plugins and compound batch enrich to avoid N history queries.
 */

export const RATING_HISTORY_ATTACHED = '__ratingHistoryAttached';

export function applyRatingHistoryToMatches(matches: any[] | undefined | null, historyRows: any[]): void {
  if (!matches || matches.length === 0) return;

  const historyByMatch = new Map<number, any[]>();
  for (const h of historyRows) {
    if (!h.matchId) continue;
    if (!historyByMatch.has(h.matchId)) historyByMatch.set(h.matchId, []);
    historyByMatch.get(h.matchId)!.push(h);
  }

  for (const match of matches) {
    const entries = historyByMatch.get(match.id) || [];
    const h1 = entries.find((e: any) => e.memberId === match.member1Id);
    const h2 = entries.find((e: any) => e.memberId === match.member2Id);
    match.player1RatingBefore = h1 ? h1.rating - h1.ratingChange : null;
    match.player1RatingChange = h1 ? h1.ratingChange : null;
    match.player2RatingBefore = h2 ? h2.rating - h2.ratingChange : null;
    match.player2RatingChange = h2 ? h2.ratingChange : null;
  }
}

export function markMatchesRatingHistoryAttached(matches: any[] | undefined | null): void {
  if (!matches) return;
  (matches as any)[RATING_HISTORY_ATTACHED] = true;
}

export function matchesHaveRatingHistoryAttached(matches: any[] | undefined | null): boolean {
  return Boolean(matches && (matches as any)[RATING_HISTORY_ATTACHED]);
}

/** Fetch rating history for match ids and attach onto the given match objects in place. */
export async function attachMatchRatingHistory(matches: any[] | undefined | null, prisma: any): Promise<void> {
  if (!matches || matches.length === 0) return;
  if (matchesHaveRatingHistoryAttached(matches)) return;

  const matchIds = matches.filter((m: any) => m?.id).map((m: any) => m.id);
  if (matchIds.length === 0) return;

  const allRatingHistory = await prisma.ratingHistory.findMany({
    where: { matchId: { in: matchIds } },
  });

  applyRatingHistoryToMatches(matches, allRatingHistory);
  markMatchesRatingHistoryAttached(matches);
}

/**
 * One query for all matches across multiple match arrays (e.g. compound children),
 * then attach in place and mark each array so child plugins skip re-fetch.
 */
export async function attachMatchRatingHistoryBatch(
  matchGroups: Array<any[] | undefined | null>,
  prisma: any,
): Promise<void> {
  const allMatches: any[] = [];
  for (const group of matchGroups) {
    if (!group || group.length === 0) continue;
    if (matchesHaveRatingHistoryAttached(group)) continue;
    for (const m of group) {
      if (m?.id) allMatches.push(m);
    }
  }

  if (allMatches.length === 0) {
    for (const group of matchGroups) {
      if (group) markMatchesRatingHistoryAttached(group);
    }
    return;
  }

  const matchIds = allMatches.map((m) => m.id);
  const allRatingHistory = await prisma.ratingHistory.findMany({
    where: { matchId: { in: matchIds } },
  });

  applyRatingHistoryToMatches(allMatches, allRatingHistory);
  for (const group of matchGroups) {
    if (group) markMatchesRatingHistoryAttached(group);
  }
}
