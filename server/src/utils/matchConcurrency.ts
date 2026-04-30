import { ClientHttpError } from '../http/clientHttpError';

export const MATCH_RESULT_ALREADY_ENTERED_MESSAGE =
  'A result for this match has already been entered. Refresh the tournament to see the recorded score.';

type MatchResultMember = { firstName?: string | null; lastName?: string | null; id: number };

function memberName(member: MatchResultMember | undefined): string {
  if (!member) return 'Unknown player';
  return `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim() || `Player ${member.id}`;
}

function formatRecordedResult(match: {
  member1Id: number;
  member2Id: number | null;
  player1Sets: number;
  player2Sets: number;
  player1Forfeit?: boolean | null;
  player2Forfeit?: boolean | null;
}, membersById: Map<number, MatchResultMember>): string {
  const player1Name = memberName(membersById.get(match.member1Id));
  const player2Name = match.member2Id ? memberName(membersById.get(match.member2Id)) : 'BYE';
  const forfeitSuffix = match.player1Forfeit
    ? ` (${player1Name} forfeited)`
    : match.player2Forfeit
      ? ` (${player2Name} forfeited)`
      : '';

  return `${player1Name} ${match.player1Sets}-${match.player2Sets} ${player2Name}${forfeitSuffix}`;
}

export function isDuplicateTournamentMatchError(error: unknown): boolean {
  const prismaError = error as { code?: unknown; meta?: { target?: unknown } } | null | undefined;
  if (prismaError?.code === 'P2002') {
    const target = prismaError.meta?.target;
    if (Array.isArray(target)) {
      return target.includes('tournamentId') && target.includes('member1Id') && target.includes('member2Id');
    }
    if (typeof target === 'string') {
      return target === 'matches_tournament_pair_unique' || (
        target.includes('tournamentId') &&
        target.includes('member1Id') &&
        target.includes('member2Id')
      );
    }
  }

  const message = error instanceof Error ? error.message : String(error ?? '');
  return (
    message.includes('Unique constraint failed') &&
    message.includes('tournamentId') &&
    message.includes('member1Id') &&
    message.includes('member2Id')
  );
}

export function duplicateTournamentMatchError(): ClientHttpError {
  return new ClientHttpError(MATCH_RESULT_ALREADY_ENTERED_MESSAGE, 409);
}

export async function duplicateTournamentMatchErrorForMatch(prisma: any, match: {
  member1Id: number;
  member2Id: number | null;
  player1Sets: number;
  player2Sets: number;
  player1Forfeit?: boolean | null;
  player2Forfeit?: boolean | null;
}): Promise<ClientHttpError> {
  if (!match.member2Id) {
    return duplicateTournamentMatchError();
  }

  const members = await prisma.member.findMany({
    where: { id: { in: [match.member1Id, match.member2Id].filter(Boolean) } },
    select: { id: true, firstName: true, lastName: true },
  });
  const membersById = new Map<number, MatchResultMember>(
    members.map((member: MatchResultMember) => [member.id, member])
  );
  const recordedResult = formatRecordedResult(match, membersById);

  return new ClientHttpError(
    `A result for this match has already been entered: ${recordedResult}. Refresh the tournament to see the recorded score.`,
    409
  );
}

export async function duplicateTournamentMatchErrorWithRecordedResult(
  prisma: any,
  tournamentId: number,
  member1Id: number,
  member2Id: number | null | undefined
): Promise<ClientHttpError> {
  if (!member2Id) {
    return duplicateTournamentMatchError();
  }

  const existingMatch = await prisma.match.findFirst({
    where: {
      tournamentId,
      OR: [
        { member1Id, member2Id },
        { member1Id: member2Id, member2Id: member1Id },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!existingMatch) {
    return duplicateTournamentMatchError();
  }

  return duplicateTournamentMatchErrorForMatch(prisma, existingMatch);
}
