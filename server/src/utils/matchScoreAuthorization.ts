import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import type { AuthRequest } from '../middleware/auth';
import { isOrganizer } from './organizerAccess';

export type MatchAuthFailure = { ok: false; status: number; error: string };
export type MatchAuthSuccess = { ok: true };
export type MatchAuthResult = MatchAuthSuccess | MatchAuthFailure;

/**
 * Resolve the two sides of a tournament score write for authorization.
 * Order matches PlayoffPlugin: BracketMatch in this tournament first, then Match row.
 */
export async function resolveTournamentMatchPlayers(
  prisma: PrismaClient,
  tournamentId: number,
  matchId: number,
  bodyMember1Id?: number | null,
  bodyMember2Id?: number | null
): Promise<
  | { ok: true; member1Id: number; member2Id: number | null }
  | MatchAuthFailure
> {
  if (matchId === 0) {
    const m1 = bodyMember1Id;
    const m2 = bodyMember2Id;
    if (m1 == null || m2 == null || typeof m1 !== 'number' || typeof m2 !== 'number') {
      return { ok: false, status: 400, error: 'member1Id and member2Id are required for new match' };
    }
    if (m1 < 1 || m2 < 1) {
      return { ok: false, status: 400, error: 'Invalid member ids' };
    }
    return { ok: true, member1Id: m1, member2Id: m2 };
  }

  const bracketMatch = await prisma.bracketMatch.findFirst({
    where: { id: matchId, tournamentId },
    include: { match: true },
  });

  if (bracketMatch) {
    if (bracketMatch.match) {
      return {
        ok: true,
        member1Id: bracketMatch.match.member1Id,
        member2Id: bracketMatch.match.member2Id,
      };
    }
    const a = bracketMatch.member1Id;
    const b = bracketMatch.member2Id;
    if (a == null || a === 0 || b == null || b === 0) {
      return {
        ok: false,
        status: 400,
        error: 'Both players must be assigned before recording a result',
      };
    }
    return { ok: true, member1Id: a, member2Id: b };
  }

  const match = await prisma.match.findFirst({
    where: { id: matchId, tournamentId },
  });

  if (!match) {
    return { ok: false, status: 404, error: 'Match not found' };
  }

  return { ok: true, member1Id: match.member1Id, member2Id: match.member2Id };
}

/** Input for {@link authorizeTournamentScoreEntryRequest}. */
export type TournamentScoreEntryAuthInput = {
  tournamentId: number;
  /** Use `0` with body member ids for a new match row. */
  matchId: number;
  bodyMember1Id?: number | null;
  bodyMember2Id?: number | null;
  opponentPassword?: unknown;
};

/**
 * Single entry point for tournament score writes: organizer check, resolve players
 * (bracket vs match id), then password / participant rules.
 */
export async function authorizeTournamentScoreEntryRequest(
  prisma: PrismaClient,
  req: AuthRequest,
  input: TournamentScoreEntryAuthInput
): Promise<MatchAuthResult> {
  const hasOrganizerAccess = await isOrganizer(req);
  const currentMemberId = req.memberId ?? req.member?.id;
  const resolvedPlayers = await resolveTournamentMatchPlayers(
    prisma,
    input.tournamentId,
    input.matchId,
    input.bodyMember1Id,
    input.bodyMember2Id
  );
  if (!resolvedPlayers.ok) {
    return { ok: false, status: resolvedPlayers.status, error: resolvedPlayers.error };
  }
  const pwd = typeof input.opponentPassword === 'string' ? input.opponentPassword : '';
  return authorizeTournamentMatchScoreWrite(prisma, {
    actorMemberId: currentMemberId,
    isOrganizer: hasOrganizerAccess,
    opponentPassword: pwd,
    member1Id: resolvedPlayers.member1Id,
    member2Id: resolvedPlayers.member2Id,
  });
}

/**
 * Organizers may always submit. Otherwise the actor must be a player in the match and
 * (for two-player matches) must supply the opponent's password — same rules as standalone match create.
 */
export async function authorizeTournamentMatchScoreWrite(
  prisma: PrismaClient,
  input: {
    actorMemberId: number | undefined;
    isOrganizer: boolean;
    opponentPassword?: string | null;
    member1Id: number;
    member2Id: number | null;
  }
): Promise<MatchAuthResult> {
  if (input.isOrganizer) {
    return { ok: true };
  }

  const me = input.actorMemberId;
  if (!me) {
    return { ok: false, status: 401, error: 'Authentication required' };
  }

  const m1 = input.member1Id;
  const m2 = input.member2Id;

  const bye = m2 == null || m2 === 0;
  if (bye) {
    if (me === m1) {
      return { ok: true };
    }
    return { ok: false, status: 403, error: 'Only the active player can record this match result' };
  }

  if (me !== m1 && me !== m2) {
    return { ok: false, status: 403, error: 'You can only record scores for matches you played in' };
  }

  const opponentId = me === m1 ? m2 : m1;
  const pwd = input.opponentPassword?.trim();
  if (!pwd) {
    return { ok: false, status: 400, error: 'Opponent password confirmation required' };
  }

  const opponent = await prisma.member.findUnique({
    where: { id: opponentId },
    select: { password: true, isActive: true },
  });

  if (!opponent || !opponent.isActive) {
    return { ok: false, status: 404, error: 'Opponent not found or inactive' };
  }

  const valid = await bcrypt.compare(pwd, opponent.password);
  if (!valid) {
    return { ok: false, status: 401, error: 'Invalid opponent password' };
  }

  return { ok: true };
}
