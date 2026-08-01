/**
 * Club visit auto-checkout (stale open visits at club close time)
 */
jest.mock('../../../src/index', () => ({
  prisma: {
    clubVisit: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/services/socketService', () => ({
  emitClubVisitUpdated: jest.fn(),
}));

jest.mock('../../../src/utils/clubHours', () => ({
  clubCloseInstant: jest.fn((ymd: string) => new Date(`${ymd}T22:00:00.000Z`)),
}));

import { prisma } from '../../../src/index';
import { runAutoCheckout, runCloseClub } from '../../../src/payments/autoCheckout';
import { clubCloseInstant } from '../../../src/utils/clubHours';
import { emitClubVisitUpdated } from '../../../src/services/socketService';

describe('runAutoCheckout', () => {
  const originalTz = process.env.CLUB_TIMEZONE;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CLUB_TIMEZONE = 'UTC';
    (prisma.clubVisit.findMany as jest.Mock).mockResolvedValue([
      { id: 1, memberId: 10, clubDate: '2026-07-29' },
      { id: 2, memberId: 11, clubDate: '2026-07-30' },
      { id: 3, memberId: 12, clubDate: '2026-07-30' },
    ]);
    (prisma.clubVisit.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    if (originalTz === undefined) delete process.env.CLUB_TIMEZONE;
    else process.env.CLUB_TIMEZONE = originalTz;
  });

  it('closes open visits grouped by clubDate using that day close instant', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-31T15:00:00.000Z'));

    (prisma.clubVisit.updateMany as jest.Mock)
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 2 });

    const result = await runAutoCheckout();

    expect(prisma.clubVisit.findMany).toHaveBeenCalledWith({
      where: {
        clubDate: { lt: '2026-07-31' },
        checkOutAt: null,
        rejectedAt: null,
      },
      select: { id: true, memberId: true, clubDate: true },
    });
    expect(clubCloseInstant).toHaveBeenCalledWith('2026-07-29');
    expect(clubCloseInstant).toHaveBeenCalledWith('2026-07-30');
    expect(prisma.clubVisit.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [1] }, checkOutAt: null, rejectedAt: null },
      data: {
        checkOutAt: new Date('2026-07-29T22:00:00.000Z'),
        closedBy: 'AUTO',
      },
    });
    expect(prisma.clubVisit.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [2, 3] }, checkOutAt: null, rejectedAt: null },
      data: {
        checkOutAt: new Date('2026-07-30T22:00:00.000Z'),
        closedBy: 'AUTO',
      },
    });
    expect(result).toEqual({ beforeClubDate: '2026-07-31', closedCount: 3 });
    expect(emitClubVisitUpdated).toHaveBeenCalled();

    jest.useRealTimers();
  });

  it('targets a single clubDate when provided', async () => {
    (prisma.clubVisit.findMany as jest.Mock).mockResolvedValue([
      { id: 9, memberId: 2, clubDate: '2026-07-28' },
    ]);
    (prisma.clubVisit.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const result = await runAutoCheckout({ clubDate: '2026-07-28' });

    expect(prisma.clubVisit.findMany).toHaveBeenCalledWith({
      where: {
        clubDate: '2026-07-28',
        checkOutAt: null,
        rejectedAt: null,
      },
      select: { id: true, memberId: true, clubDate: true },
    });
    expect(result).toEqual({ clubDate: '2026-07-28', closedCount: 1 });
  });
});

describe('runCloseClub', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.clubVisit.findMany as jest.Mock).mockResolvedValue([
      { id: 1, memberId: 10, clubDate: '2026-07-31' },
    ]);
    (prisma.clubVisit.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
  });

  it('closes all open visits at now by default with AUTO', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-31T20:15:00.000Z'));

    const result = await runCloseClub();

    expect(prisma.clubVisit.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [1] }, checkOutAt: null, rejectedAt: null },
      data: {
        checkOutAt: new Date('2026-07-31T20:15:00.000Z'),
        closedBy: 'AUTO',
      },
    });
    expect(result.closedCount).toBe(1);
    expect(result.checkOutAt).toBe('2026-07-31T20:15:00.000Z');

    jest.useRealTimers();
  });

  it('accepts an explicit checkOutAt', async () => {
    const at = new Date('2026-07-31T21:30:00.000Z');
    const result = await runCloseClub({ checkOutAt: at });
    expect(prisma.clubVisit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { checkOutAt: at, closedBy: 'AUTO' },
      }),
    );
    expect(result.checkOutAt).toBe(at.toISOString());
  });
});
