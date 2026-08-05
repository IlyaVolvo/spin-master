import { createHash, randomBytes } from 'crypto';
import { prisma } from '../index';
import { runEventCheckout, clearEventCashPayment, countHeldRegistrations } from './eventPayment';
import { isEventCheckInWindowOpen } from './eventCheckInWindow';
import { toggleVisit, type ToggleVisitResult } from './checkInToggle';

function hashRegistrationCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function generateRegistrationCode(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Desk/kiosk: collect event fee (cash), mark REGISTERED, then check in.
 * If event check-in window is open, visit is event-covered (no club charge).
 * Otherwise regular check-in rules apply (may require club payment).
 */
export async function registerPayEventAndCheckIn(params: {
  memberId: number;
  tournamentId: number;
  closedBy: 'SCAN' | 'MANUAL';
}): Promise<{
  eventPaymentId: number;
  registrationStatus: string;
  checkIn: ToggleVisitResult;
  usedEventCheckIn: boolean;
}> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: params.tournamentId },
    include: { registrations: true },
  });
  if (!tournament?.isEvent || tournament.eventPriceCents == null) {
    throw new Error('Tournament is not a paid event');
  }
  if (tournament.status !== 'PRE_REGISTRATION') {
    throw new Error('Event registration is closed');
  }
  if (tournament.registrationDeadline && new Date() > new Date(tournament.registrationDeadline)) {
    throw new Error('Event registration deadline has passed');
  }

  const existing = tournament.registrations.find((r) => r.memberId === params.memberId);
  if (existing?.status === 'REGISTERED') {
    const pay = existing.eventPaymentId
      ? await prisma.clubPayment.findUnique({ where: { id: existing.eventPaymentId } })
      : null;
    if (pay?.status === 'SUCCEEDED') {
      const usedEventCheckIn = isEventCheckInWindowOpen(tournament);
      const checkIn = await toggleVisit(
        params.memberId,
        params.closedBy,
        null,
        usedEventCheckIn ? { eventTournamentId: params.tournamentId } : undefined,
      );
      return {
        eventPaymentId: pay.id,
        registrationStatus: 'REGISTERED',
        checkIn,
        usedEventCheckIn,
      };
    }
  }

  const held = countHeldRegistrations(tournament.registrations);
  const alreadyHolding = existing?.status === 'PENDING' || existing?.status === 'REGISTERED';
  if (!alreadyHolding && tournament.maxParticipants != null && held >= tournament.maxParticipants) {
    throw new Error('Event has reached maximum participants');
  }

  let registrationId = existing?.id;
  if (!registrationId) {
    const created = await prisma.tournamentRegistration.create({
      data: {
        tournamentId: params.tournamentId,
        memberId: params.memberId,
        registrationCodeHash: hashRegistrationCode(generateRegistrationCode()),
        status: 'PENDING',
      },
    });
    registrationId = created.id;
  } else if (existing && existing.status !== 'PENDING' && existing.status !== 'REGISTERED') {
    await prisma.tournamentRegistration.update({
      where: { id: registrationId },
      data: {
        status: 'PENDING',
        registeredAt: null,
        rejectedAt: null,
        rejectionReason: null,
      },
    });
  }

  const checkout = await runEventCheckout({
    memberId: params.memberId,
    tournamentId: params.tournamentId,
    registrationId,
    eventPriceCents: tournament.eventPriceCents,
    tournamentName: tournament.name,
    initiatedBy: 'ADMIN',
    method: 'cash',
  });
  await clearEventCashPayment(checkout.paymentId);

  const usedEventCheckIn = isEventCheckInWindowOpen(tournament);
  const checkIn = await toggleVisit(
    params.memberId,
    params.closedBy,
    null,
    usedEventCheckIn ? { eventTournamentId: params.tournamentId } : undefined,
  );

  return {
    eventPaymentId: checkout.paymentId,
    registrationStatus: 'REGISTERED',
    checkIn,
    usedEventCheckIn,
  };
}
