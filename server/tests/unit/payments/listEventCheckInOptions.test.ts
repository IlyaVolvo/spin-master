/**
 * Kiosk/self-check-in event dropdown options.
 */
jest.mock('../../../src/index', () => ({
  prisma: {
    member: { findUnique: jest.fn() },
    tournamentRegistration: { findMany: jest.fn() },
    tournament: { findMany: jest.fn() },
  },
}));

jest.mock('../../../src/services/systemConfigService', () => ({
  getPreregistrationConfig: jest.fn(() => ({
    eventCheckInLeadMinutes: 60,
    eventCheckInCloseMinutesBeforeStart: 0,
  })),
}));

import { prisma } from '../../../src/index';
import { listEventCheckInOptions } from '../../../src/payments/listEventCheckInOptions';

const start = new Date('2026-08-05T18:00:00.000Z');
const nowInside = new Date(start.getTime() - 30 * 60 * 1000);
const nowOutside = new Date(start.getTime() - 3 * 60 * 60 * 1000);

function eventFields(overrides: Record<string, unknown> = {}) {
  return {
    id: 35,
    name: 'Club Championship',
    tournamentDate: start,
    isEvent: true,
    eventPriceCents: 1000,
    eventCheckInLeadMinutes: 60,
    eventCheckInCloseMinutesBeforeStart: 0,
    ...overrides,
  };
}

describe('listEventCheckInOptions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(nowInside);
    (prisma.member.findUnique as jest.Mock).mockResolvedValue({
      id: 170,
      isActive: true,
      rating: 1500,
      roles: ['PLAYER'],
    });
    (prisma.tournamentRegistration.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.tournament.findMany as jest.Mock).mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns empty for missing/inactive/non-participant members', async () => {
    (prisma.member.findUnique as jest.Mock).mockResolvedValue(null);
    expect(await listEventCheckInOptions(1)).toEqual([]);

    (prisma.member.findUnique as jest.Mock).mockResolvedValue({
      id: 2,
      isActive: false,
      rating: 1500,
      roles: ['PLAYER'],
    });
    expect(await listEventCheckInOptions(2)).toEqual([]);

    (prisma.member.findUnique as jest.Mock).mockResolvedValue({
      id: 3,
      isActive: true,
      rating: 1500,
      roles: [],
    });
    expect(await listEventCheckInOptions(3)).toEqual([]);
  });

  it('offers event_check_in for REGISTERED member when window is open', async () => {
    (prisma.tournamentRegistration.findMany as jest.Mock).mockResolvedValue([
      {
        tournament: eventFields(),
        eventPayment: { status: 'SUCCEEDED' },
      },
    ]);

    const options = await listEventCheckInOptions(170);
    expect(options).toEqual([
      expect.objectContaining({
        tournamentId: 35,
        mode: 'event_check_in',
        clubChargeWaived: true,
        clubChargeWarning: null,
      }),
    ]);
  });

  it('warns on unpaid REGISTERED event_check_in', async () => {
    (prisma.tournamentRegistration.findMany as jest.Mock).mockResolvedValue([
      {
        tournament: eventFields(),
        eventPayment: { status: 'PENDING' },
      },
    ]);

    const options = await listEventCheckInOptions(170);
    expect(options[0].mode).toBe('event_check_in');
    expect(options[0].clubChargeWarning).toMatch(/unpaid/i);
  });

  it('skips REGISTERED event_check_in when window is closed', async () => {
    jest.setSystemTime(nowOutside);
    (prisma.tournamentRegistration.findMany as jest.Mock).mockResolvedValue([
      {
        tournament: eventFields(),
        eventPayment: { status: 'SUCCEEDED' },
      },
    ]);

    expect(await listEventCheckInOptions(170)).toEqual([]);
  });

  it('offers register_and_pay for open events the member can still join', async () => {
    (prisma.tournament.findMany as jest.Mock).mockResolvedValue([
      {
        ...eventFields(),
        minRating: null,
        maxRating: null,
        maxParticipants: 16,
        registrationDeadline: null,
        registrations: [],
      },
    ]);
    // Capacity scan
    (prisma.tournamentRegistration.findMany as jest.Mock)
      .mockResolvedValueOnce([]) // REGISTERED query
      .mockResolvedValueOnce([{ status: 'REGISTERED' }, { status: 'PENDING' }]); // capacity

    const options = await listEventCheckInOptions(170);
    expect(options).toEqual([
      expect.objectContaining({
        tournamentId: 35,
        mode: 'register_and_pay',
        clubChargeWaived: true,
        clubChargeWarning: null,
      }),
    ]);
  });

  it('includes club-charge warning for register_and_pay outside window', async () => {
    jest.setSystemTime(nowOutside);
    (prisma.tournament.findMany as jest.Mock).mockResolvedValue([
      {
        ...eventFields(),
        minRating: null,
        maxRating: null,
        maxParticipants: null,
        registrationDeadline: null,
        registrations: [],
      },
    ]);
    (prisma.tournamentRegistration.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const options = await listEventCheckInOptions(170);
    expect(options[0].mode).toBe('register_and_pay');
    expect(options[0].clubChargeWaived).toBe(false);
    expect(options[0].clubChargeWarning).toMatch(/not open yet/i);
  });

  it('excludes full events unless member already holds a seat', async () => {
    (prisma.tournament.findMany as jest.Mock).mockResolvedValue([
      {
        ...eventFields(),
        minRating: null,
        maxRating: null,
        maxParticipants: 2,
        registrationDeadline: null,
        registrations: [],
      },
    ]);
    (prisma.tournamentRegistration.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: 'REGISTERED' }, { status: 'PENDING' }]);

    expect(await listEventCheckInOptions(170)).toEqual([]);

    // Already PENDING — still offered
    (prisma.tournament.findMany as jest.Mock).mockResolvedValue([
      {
        ...eventFields(),
        minRating: null,
        maxRating: null,
        maxParticipants: 2,
        registrationDeadline: null,
        registrations: [{ status: 'PENDING', eventPayment: { status: 'PENDING' } }],
      },
    ]);
    (prisma.tournamentRegistration.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: 'REGISTERED' }, { status: 'PENDING' }]);

    const options = await listEventCheckInOptions(170);
    expect(options).toHaveLength(1);
    expect(options[0].mode).toBe('register_and_pay');
  });

  it('excludes events outside member rating range', async () => {
    (prisma.tournament.findMany as jest.Mock).mockResolvedValue([
      {
        ...eventFields(),
        minRating: 1800,
        maxRating: null,
        maxParticipants: null,
        registrationDeadline: null,
        registrations: [],
      },
    ]);
    (prisma.tournamentRegistration.findMany as jest.Mock).mockResolvedValueOnce([]);

    expect(await listEventCheckInOptions(170)).toEqual([]);
  });

  it('does not offer register_and_pay when already REGISTERED and paid', async () => {
    (prisma.tournament.findMany as jest.Mock).mockResolvedValue([
      {
        ...eventFields(),
        minRating: null,
        maxRating: null,
        maxParticipants: null,
        registrationDeadline: null,
        registrations: [{ status: 'REGISTERED', eventPayment: { status: 'SUCCEEDED' } }],
      },
    ]);
    (prisma.tournamentRegistration.findMany as jest.Mock).mockResolvedValueOnce([]);

    expect(await listEventCheckInOptions(170)).toEqual([]);
  });

  it('allows ORGANIZER / ADMIN roles for options', async () => {
    (prisma.member.findUnique as jest.Mock).mockResolvedValue({
      id: 2,
      isActive: true,
      rating: 1500,
      roles: ['ORGANIZER'],
    });
    (prisma.tournament.findMany as jest.Mock).mockResolvedValue([
      {
        ...eventFields(),
        minRating: null,
        maxRating: null,
        maxParticipants: null,
        registrationDeadline: null,
        registrations: [],
      },
    ]);
    (prisma.tournamentRegistration.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    expect(await listEventCheckInOptions(2)).toHaveLength(1);
  });
});
