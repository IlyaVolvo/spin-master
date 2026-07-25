import { ClientHttpError } from '../http/clientHttpError';
import {
  adjustRatingsForSingleMatch,
  createRatingHistoryForRoundRobinTournament,
} from './usattRatingService';
import { tournamentPluginRegistry } from '../plugins/TournamentPluginRegistry';
import { broadcastMembersUpdated } from './playerSocketBroadcast';
import {
  assertMatchParticipantsNoRatingDrift,
  finalPhaseChildHasStarted,
  matchHasResult,
} from '../utils/scoreCorrectionMatchUtils';
import { getCompoundPreliminaryCorrectionBlockReason, getSiblingTournamentIds } from '../plugins/scoreCorrectionHelpers';

export type CorrectionEligibility = {
  allowed: boolean;
  reason?: string;
  correctableMatchIds: number[];
};

function getMatchWinnerId(match: {
  member1Id: number;
  member2Id: number | null;
  player1Sets?: number | null;
  player2Sets?: number | null;
  player1Forfeit?: boolean;
  player2Forfeit?: boolean;
}): number | null {
  if (match.player1Forfeit) return match.member2Id;
  if (match.player2Forfeit) return match.member1Id;
  if ((match.player1Sets ?? 0) > (match.player2Sets ?? 0)) return match.member1Id;
  if ((match.player2Sets ?? 0) > (match.player1Sets ?? 0)) return match.member2Id ?? null;
  return null;
}

export async function getCorrectionEligibility(prisma: any, tournament: any): Promise<CorrectionEligibility> {
  const plugin = tournamentPluginRegistry.get(tournament.type);
  if (plugin.getCorrectionEligibility) {
    return plugin.getCorrectionEligibility({ tournament, prisma });
  }
  return { allowed: false, reason: 'Score correction is not supported for this tournament type', correctableMatchIds: [] };
}

export async function rollbackRoundRobinTournamentRatings(prisma: any, tournamentId: number): Promise<void> {
  const histories = await prisma.ratingHistory.findMany({
    where: {
      tournamentId,
      reason: { in: ['TOURNAMENT_COMPLETED', 'RESULT_CORRECTED'] },
      matchId: null,
    },
    orderBy: { id: 'desc' },
  });

  for (const history of histories) {
    if (history.ratingChange == null) continue;
    const member = await prisma.member.findUnique({ where: { id: history.memberId } });
    if (!member || member.rating == null) continue;
    await prisma.member.update({
      where: { id: history.memberId },
      data: { rating: member.rating - history.ratingChange },
    });
  }

  await prisma.ratingHistory.deleteMany({
    where: {
      tournamentId,
      reason: { in: ['TOURNAMENT_COMPLETED', 'RESULT_CORRECTED'] },
      matchId: null,
    },
  });
}

export async function rollbackTournamentPerMatchRatings(prisma: any, tournamentId: number): Promise<void> {
  const histories = await prisma.ratingHistory.findMany({
    where: {
      tournamentId,
      reason: { in: ['MATCH_COMPLETED', 'RESULT_CORRECTED'] },
    },
    orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
  });

  for (const history of histories) {
    if (history.ratingChange == null) continue;
    const member = await prisma.member.findUnique({ where: { id: history.memberId } });
    if (!member || member.rating == null) continue;
    await prisma.member.update({
      where: { id: history.memberId },
      data: { rating: member.rating - history.ratingChange },
    });
  }

  await prisma.ratingHistory.deleteMany({
    where: {
      tournamentId,
      reason: { in: ['MATCH_COMPLETED', 'RESULT_CORRECTED'] },
    },
  });
}

async function replayPerMatchTournamentRatings(
  prisma: any,
  tournament: any,
): Promise<void> {
  const ratingReason = 'RESULT_CORRECTED' as const;
  const playedMatches = (tournament.matches ?? [])
    .filter((m: any) => matchHasResult(m) && m.member2Id && m.member2Id !== 0)
    .filter((m: any) => !m.player1Forfeit && !m.player2Forfeit)
    .sort((a: any, b: any) => (a.id ?? 0) - (b.id ?? 0));

  const useCurrentMemberRatings = Boolean(
    tournamentPluginRegistry.get(tournament.type).scoreCorrectionUsesCurrentMemberRatings,
  );
  const completionTime = tournament.recordedAt ?? tournament.createdAt;

  for (const match of playedMatches) {
    const winnerId = getMatchWinnerId(match);
    if (!winnerId) continue;
    await adjustRatingsForSingleMatch(
      match.member1Id,
      match.member2Id!,
      winnerId === match.member1Id,
      tournament.id,
      match.id,
      {
        useCurrentMemberRatings,
        timestamp: completionTime,
        ratingReason,
      },
    );
  }

  await broadcastMembersUpdated(
    prisma,
    (tournament.participants ?? []).map((p: any) => p.memberId),
  );
}

export async function deleteUnplayedFinalChildIfNeeded(prisma: any, preliminaryChildId: number): Promise<number | null> {
  const child = await prisma.tournament.findUnique({
    where: { id: preliminaryChildId },
    select: { parentTournamentId: true, groupNumber: true, type: true },
  });
  if (!child?.parentTournamentId) return null;

  const parent = await prisma.tournament.findUnique({
    where: { id: child.parentTournamentId },
    select: { id: true, type: true, status: true },
  });
  if (!parent) return null;

  const parentPlugin = tournamentPluginRegistry.get(parent.type);
  if (!parentPlugin.isPreliminaryGroupChild?.(child)) return null;

  const siblings = await prisma.tournament.findMany({
    where: { parentTournamentId: parent.id },
    include: { matches: true, bracketMatches: true },
  });

  const finalChild = siblings.find((c: any) => parentPlugin.isFinalPhaseChild?.(c));

  const checkBracket = finalChild
    ? Boolean(tournamentPluginRegistry.get(finalChild.type).checksBracketMatchesForStarted)
    : false;
  if (!finalChild || await finalPhaseChildHasStarted(prisma, finalChild, checkBracket)) return parent.id;

  await prisma.tournament.delete({ where: { id: finalChild.id } });

  if (parent.status === 'COMPLETED') {
    await prisma.tournament.update({
      where: { id: parent.id },
      data: { status: 'ACTIVE' },
    });
  }

  return parent.id;
}

export async function correctCompletedMatchScore(
  prisma: any,
  params: {
    tournamentId: number;
    matchId: number;
    player1Sets: number;
    player2Sets: number;
    player1Forfeit: boolean;
    player2Forfeit: boolean;
    expectedMatchUpdatedAt?: string;
  },
): Promise<{ match: any; parentTournamentId: number | null }> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: params.tournamentId },
    include: {
      participants: { include: { member: true } },
      matches: true,
      swissData: true,
      bracketMatches: { include: { match: true } },
      childTournaments: { include: { matches: true } },
    },
  });

  if (!tournament) {
    throw new ClientHttpError('Tournament not found', 404);
  }

  const match = await prisma.match.findFirst({
    where: { id: params.matchId, tournamentId: params.tournamentId },
  });
  if (!match) {
    throw new ClientHttpError('Match not found', 404);
  }

  const ignoreTournamentIds = await getSiblingTournamentIds(prisma, tournament);
  await assertMatchParticipantsNoRatingDrift(prisma, tournament, match, ignoreTournamentIds);

  const compoundBlock = await getCompoundPreliminaryCorrectionBlockReason(prisma, tournament);
  if (compoundBlock) {
    throw new ClientHttpError(compoundBlock, 400);
  }

  const plugin = tournamentPluginRegistry.get(tournament.type);
  if (!plugin.assertMatchCorrectable) {
    throw new ClientHttpError('Score correction is not supported for this tournament type', 400);
  }

  if (params.expectedMatchUpdatedAt) {
    const expected = new Date(params.expectedMatchUpdatedAt);
    if (Number.isNaN(expected.getTime()) || match.updatedAt.getTime() !== expected.getTime()) {
      throw new ClientHttpError('Match was updated by another user. Refresh and try again.', 409);
    }
  }

  await plugin.assertMatchCorrectable({ tournament, match, prisma });

  const ratingReason = 'RESULT_CORRECTED' as const;

  if (plugin.scoreCorrectionUsesBatchTournamentRatings) {
    await rollbackRoundRobinTournamentRatings(prisma, params.tournamentId);
    const updatedMatch = await prisma.match.update({
      where: { id: params.matchId },
      data: {
        player1Sets: params.player1Sets,
        player2Sets: params.player2Sets,
        player1Forfeit: params.player1Forfeit,
        player2Forfeit: params.player2Forfeit,
      },
    });
    await createRatingHistoryForRoundRobinTournament(params.tournamentId, { ratingReason });
    const parentId = await deleteUnplayedFinalChildIfNeeded(prisma, params.tournamentId);
    if (parentId) {
      await triggerParentFinalPhaseRecreate(prisma, parentId);
    }
    return { match: updatedMatch, parentTournamentId: parentId };
  }

  await rollbackTournamentPerMatchRatings(prisma, params.tournamentId);
  const updatedMatch = await prisma.match.update({
    where: { id: params.matchId },
    data: {
      player1Sets: params.player1Sets,
      player2Sets: params.player2Sets,
      player1Forfeit: params.player1Forfeit,
      player2Forfeit: params.player2Forfeit,
    },
  });

  const refreshedTournament = await prisma.tournament.findUnique({
    where: { id: params.tournamentId },
    include: {
      participants: { include: { member: true } },
      matches: true,
    },
  });

  await replayPerMatchTournamentRatings(prisma, refreshedTournament);

  const parentId = await deleteUnplayedFinalChildIfNeeded(prisma, params.tournamentId);
  if (parentId) {
    await triggerParentFinalPhaseRecreate(prisma, parentId);
  }

  return { match: updatedMatch, parentTournamentId: parentId };
}

async function triggerParentFinalPhaseRecreate(prisma: any, parentTournamentId: number): Promise<void> {
  const parentTournament = await prisma.tournament.findUnique({
    where: { id: parentTournamentId },
    include: {
      participants: { include: { member: true } },
      preliminaryConfig: true,
      childTournaments: {
        include: {
          participants: { include: { member: true } },
          matches: true,
        },
      },
    },
  });
  if (!parentTournament) return;

  const parentPlugin = tournamentPluginRegistry.get(parentTournament.type);
  if (!parentPlugin.onChildTournamentCompleted) return;

  const completedChild = parentTournament.childTournaments.find((c: any) => c.status === 'COMPLETED');
  if (!completedChild) return;

  await parentPlugin.onChildTournamentCompleted({
    parentTournament,
    childTournament: completedChild,
    prisma,
  });
}

export { assertNoRatingDriftAfterTournament } from '../utils/scoreCorrectionMatchUtils';

/** Attach cached correction eligibility on every tournament fetch (active + completed). */
export async function attachCorrectionEligibility(tournament: any, prisma: any): Promise<any> {
  const enriched = { ...tournament };
  enriched.correctionEligibility = await getCorrectionEligibility(prisma, enriched);
  if (Array.isArray(enriched.childTournaments)) {
    enriched.childTournaments = await Promise.all(
      enriched.childTournaments.map((child: any) => attachCorrectionEligibility(child, prisma)),
    );
  }
  return enriched;
}

/** Full plugin enrichment + correction eligibility for API responses (GET /:id, complete, etc.). */
export async function enrichTournamentForApi(prisma: any, tournament: any): Promise<any> {
  const plugin = tournamentPluginRegistry.get(tournament.type);
  let enriched: any;

  if (tournament.status === 'COMPLETED') {
    const postRatingMap = new Map<string, number | null>();
    const { getPostTournamentRating } = await import('./usattRatingService');
    await Promise.all(
      (tournament.participants ?? []).map(async (p: { memberId: number }) => {
        const key = `${tournament.id}-${p.memberId}`;
        const rating = await getPostTournamentRating(tournament.id, p.memberId);
        postRatingMap.set(key, rating ?? null);
      }),
    );
    enriched = await plugin.enrichCompletedTournament({ tournament, postRatingMap, prisma });
  } else {
    enriched = await plugin.enrichActiveTournament({ tournament, prisma });
  }

  return attachCorrectionEligibility(enriched, prisma);
}
