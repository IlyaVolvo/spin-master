/**
 * Desk/kiosk: register & pay event fee then check in.
 */
jest.mock('../../../src/index', () => ({
  prisma: {
    tournament: { findUnique: jest.fn() },
    tournamentRegistration: { create: jest.fn(), update: jest.fn() },
    clubPayment: { findUnique: jest.fn() },
  },
}));

jest.mock('../../../src/payments/eventPayment', () => ({
  runEventCheckout: jest.fn(),
  clearEventCashPayment: jest.fn(),
  countHeldRegistrations: jest.requireActual('../../../src/payments/eventPayment').countHeldRegistrations,
}));

jest.mock('../../../src/payments/eventCheckInWindow', () => ({
  isEventCheckInWindowOpen: jest.fn(),
}));

jest.mock('../../../src/payments/checkInToggle', () => ({
  toggleVisit: jest.fn(),
}));

import { prisma } from '../../../src/index';
import { runEventCheckout, clearEventCashPayment } from '../../../src/payments/eventPayment';
import { isEventCheckInWindowOpen } from '../../../src/payments/eventCheckInWindow';
import { toggleVisit } from '../../../src/payments/checkInToggle';
import { registerPayEventAndCheckIn } from '../../../src/payments/registerPayEventAndCheckIn';

function tournament(overrides: Record<string, unknown> = {}) {
  return {
    id: 35,
    name: 'Club Championship',
    status: 'PRE_REGISTRATION',
    isEvent: true,
    eventPriceCents: 1000,
    registrationDeadline: null,
    maxParticipants: null,
    registrations: [],
    ...overrides,
  };
}

describe('registerPayEventAndCheckIn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isEventCheckInWindowOpen as jest.Mock).mockReturnValue(true);
    (runEventCheckout as jest.Mock).mockResolvedValue({ paymentId: 26, amountCents: 1000 });
    (clearEventCashPayment as jest.Mock).mockResolvedValue({ paymentId: 26 });
    (toggleVisit as jest.Mock).mockResolvedValue({
      action: 'CHECK_IN',
      visit: { id: 1 },
      charged: false,
      canPay: false,
    });
  });

  it('rejects non-events, closed registration, and past deadline', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(
      tournament({ isEvent: false }),
    );
    await expect(
      registerPayEventAndCheckIn({ memberId: 170, tournamentId: 35, closedBy: 'MANUAL' }),
    ).rejects.toThrow(/not a paid event/i);

    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(
      tournament({ status: 'ACTIVE' }),
    );
    await expect(
      registerPayEventAndCheckIn({ memberId: 170, tournamentId: 35, closedBy: 'MANUAL' }),
    ).rejects.toThrow(/registration is closed/i);

    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(
      tournament({ registrationDeadline: new Date('2020-01-01T00:00:00.000Z') }),
    );
    await expect(
      registerPayEventAndCheckIn({ memberId: 170, tournamentId: 35, closedBy: 'MANUAL' }),
    ).rejects.toThrow(/deadline/i);
  });

  it('rejects when event is full and member does not already hold a seat', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(
      tournament({
        maxParticipants: 1,
        registrations: [{ memberId: 99, status: 'REGISTERED', id: 1 }],
      }),
    );
    await expect(
      registerPayEventAndCheckIn({ memberId: 170, tournamentId: 35, closedBy: 'MANUAL' }),
    ).rejects.toThrow(/maximum participants/i);
  });

  it('creates PENDING registration, cash-clears payment, and event-checks-in when window open', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(tournament());
    (prisma.tournamentRegistration.create as jest.Mock).mockResolvedValue({
      id: 9,
      memberId: 170,
      status: 'PENDING',
    });

    const out = await registerPayEventAndCheckIn({
      memberId: 170,
      tournamentId: 35,
      closedBy: 'MANUAL',
    });

    expect(prisma.tournamentRegistration.create).toHaveBeenCalled();
    expect(runEventCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        memberId: 170,
        tournamentId: 35,
        registrationId: 9,
        method: 'cash',
        initiatedBy: 'ADMIN',
      }),
    );
    expect(clearEventCashPayment).toHaveBeenCalledWith(26);
    expect(toggleVisit).toHaveBeenCalledWith(170, 'MANUAL', null, { eventTournamentId: 35 });
    expect(out.usedEventCheckIn).toBe(true);
    expect(out.eventPaymentId).toBe(26);
  });

  it('checks in without event coverage when window is closed (club rules apply)', async () => {
    (isEventCheckInWindowOpen as jest.Mock).mockReturnValue(false);
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(tournament());
    (prisma.tournamentRegistration.create as jest.Mock).mockResolvedValue({ id: 9 });

    const out = await registerPayEventAndCheckIn({
      memberId: 170,
      tournamentId: 35,
      closedBy: 'MANUAL',
    });

    expect(toggleVisit).toHaveBeenCalledWith(170, 'MANUAL', null, undefined);
    expect(out.usedEventCheckIn).toBe(false);
  });

  it('skips checkout when already REGISTERED and paid — just checks in', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(
      tournament({
        registrations: [
          {
            id: 9,
            memberId: 170,
            status: 'REGISTERED',
            eventPaymentId: 26,
          },
        ],
      }),
    );
    (prisma.clubPayment.findUnique as jest.Mock).mockResolvedValue({
      id: 26,
      status: 'SUCCEEDED',
    });

    const out = await registerPayEventAndCheckIn({
      memberId: 170,
      tournamentId: 35,
      closedBy: 'MANUAL',
    });

    expect(runEventCheckout).not.toHaveBeenCalled();
    expect(clearEventCashPayment).not.toHaveBeenCalled();
    expect(toggleVisit).toHaveBeenCalledWith(170, 'MANUAL', null, { eventTournamentId: 35 });
    expect(out.registrationStatus).toBe('REGISTERED');
  });

  it('reuses existing PENDING registration without creating a new row', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(
      tournament({
        registrations: [{ id: 9, memberId: 170, status: 'PENDING', eventPaymentId: null }],
      }),
    );

    await registerPayEventAndCheckIn({
      memberId: 170,
      tournamentId: 35,
      closedBy: 'SCAN',
    });

    expect(prisma.tournamentRegistration.create).not.toHaveBeenCalled();
    expect(runEventCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ registrationId: 9 }),
    );
  });

  it('still clears payment after zero-balance checkout (idempotent SUCCEEDED clear)', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(tournament());
    (prisma.tournamentRegistration.create as jest.Mock).mockResolvedValue({ id: 9 });
    (runEventCheckout as jest.Mock).mockResolvedValue({ paymentId: 26, amountCents: 0 });

    await registerPayEventAndCheckIn({
      memberId: 170,
      tournamentId: 35,
      closedBy: 'MANUAL',
    });

    expect(clearEventCashPayment).toHaveBeenCalledWith(26);
    expect(toggleVisit).toHaveBeenCalled();
  });
});
