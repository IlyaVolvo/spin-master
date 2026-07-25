import { ClientHttpError } from '../http/clientHttpError';

type RatingWatermark = { timestamp: Date; id: number };

export function matchHasResult(match: {
  player1Sets?: number | null;
  player2Sets?: number | null;
  player1Forfeit?: boolean;
  player2Forfeit?: boolean;
}): boolean {
  const hasScore = (match.player1Sets ?? 0) > 0 || (match.player2Sets ?? 0) > 0;
  const hasForfeit = Boolean(match.player1Forfeit || match.player2Forfeit);
  return hasScore || hasForfeit;
}

export function childHasPlayedMatches(child: { matches?: any[] }): boolean {
  return (child.matches ?? []).some((m: any) => matchHasResult(m));
}

export async function finalPhaseChildHasStarted(
  prisma: any,
  finalChild: any,
  checkBracketMatches = false,
): Promise<boolean> {
  if (!finalChild) return false;
  if (childHasPlayedMatches(finalChild)) return true;
  if (!checkBracketMatches) return false;

  const playedBracketMatch = await prisma.bracketMatch.findFirst({
    where: {
      tournamentId: finalChild.id,
      matchId: { not: null },
    },
    include: { match: true },
  });
  return Boolean(playedBracketMatch?.match && matchHasResult(playedBracketMatch.match));
}

export type RatingDriftOptions = {
  ignoreTournamentIds?: number[];
  memberIds?: number[];
};

async function getTournamentRatingWatermark(prisma: any, tournamentId: number, fallbackTime: Date): Promise<RatingWatermark> {
  const row = await prisma.ratingHistory.findFirst({
    where: {
      tournamentId,
      reason: { in: ['TOURNAMENT_COMPLETED', 'MATCH_COMPLETED', 'RESULT_CORRECTED'] },
    },
    orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
    select: { timestamp: true, id: true },
  });
  return row ? { timestamp: row.timestamp, id: row.id } : { timestamp: fallbackTime, id: 0 };
}

async function memberDisplayName(prisma: any, tournament: any, memberId: number): Promise<string> {
  const participant = (tournament.participants ?? []).find((p: any) => p.memberId === memberId);
  if (participant?.member?.firstName) {
    const { firstName, lastName } = participant.member;
    return [firstName, lastName].filter(Boolean).join(' ');
  }
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { firstName: true, lastName: true },
  });
  if (member?.firstName) {
    return [member.firstName, member.lastName].filter(Boolean).join(' ');
  }
  return `Player #${memberId}`;
}

export async function findMemberRatingDriftReason(
  prisma: any,
  tournament: any,
  memberId: number,
  options?: RatingDriftOptions,
): Promise<string | null> {
  const completionTime = tournament.recordedAt ?? tournament.createdAt;
  const watermark = await getTournamentRatingWatermark(prisma, tournament.id, completionTime);

  const laterRow = await prisma.ratingHistory.findFirst({
    where: {
      memberId,
      ...(options?.ignoreTournamentIds?.length
        ? { tournamentId: { notIn: options.ignoreTournamentIds } }
        : {}),
      OR: [
        { timestamp: { gt: watermark.timestamp } },
        { timestamp: watermark.timestamp, id: { gt: watermark.id } },
      ],
    },
    orderBy: [{ timestamp: 'asc' }, { id: 'asc' }],
  });

  if (!laterRow) return null;

  const playerName = await memberDisplayName(prisma, tournament, memberId);
  if (laterRow.reason === 'MANUAL_ADJUSTMENT') {
    return `${playerName}'s rating was manually adjusted after this tournament`;
  }
  let eventLabel = 'another rating event';
  if (laterRow.tournamentId) {
    const laterTournament = await prisma.tournament.findUnique({
      where: { id: laterRow.tournamentId },
      select: { name: true },
    });
    if (laterTournament?.name) {
      eventLabel = `event "${laterTournament.name}"`;
    }
  }
  return `${playerName}'s rating changed after completion (${eventLabel})`;
}

export async function findRatingDriftReason(
  prisma: any,
  tournament: any,
  options?: RatingDriftOptions,
): Promise<string | null> {
  if (tournament.cancelled) {
    return 'Cancelled tournaments cannot be corrected';
  }
  if (tournament.status !== 'COMPLETED') {
    return 'Only completed tournaments can be corrected';
  }

  const completionTime = tournament.recordedAt ?? tournament.createdAt;
  const participantIds: number[] = options?.memberIds
    ?? (tournament.participants ?? []).map((p: any) => p.memberId);
  if (participantIds.length === 0) {
    return 'Tournament has no participants';
  }

  for (const memberId of participantIds) {
    const memberReason = await findMemberRatingDriftReason(prisma, tournament, memberId, options);
    if (memberReason) return memberReason;
  }

  return null;
}

export async function assertMatchParticipantsNoRatingDrift(
  prisma: any,
  tournament: any,
  match: { member1Id: number; member2Id?: number | null },
  ignoreTournamentIds: number[] = [],
): Promise<void> {
  const memberIds = [match.member1Id, match.member2Id].filter(
    (id): id is number => typeof id === 'number' && id !== 0,
  );
  const reason = await findRatingDriftReason(prisma, tournament, {
    memberIds,
    ignoreTournamentIds,
  });
  if (reason) {
    throw new ClientHttpError(reason, 400);
  }
}

export async function assertNoRatingDriftAfterTournament(prisma: any, tournamentId: number): Promise<void> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { participants: true },
  });
  if (!tournament) {
    throw new ClientHttpError('Tournament not found', 404);
  }
  const reason = await findRatingDriftReason(prisma, tournament);
  if (reason) {
    throw new ClientHttpError(reason, 400);
  }
}
