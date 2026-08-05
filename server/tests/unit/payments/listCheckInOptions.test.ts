/**
 * Unified check-in options — regular + today's events + buy plan.
 */
jest.mock('../../../src/index', () => ({
  prisma: {
    member: { findUnique: jest.fn() },
    tournament: { findMany: jest.fn() },
    tournamentRegistration: { findMany: jest.fn() },
    clubVisit: { findFirst: jest.fn() },
    clubPayment: { findFirst: jest.fn() },
    clubEntitlement: { findFirst: jest.fn() },
  },
}));

jest.mock('../../../src/services/systemConfigService', () => ({
  getPreregistrationConfig: jest.fn(() => ({
    eventCheckInLeadMinutes: 60,
    eventCheckInCloseMinutesBeforeStart: 0,
  })),
}));

jest.mock('../../../src/utils/clubDate', () => ({
  getClubDate: jest.fn(() => '2026-08-05'),
  clubLocalDayRangeUtc: jest.fn(() => ({
    gte: new Date('2026-08-05T07:00:00.000Z'),
    lt: new Date('2026-08-06T07:00:00.000Z'),
  })),
}));

jest.mock('../../../src/payments/entitlementQueue', () => ({
  getCurrentEntitlement: jest.fn(),
}));

import { prisma } from '../../../src/index';
import { getCurrentEntitlement } from '../../../src/payments/entitlementQueue';
import { listCheckInOptions } from '../../../src/payments/listCheckInOptions';

const start = new Date('2026-08-05T18:00:00.000Z');
const nowInside = new Date(start.getTime() - 30 * 60 * 1000);
const nowBefore = new Date(start.getTime() - 3 * 60 * 60 * 1000);
const nowAfter = new Date(start.getTime() + 60 * 1000);

function member(overrides: Record<string, unknown> = {}) {
  return {
    id: 170,
    isActive: true,
    rating: 1500,
    roles: ['PLAYER'],
    trialEndsOn: null,
    ...overrides,
  };
}

function eventTournament(overrides: Record<string, unknown> = {}) {
  return {
    id: 35,
    name: 'Club Championship',
    tournamentDate: start,
    isEvent: true,
    status: 'PRE_REGISTRATION',
    eventPriceCents: 1000,
    minRating: null,
    maxRating: null,
    maxParticipants: null,
    registrationDeadline: null,
    eventCheckInLeadMinutes: 60,
    eventCheckInCloseMinutesBeforeStart: 0,
    registrations: [],
    ...overrides,
  };
}

describe('listCheckInOptions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.member.findUnique as jest.Mock).mockResolvedValue(member());
    (prisma.clubVisit.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.clubPayment.findFirst as jest.Mock).mockResolvedValue(null);
    (getCurrentEntitlement as jest.Mock).mockResolvedValue(null);
    (prisma.tournament.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.tournamentRegistration.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('returns Buy a plan when uncovered and no events', async () => {
    const options = await listCheckInOptions(170, nowInside);
    expect(options).toEqual([
      expect.objectContaining({ id: 'buy_plan', kind: 'buy_plan', actionable: true }),
    ]);
  });

  it('returns covered regular admission when member has a plan', async () => {
    (getCurrentEntitlement as jest.Mock).mockResolvedValue({
      id: 1,
      type: 'MONTHLY',
      visitsRemaining: null,
      validTo: new Date('2027-01-01'),
    });
    const options = await listCheckInOptions(170, nowInside);
    expect(options).toEqual([
      expect.objectContaining({ id: 'regular', kind: 'regular', actionable: true }),
    ]);
  });

  it('orders prepaid event before regular before unpaid event before buy plan', async () => {
    (getCurrentEntitlement as jest.Mock).mockResolvedValue(null);
    (prisma.tournament.findMany as jest.Mock).mockResolvedValue([
      eventTournament({
        id: 35,
        name: 'Prepaid Event',
        registrations: [{ status: 'REGISTERED', eventPayment: { status: 'SUCCEEDED' } }],
      }),
      eventTournament({
        id: 36,
        name: 'Unpaid Event',
        tournamentDate: new Date(start.getTime() + 30 * 60 * 1000),
        registrations: [],
      }),
    ]);
    (prisma.tournamentRegistration.findMany as jest.Mock).mockResolvedValue([]);

    // Covered via visit pack so regular is actionable
    (getCurrentEntitlement as jest.Mock).mockResolvedValue({
      id: 1,
      type: 'VISIT_PACK',
      visitsRemaining: 3,
      validTo: null,
    });

    const options = await listCheckInOptions(170, nowInside);
    expect(options.map((o) => o.id)).toEqual(['event:35', 'regular', 'event:36']);
    expect(options[0].kind).toBe('event_check_in');
    expect(options[0].prepaid).toBe(true);
    expect(options[0].actionable).toBe(true);
    expect(options[2].kind).toBe('register_and_pay');
    expect(options[2].actionable).toBe(true);
  });

  it('shows upcoming prepaid event disabled with opensAt, then buy plan', async () => {
    (prisma.tournament.findMany as jest.Mock).mockResolvedValue([
      eventTournament({
        registrations: [{ status: 'REGISTERED', eventPayment: { status: 'SUCCEEDED' } }],
      }),
    ]);

    const options = await listCheckInOptions(170, nowBefore);
    expect(options.map((o) => o.kind)).toEqual(['event_check_in', 'buy_plan']);
    expect(options[0].actionable).toBe(false);
    expect(options[0].disabledReason).toBe('window_not_open');
    expect(options[0].opensAt).toBeTruthy();
  });

  it('omits events after check-in window closes', async () => {
    (prisma.tournament.findMany as jest.Mock).mockResolvedValue([
      eventTournament({
        registrations: [{ status: 'REGISTERED', eventPayment: { status: 'SUCCEEDED' } }],
      }),
    ]);
    (getCurrentEntitlement as jest.Mock).mockResolvedValue({
      id: 1,
      type: 'MONTHLY',
      visitsRemaining: null,
      validTo: new Date('2027-01-01'),
    });

    const options = await listCheckInOptions(170, nowAfter);
    expect(options.every((o) => o.kind !== 'event_check_in')).toBe(true);
    expect(options).toEqual([
      expect.objectContaining({ kind: 'regular' }),
    ]);
  });

  it('disables unpaid event before window; enables register_and_pay when open', async () => {
    (prisma.tournament.findMany as jest.Mock).mockResolvedValue([eventTournament()]);
    (prisma.tournamentRegistration.findMany as jest.Mock).mockResolvedValue([]);

    const before = await listCheckInOptions(170, nowBefore);
    const unpaidBefore = before.find((o) => o.kind === 'register_and_pay');
    expect(unpaidBefore?.actionable).toBe(false);

    const inside = await listCheckInOptions(170, nowInside);
    const unpaidInside = inside.find((o) => o.kind === 'register_and_pay');
    expect(unpaidInside?.actionable).toBe(true);
  });

  it('excludes full events unless member already holds a seat', async () => {
    (prisma.tournament.findMany as jest.Mock).mockResolvedValue([
      eventTournament({ maxParticipants: 1 }),
    ]);
    (prisma.tournamentRegistration.findMany as jest.Mock).mockResolvedValue([
      { status: 'REGISTERED' },
    ]);

    const options = await listCheckInOptions(170, nowInside);
    expect(options.find((o) => o.kind === 'register_and_pay')).toBeUndefined();
  });

  it('excludes events outside rating range for new registration', async () => {
    (prisma.tournament.findMany as jest.Mock).mockResolvedValue([
      eventTournament({ minRating: 1800 }),
    ]);
    const options = await listCheckInOptions(170, nowInside);
    expect(options.find((o) => o.tournamentId === 35)).toBeUndefined();
  });

  it('returns empty for inactive members', async () => {
    (prisma.member.findUnique as jest.Mock).mockResolvedValue(member({ isActive: false }));
    expect(await listCheckInOptions(170, nowInside)).toEqual([]);
  });

  it('treats free re-entry (visit today) as covered regular', async () => {
    (prisma.clubVisit.findFirst as jest.Mock).mockResolvedValue({ id: 9 });
    const options = await listCheckInOptions(170, nowInside);
    expect(options).toEqual([
      expect.objectContaining({ kind: 'regular', actionable: true }),
    ]);
  });
});
