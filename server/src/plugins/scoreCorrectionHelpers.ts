import { CorrectionEligibility } from './TournamentPlugin';
import {
  finalPhaseChildHasStarted,
  findMemberRatingDriftReason,
  findRatingDriftReason,
  matchHasResult,
} from '../utils/scoreCorrectionMatchUtils';

export function blockedCorrectionEligibility(reason: string): CorrectionEligibility {
  return { allowed: false, reason, correctableMatchIds: [] };
}

/** Active tournaments: highlight scored matches for Ctrl+click modification (regular match PATCH). */
export function buildActiveModificationEligibility(matchIds: number[]): CorrectionEligibility {
  if (matchIds.length === 0) {
    return { allowed: false, reason: 'No scored matches to modify', correctableMatchIds: [] };
  }
  return { allowed: true, correctableMatchIds: matchIds };
}

/** Completed-tournament correction only — used by assertMatchCorrectable, not eligibility listing. */
export function getCompletedCorrectionBlockReason(tournament: any): string | null {
  if (tournament.cancelled) {
    return 'Tournament was cancelled';
  }
  if (tournament.status !== 'COMPLETED') {
    return 'Tournament is not eligible for score correction';
  }
  return null;
}

export async function getSiblingTournamentIds(prisma: any, tournament: any): Promise<number[]> {
  if (!tournament.parentTournamentId) return [];
  const siblings = await prisma.tournament.findMany({
    where: {
      parentTournamentId: tournament.parentTournamentId,
      NOT: { id: tournament.id },
    },
    select: { id: true },
  });
  return siblings.map((row: { id: number }) => row.id);
}

export async function filterCorrectableMatchIdsByMemberDrift(
  prisma: any,
  tournament: any,
  matchIds: number[],
  ignoreTournamentIds: number[] = [],
): Promise<number[]> {
  const eligible: number[] = [];
  for (const matchId of matchIds) {
    const match = (tournament.matches ?? []).find((row: any) => row.id === matchId);
    if (!match?.member2Id) continue;

    const memberIds = [match.member1Id, match.member2Id].filter(
      (id: number | null | undefined) => typeof id === 'number' && id !== 0,
    );
    let blocked = false;
    for (const memberId of memberIds) {
      const drift = await findMemberRatingDriftReason(prisma, tournament, memberId, {
        ignoreTournamentIds,
      });
      if (drift) {
        blocked = true;
        break;
      }
    }
    if (!blocked) eligible.push(matchId);
  }
  return eligible;
}

export async function buildBasicCorrectionEligibility(
  prisma: any,
  tournament: any,
  correctableMatchIds: number[],
): Promise<CorrectionEligibility> {
  const driftReason = await findRatingDriftReason(prisma, tournament);
  if (driftReason) {
    return { allowed: false, reason: driftReason, correctableMatchIds: [] };
  }
  if (correctableMatchIds.length === 0) {
    return { allowed: false, reason: 'No correctable matches in this tournament', correctableMatchIds: [] };
  }
  return { allowed: true, correctableMatchIds };
}

export function scoredMatchIds(tournament: any): number[] {
  return (tournament.matches ?? [])
    .filter((m: any) => matchHasResult(m))
    .map((m: any) => m.id);
}

/** Blocks preliminary RR correction in compound events once the final phase has started. */
export async function getCompoundPreliminaryCorrectionBlockReason(
  prisma: any,
  tournament: any,
): Promise<string | null> {
  if (!tournament.parentTournamentId) return null;

  const { tournamentPluginRegistry } = await import('./TournamentPluginRegistry');

  const parent = await prisma.tournament.findUnique({
    where: { id: tournament.parentTournamentId },
    select: { type: true },
  });
  if (!parent) return null;

  const parentPlugin = tournamentPluginRegistry.get(parent.type);
  if (!parentPlugin.isPreliminaryGroupChild?.(tournament)) return null;

  const siblings = await prisma.tournament.findMany({
    where: { parentTournamentId: tournament.parentTournamentId },
    include: { matches: true },
  });

  const finalChild = siblings.find((c: any) => parentPlugin.isFinalPhaseChild?.(c));
  if (!finalChild) return null;

  const childPlugin = tournamentPluginRegistry.get(finalChild.type);
  if (await finalPhaseChildHasStarted(
    prisma,
    finalChild,
    Boolean(childPlugin.checksBracketMatchesForStarted),
  )) {
    return 'The final phase has already started';
  }

  return null;
}
