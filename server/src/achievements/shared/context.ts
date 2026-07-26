import type {
  AchievementContext,
  AchievementMatchRow,
  AchievementParticipantRow,
  AchievementPublicMember,
  AchievementRatingHistoryRow,
  AchievementScope,
  AchievementTournamentMeta,
} from '../types';
import { sanitizeAchievementMember } from './ranking';
import { isTimestampInScope } from './scope';

export const PUBLIC_ELIGIBLE_WHERE = {
  status: 'COMPLETED' as const,
  cancelled: false,
  parentTournamentId: null,
};

const RATING_REASONS = ['TOURNAMENT_COMPLETED', 'MATCH_COMPLETED', 'RESULT_CORRECTED'] as const;

async function collectDescendantIds(prisma: any, rootId: number): Promise<number[]> {
  const ids = [rootId];
  let frontier = [rootId];
  while (frontier.length > 0) {
    const children = await prisma.tournament.findMany({
      where: { parentTournamentId: { in: frontier } },
      select: { id: true },
    });
    frontier = children.map((c: { id: number }) => c.id);
    ids.push(...frontier);
  }
  return ids;
}

function mapMember(raw: any): AchievementPublicMember | null {
  return sanitizeAchievementMember(raw);
}

export async function buildAchievementContext(
  prisma: any,
  scope: AchievementScope,
): Promise<AchievementContext | { error: string; status: number }> {
  let rootTournamentIds: number[] = [];
  let tournamentIdsInTree: number[] = [];

  if (scope.type === 'tournament') {
    const root = await prisma.tournament.findFirst({
      where: { id: scope.tournamentId, ...PUBLIC_ELIGIBLE_WHERE },
      select: {
        id: true,
        name: true,
        type: true,
        parentTournamentId: true,
        groupNumber: true,
        status: true,
      },
    });
    if (!root) {
      return { error: 'Achievements not available', status: 404 };
    }
    rootTournamentIds = [root.id];
    tournamentIdsInTree = await collectDescendantIds(prisma, root.id);
  } else {
    const roots = await prisma.tournament.findMany({
      where: PUBLIC_ELIGIBLE_WHERE,
      select: {
        id: true,
        name: true,
        type: true,
        parentTournamentId: true,
        groupNumber: true,
        status: true,
      },
      orderBy: { id: 'desc' },
    });
    rootTournamentIds = roots.map((r: { id: number }) => r.id);
    const trees = await Promise.all(roots.map((r: { id: number }) => collectDescendantIds(prisma, r.id)));
    tournamentIdsInTree = Array.from(new Set(trees.flat()));
  }

  if (tournamentIdsInTree.length === 0) {
    return {
      scope,
      prisma,
      matches: [],
      participants: [],
      ratingHistory: [],
      tournamentsById: new Map(),
      rootTournamentIds: [],
      membersById: new Map(),
    };
  }

  const tournaments = await prisma.tournament.findMany({
    where: { id: { in: tournamentIdsInTree } },
    select: {
      id: true,
      name: true,
      type: true,
      parentTournamentId: true,
      groupNumber: true,
      status: true,
    },
  });

  const tournamentsById = new Map<number, AchievementTournamentMeta>();
  const childToRoot = new Map<number, number>();
  for (const rootId of rootTournamentIds) {
    childToRoot.set(rootId, rootId);
  }
  // Resolve root for each node via parent chain
  for (const t of tournaments) {
    tournamentsById.set(t.id, t);
  }
  for (const t of tournaments) {
    let cur: typeof t | undefined = t;
    const seen = new Set<number>();
    while (cur && cur.parentTournamentId != null && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = tournamentsById.get(cur.parentTournamentId);
    }
    const rootId = cur && cur.parentTournamentId == null ? cur.id : t.id;
    if (rootTournamentIds.includes(rootId)) {
      childToRoot.set(t.id, rootId);
    }
  }

  const matchesRaw = await prisma.match.findMany({
    where: {
      tournamentId: { in: tournamentIdsInTree },
    },
  });

  const matches: AchievementMatchRow[] = matchesRaw
    .map((m: any) => ({
      id: m.id,
      tournamentId: m.tournamentId,
      rootTournamentId: m.tournamentId != null ? childToRoot.get(m.tournamentId) ?? null : null,
      member1Id: m.member1Id,
      member2Id: m.member2Id,
      player1Sets: m.player1Sets ?? 0,
      player2Sets: m.player2Sets ?? 0,
      player1Forfeit: Boolean(m.player1Forfeit),
      player2Forfeit: Boolean(m.player2Forfeit),
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    }))
    .filter((m: AchievementMatchRow) => isTimestampInScope(m.updatedAt, scope));

  const participantsRaw = await prisma.tournamentParticipant.findMany({
    where: { tournamentId: { in: tournamentIdsInTree } },
    include: { member: true },
  });

  const participants: AchievementParticipantRow[] = [];
  const membersById = new Map<number, AchievementPublicMember>();
  for (const p of participantsRaw) {
    const member = mapMember(p.member);
    if (!member) continue;
    membersById.set(member.id, member);
    participants.push({
      tournamentId: p.tournamentId,
      rootTournamentId: childToRoot.get(p.tournamentId) ?? p.tournamentId,
      memberId: p.memberId,
      playerRatingAtTime: p.playerRatingAtTime,
      member,
    });
  }

  const matchIds = matchesRaw.map((m: { id: number }) => m.id);
  const historyOr: any[] = [{ tournamentId: { in: tournamentIdsInTree } }];
  if (matchIds.length > 0) {
    historyOr.push({ matchId: { in: matchIds } });
  }

  const historyWhere: any = {
    reason: { in: [...RATING_REASONS] },
    OR: historyOr,
  };
  if (scope.type === 'period') {
    if (scope.from || scope.to) {
      historyWhere.timestamp = {};
      if (scope.from) historyWhere.timestamp.gte = scope.from;
      if (scope.to) historyWhere.timestamp.lte = scope.to;
    }
  } else {
    historyWhere.tournamentId = { in: tournamentIdsInTree };
    delete historyWhere.OR;
  }

  const ratingHistoryRaw =
    tournamentIdsInTree.length > 0
      ? await prisma.ratingHistory.findMany({
          where: historyWhere,
          orderBy: [{ timestamp: 'asc' }, { id: 'asc' }],
        })
      : [];

  const ratingHistory: AchievementRatingHistoryRow[] = ratingHistoryRaw.map((h: any) => ({
    id: h.id,
    memberId: h.memberId,
    rating: h.rating,
    ratingChange: h.ratingChange,
    timestamp: h.timestamp,
    reason: h.reason,
    tournamentId: h.tournamentId,
    matchId: h.matchId,
  }));

  // Ensure members referenced only via history are loaded
  const missingMemberIds = ratingHistory
    .map((h) => h.memberId)
    .filter((id) => !membersById.has(id));
  if (missingMemberIds.length > 0) {
    const extra = await prisma.member.findMany({
      where: { id: { in: Array.from(new Set(missingMemberIds)) } },
      select: { id: true, firstName: true, lastName: true, rating: true },
    });
    for (const m of extra) {
      const sanitized = mapMember(m);
      if (sanitized) membersById.set(sanitized.id, sanitized);
    }
  }

  return {
    scope,
    prisma,
    matches,
    participants,
    ratingHistory,
    tournamentsById,
    rootTournamentIds,
    membersById,
  };
}
