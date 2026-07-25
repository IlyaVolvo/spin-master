import type { PrismaClient } from '@prisma/client';

export type MatchDateRange = {
  from: Date;
  to: Date;
};

function isPlayedMatch(match: {
  player1Sets: number;
  player2Sets: number;
  player1Forfeit: boolean;
  player2Forfeit: boolean;
}): boolean {
  return (
    match.player1Sets > 0 ||
    match.player2Sets > 0 ||
    match.player1Forfeit ||
    match.player2Forfeit
  );
}

/** Collect match dates from a tournament tree (parent + children). Uses updatedAt of played matches. */
export function computeMatchDateRangeFromTournamentTree(tournament: {
  matches?: Array<{
    player1Sets: number;
    player2Sets: number;
    player1Forfeit: boolean;
    player2Forfeit: boolean;
    updatedAt: Date | string;
  }> | null;
  childTournaments?: Array<{
    matches?: Array<{
      player1Sets: number;
      player2Sets: number;
      player1Forfeit: boolean;
      player2Forfeit: boolean;
      updatedAt: Date | string;
    }> | null;
  }> | null;
}): MatchDateRange | null {
  const dates: Date[] = [];
  const consider = (matches: any[] | null | undefined) => {
    for (const match of matches || []) {
      if (!isPlayedMatch(match) || !match.updatedAt) continue;
      const d = new Date(match.updatedAt);
      if (!Number.isNaN(d.getTime())) dates.push(d);
    }
  };
  consider(tournament.matches);
  for (const child of tournament.childTournaments || []) {
    consider(child.matches);
  }
  if (dates.length === 0) return null;
  let from = dates[0];
  let to = dates[0];
  for (const d of dates) {
    if (d < from) from = d;
    if (d > to) to = d;
  }
  return { from, to };
}

/**
 * For many root tournaments, compute earliest/latest played-match updatedAt
 * across the root and its direct children.
 */
export async function getMatchDateRangesByRootId(
  prisma: PrismaClient,
  rootIds: number[],
): Promise<Map<number, MatchDateRange>> {
  const ranges = new Map<number, MatchDateRange>();
  if (rootIds.length === 0) return ranges;

  const children = await prisma.tournament.findMany({
    where: { parentTournamentId: { in: rootIds } },
    select: { id: true, parentTournamentId: true },
  });

  const tournamentToRoot = new Map<number, number>();
  for (const id of rootIds) {
    tournamentToRoot.set(id, id);
  }
  for (const child of children) {
    if (child.parentTournamentId != null) {
      tournamentToRoot.set(child.id, child.parentTournamentId);
    }
  }

  const allTournamentIds = [...tournamentToRoot.keys()];
  const matches = await prisma.match.findMany({
    where: {
      tournamentId: { in: allTournamentIds },
      OR: [
        { player1Sets: { gt: 0 } },
        { player2Sets: { gt: 0 } },
        { player1Forfeit: true },
        { player2Forfeit: true },
      ],
    },
    select: {
      tournamentId: true,
      updatedAt: true,
    },
  });

  for (const match of matches) {
    if (match.tournamentId == null) continue;
    const rootId = tournamentToRoot.get(match.tournamentId);
    if (rootId == null) continue;
    const d = match.updatedAt;
    const existing = ranges.get(rootId);
    if (!existing) {
      ranges.set(rootId, { from: d, to: d });
    } else {
      if (d < existing.from) existing.from = d;
      if (d > existing.to) existing.to = d;
    }
  }

  return ranges;
}

export function rangesOverlap(
  range: MatchDateRange,
  fromBound: Date | null,
  toBound: Date | null,
): boolean {
  if (fromBound && range.to < fromBound) return false;
  if (toBound && range.from > toBound) return false;
  return true;
}
