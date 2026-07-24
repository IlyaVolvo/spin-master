import type { PrismaClient } from '@prisma/client';
import type { AuthRequest } from '../middleware/auth';
import { isKioskMode } from './kioskMode';
import { isOrganizer } from './organizerAccess';
import { normalizeScorePin, scorePinsEqual } from './scorePin';

export type InvalidScorePins = { member1: boolean; member2: boolean };

export type MatchAuthFailure = {
  ok: false;
  status: number;
  error: string;
  invalidPins?: InvalidScorePins;
};
export type MatchAuthSuccess = { ok: true };
export type MatchAuthResult = MatchAuthSuccess | MatchAuthFailure;

/** JSON body for a failed match-auth check (includes which PINs failed when present). */
export function matchAuthFailureJson(failure: MatchAuthFailure): {
  error: string;
  invalidPins?: InvalidScorePins;
} {
  return failure.invalidPins
    ? { error: failure.error, invalidPins: failure.invalidPins }
    : { error: failure.error };
}

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
  member1Pin?: unknown;
  member2Pin?: unknown;
  player1Forfeit?: boolean;
  player2Forfeit?: boolean;
};

/**
 * Single entry point for tournament score writes: organizer check, resolve players
 * (bracket vs match id), then kiosk PIN / participant rules.
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
  return authorizeTournamentMatchScoreWrite(prisma, {
    actorMemberId: currentMemberId,
    isOrganizer: hasOrganizerAccess,
    isKioskMode: isKioskMode(req),
    member1Pin: input.member1Pin,
    member2Pin: input.member2Pin,
    member1Id: resolvedPlayers.member1Id,
    member2Id: resolvedPlayers.member2Id,
    player1Forfeit: input.player1Forfeit === true,
    player2Forfeit: input.player2Forfeit === true,
  });
}

async function verifyParticipantPins(
  prisma: PrismaClient,
  member1Id: number,
  member2Id: number | null,
  member1Pin: unknown,
  member2Pin: unknown
): Promise<MatchAuthResult> {
  const bye = member2Id == null || member2Id === 0;
  if (bye) {
    const pin = normalizeScorePin(member1Pin);
    if (!pin) {
      return { ok: false, status: 400, error: 'Player PIN confirmation required' };
    }
    const player = await prisma.member.findUnique({
      where: { id: member1Id },
      select: { scorePin: true, isActive: true },
    });
    if (!player || !player.isActive) {
      return { ok: false, status: 404, error: 'Player not found or inactive' };
    }
    if (!scorePinsEqual(pin, player.scorePin)) {
      return {
        ok: false,
        status: 401,
        error: 'Incorrect PIN — please re-enter',
        invalidPins: { member1: true, member2: false },
      };
    }
    return { ok: true };
  }

  const pin1 = normalizeScorePin(member1Pin);
  const pin2 = normalizeScorePin(member2Pin);
  if (!pin1 || !pin2) {
    return { ok: false, status: 400, error: 'Both participants must confirm with their PINs' };
  }

  const [player1, player2] = await Promise.all([
    prisma.member.findUnique({
      where: { id: member1Id },
      select: { scorePin: true, isActive: true },
    }),
    prisma.member.findUnique({
      where: { id: member2Id },
      select: { scorePin: true, isActive: true },
    }),
  ]);

  if (!player1 || !player1.isActive || !player2 || !player2.isActive) {
    return { ok: false, status: 404, error: 'One or both players not found or inactive' };
  }

  const member1Invalid = !scorePinsEqual(pin1, player1.scorePin);
  const member2Invalid = !scorePinsEqual(pin2, player2.scorePin);
  if (member1Invalid || member2Invalid) {
    return {
      ok: false,
      status: 401,
      error: 'Incorrect PIN — please re-enter',
      invalidPins: { member1: member1Invalid, member2: member2Invalid },
    };
  }

  return { ok: true };
}

/**
 * Organizers may always submit (when not in kiosk mode).
 * Kiosk mode: any match, both participant PINs required; forfeits not allowed.
 * Authenticated non-organizer: must be a player in the match; no PIN required; no forfeits.
 */
export async function authorizeTournamentMatchScoreWrite(
  prisma: PrismaClient,
  input: {
    actorMemberId: number | undefined;
    isOrganizer: boolean;
    isKioskMode: boolean;
    member1Pin?: unknown;
    member2Pin?: unknown;
    member1Id: number;
    member2Id: number | null;
    player1Forfeit?: boolean;
    player2Forfeit?: boolean;
  }
): Promise<MatchAuthResult> {
  if ((input.player1Forfeit || input.player2Forfeit) && !input.isOrganizer) {
    return {
      ok: false,
      status: 403,
      error: 'Only organizers can record forfeits',
    };
  }

  if (input.isOrganizer) {
    return { ok: true };
  }

  const me = input.actorMemberId;
  if (!me) {
    return { ok: false, status: 401, error: 'Authentication required' };
  }

  if (input.isKioskMode) {
    return verifyParticipantPins(
      prisma,
      input.member1Id,
      input.member2Id,
      input.member1Pin,
      input.member2Pin
    );
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

  return { ok: true };
}

/** Standalone match create auth (same rules as tournament score entry). */
export async function authorizeStandaloneMatchScoreWrite(
  prisma: PrismaClient,
  req: AuthRequest,
  member1Id: number,
  member2Id: number,
  member1Pin?: unknown,
  member2Pin?: unknown,
  player1Forfeit?: boolean,
  player2Forfeit?: boolean
): Promise<MatchAuthResult> {
  return authorizeTournamentMatchScoreWrite(prisma, {
    actorMemberId: req.memberId ?? req.member?.id,
    isOrganizer: await isOrganizer(req),
    isKioskMode: isKioskMode(req),
    member1Pin,
    member2Pin,
    member1Id,
    member2Id,
    player1Forfeit: player1Forfeit === true,
    player2Forfeit: player2Forfeit === true,
  });
}
