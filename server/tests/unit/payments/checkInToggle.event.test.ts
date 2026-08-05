/**
 * Event-covered check-in / checkout via toggleVisit(eventTournamentId).
 */
jest.mock('../../../src/index', () => ({
  prisma: {
    $transaction: jest.fn(),
    clubVisit: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    clubEntitlement: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    clubPayment: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    member: { findUnique: jest.fn() },
    tournament: { findUnique: jest.fn() },
    tournamentRegistration: { findUnique: jest.fn() },
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/services/socketService', () => ({
  emitClubVisitUpdated: jest.fn(),
}));

jest.mock('../../../src/utils/clubDate', () => ({
  getClubDate: jest.fn(() => '2026-08-04'),
  clubLocalDayRangeUtc: jest.fn(() => ({ gte: new Date(), lt: new Date() })),
}));

jest.mock('../../../src/payments/checkInReminders', () => ({
  getExpiryWarning: jest.fn(() => null),
}));

jest.mock('../../../src/payments/courtesy', () => ({
  evaluateCourtesy: jest.fn(),
  ensureCourtesyObligation: jest.fn(),
  notifyAdminsOfCourtesy: jest.fn(),
}));

jest.mock('../../../src/payments/eventCheckInWindow', () => ({
  isEventCheckInWindowOpen: jest.fn(),
}));

import { prisma } from '../../../src/index';
import { toggleVisit } from '../../../src/payments/checkInToggle';
import { clearCheckInStateCache } from '../../../src/payments/checkInStateCache';
import { isEventCheckInWindowOpen } from '../../../src/payments/eventCheckInWindow';
import { emitClubVisitUpdated } from '../../../src/services/socketService';

const memberContext = {
  trialEndsOn: null as Date | null,
  email: 'king.adam@gmail.com',
  firstName: 'Adam',
  lastName: 'King',
};

function mockReadBundle(openVisit: unknown = null) {
  (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (t: any) => unknown) =>
    fn({
      clubVisit: {
        findFirst: jest.fn().mockResolvedValue(openVisit),
        count: jest.fn().mockResolvedValue(openVisit ? 1 : 0),
      },
      clubEntitlement: { findFirst: jest.fn().mockResolvedValue(null) },
      clubPayment: { findFirst: jest.fn().mockResolvedValue(null) },
      member: { findUnique: jest.fn().mockResolvedValue(memberContext) },
    }),
  );
}

describe('toggleVisit event check-in', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearCheckInStateCache();
    (isEventCheckInWindowOpen as jest.Mock).mockReturnValue(true);
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({
      id: 35,
      name: 'Club Championship',
      tournamentDate: new Date('2026-08-05T18:00:00.000Z'),
      isEvent: true,
      eventCheckInLeadMinutes: 120,
      eventCheckInCloseMinutesBeforeStart: 0,
    });
    (prisma.tournamentRegistration.findUnique as jest.Mock).mockResolvedValue({
      status: 'REGISTERED',
    });
  });

  it('rejects unknown / non-event tournaments', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(
      toggleVisit(170, 'MANUAL', memberContext, { eventTournamentId: 35 }),
    ).rejects.toThrow(/Event tournament not found/);

    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({
      id: 35,
      isEvent: false,
      name: 'Regular',
      tournamentDate: new Date(),
      eventCheckInLeadMinutes: null,
      eventCheckInCloseMinutesBeforeStart: null,
    });
    await expect(
      toggleVisit(170, 'MANUAL', memberContext, { eventTournamentId: 35 }),
    ).rejects.toThrow(/Event tournament not found/);
  });

  it('rejects when event check-in window is closed', async () => {
    (isEventCheckInWindowOpen as jest.Mock).mockReturnValue(false);
    await expect(
      toggleVisit(170, 'MANUAL', memberContext, { eventTournamentId: 35 }),
    ).rejects.toThrow(/not open/i);
  });

  it('rejects when member is not REGISTERED for the event', async () => {
    (prisma.tournamentRegistration.findUnique as jest.Mock).mockResolvedValue({
      status: 'PENDING',
    });
    await expect(
      toggleVisit(170, 'MANUAL', memberContext, { eventTournamentId: 35 }),
    ).rejects.toThrow(/not registered/i);
  });

  it('creates a visit with eventTournamentId and no club charge', async () => {
    mockReadBundle(null);
    const created = {
      id: 50,
      memberId: 170,
      clubDate: '2026-08-04',
      eventTournamentId: 35,
      dailyPaymentApplied: false,
      isCourtesy: false,
    };
    (prisma.clubVisit.create as jest.Mock).mockResolvedValue(created);

    const out = await toggleVisit(170, 'MANUAL', memberContext, { eventTournamentId: 35 });

    expect(out.action).toBe('CHECK_IN');
    expect(out.charged).toBe(false);
    expect(prisma.clubVisit.create).toHaveBeenCalledWith({
      data: {
        memberId: 170,
        clubDate: '2026-08-04',
        dailyPaymentApplied: false,
        eventTournamentId: 35,
      },
    });
    expect(emitClubVisitUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        memberId: 170,
        action: 'CHECK_IN',
        eventTournamentId: 35,
        eventName: 'Club Championship',
      }),
    );
  });

  it('attaches event to an already-open non-event visit', async () => {
    const openVisit = {
      id: 50,
      memberId: 170,
      clubDate: '2026-08-04',
      checkOutAt: null,
      rejectedAt: null,
      isCourtesy: false,
      eventTournamentId: null,
    };
    mockReadBundle(openVisit);
    (prisma.clubVisit.update as jest.Mock).mockResolvedValue({
      ...openVisit,
      eventTournamentId: 35,
    });

    const out = await toggleVisit(170, 'MANUAL', memberContext, { eventTournamentId: 35 });

    expect(out.action).toBe('CHECK_IN');
    expect(out.warning).toMatch(/already present/i);
    expect(prisma.clubVisit.update).toHaveBeenCalledWith({
      where: { id: 50 },
      data: { eventTournamentId: 35 },
    });
  });

  it('checks out when already present under the same event', async () => {
    const openVisit = {
      id: 50,
      memberId: 170,
      clubDate: '2026-08-04',
      checkOutAt: null,
      rejectedAt: null,
      isCourtesy: false,
      eventTournamentId: 35,
    };
    mockReadBundle(openVisit);
    (prisma.clubVisit.update as jest.Mock).mockResolvedValue({
      ...openVisit,
      checkOutAt: new Date(),
      closedBy: 'MANUAL',
    });

    const out = await toggleVisit(170, 'MANUAL', memberContext, { eventTournamentId: 35 });

    expect(out.action).toBe('CHECK_OUT');
    expect(prisma.clubVisit.update).toHaveBeenCalledWith({
      where: { id: 50 },
      data: expect.objectContaining({ closedBy: 'MANUAL' }),
    });
  });
});
