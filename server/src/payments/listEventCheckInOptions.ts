import { prisma } from '../index';
import {
  eventOutsideCheckInWindowClubChargeWarning,
  isEventCheckInWindowOpen,
} from './eventCheckInWindow';
import { countHeldRegistrations } from './eventPayment';

export type EventCheckInOptionDto = {
  tournamentId: number;
  name: string | null;
  tournamentDate: Date | null;
  eventPriceCents: number | null;
  /** Already paid/cleared — check in under event coverage (waives club charge). */
  mode: 'event_check_in' | 'register_and_pay';
  clubChargeWaived: boolean;
  clubChargeWarning: string | null;
};

function tournamentSatisfiesRating(
  member: { rating: number | null },
  tournament: { minRating: number | null; maxRating: number | null },
): boolean {
  const rating = member.rating;
  if (tournament.minRating != null && (rating == null || rating < tournament.minRating)) return false;
  if (tournament.maxRating != null && (rating == null || rating > tournament.maxRating)) return false;
  return true;
}

/**
 * Options for kiosk/self check-in dropdown:
 * - event_check_in: REGISTERED + check-in window open
 * - register_and_pay: open event registration (deadline) member can still join/pay
 */
export async function listEventCheckInOptions(memberId: number): Promise<EventCheckInOptionDto[]> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true, isActive: true, rating: true, roles: true },
  });
  if (!member) return [];
  const roles = (member.roles || []).map((r) => String(r).toUpperCase());
  const canParticipate =
    roles.includes('PLAYER') || roles.includes('ORGANIZER') || roles.includes('ADMIN');
  if (!member.isActive || !canParticipate) {
    return [];
  }

  const now = new Date();
  const options: EventCheckInOptionDto[] = [];
  const seen = new Set<number>();

  const registered = await prisma.tournamentRegistration.findMany({
    where: {
      memberId,
      status: 'REGISTERED',
      tournament: { isEvent: true },
    },
    include: {
      tournament: {
        select: {
          id: true,
          name: true,
          tournamentDate: true,
          isEvent: true,
          eventPriceCents: true,
          eventCheckInLeadMinutes: true,
          eventCheckInCloseMinutesBeforeStart: true,
        },
      },
      eventPayment: { select: { status: true } },
    },
  });

  for (const row of registered) {
    const t = row.tournament;
    if (!isEventCheckInWindowOpen(t, now)) continue;
    const paid = row.eventPayment?.status === 'SUCCEEDED';
    // Unpaid REGISTERED (organizer-cleared) can still event-check-in; obligation stays in payment log.
    options.push({
      tournamentId: t.id,
      name: t.name,
      tournamentDate: t.tournamentDate,
      eventPriceCents: t.eventPriceCents,
      mode: 'event_check_in',
      clubChargeWaived: true,
      clubChargeWarning: paid
        ? null
        : 'Event check-in allowed; event fee may still be unpaid in the payment log.',
    });
    seen.add(t.id);
  }

  const openEvents = await prisma.tournament.findMany({
    where: {
      isEvent: true,
      status: 'PRE_REGISTRATION',
      eventPriceCents: { not: null },
      OR: [{ registrationDeadline: null }, { registrationDeadline: { gt: now } }],
    },
    select: {
      id: true,
      name: true,
      tournamentDate: true,
      isEvent: true,
      eventPriceCents: true,
      minRating: true,
      maxRating: true,
      maxParticipants: true,
      registrationDeadline: true,
      eventCheckInLeadMinutes: true,
      eventCheckInCloseMinutesBeforeStart: true,
      registrations: {
        where: { memberId },
        select: { status: true, eventPayment: { select: { status: true } } },
      },
    },
  });

  for (const t of openEvents) {
    if (seen.has(t.id)) continue;
    if (!tournamentSatisfiesRating(member, t)) continue;

    const myReg = t.registrations[0];
    if (myReg?.status === 'REGISTERED' && myReg.eventPayment?.status === 'SUCCEEDED') {
      continue;
    }

    const allRegs = await prisma.tournamentRegistration.findMany({
      where: { tournamentId: t.id },
      select: { status: true },
    });
    const held = countHeldRegistrations(allRegs);
    const alreadyHolding = myReg?.status === 'PENDING' || myReg?.status === 'REGISTERED';
    if (!alreadyHolding && t.maxParticipants != null && held >= t.maxParticipants) {
      continue;
    }

    const warning = eventOutsideCheckInWindowClubChargeWarning(t, now);
    options.push({
      tournamentId: t.id,
      name: t.name,
      tournamentDate: t.tournamentDate,
      eventPriceCents: t.eventPriceCents,
      mode: 'register_and_pay',
      clubChargeWaived: isEventCheckInWindowOpen(t, now),
      clubChargeWarning: warning,
    });
    seen.add(t.id);
  }

  return options;
}
