/**
 * Club visit auto-checkout (stale open visits)
 */
jest.mock('../../../src/index', () => ({
  prisma: {
    clubVisit: {
      updateMany: jest.fn(),
    },
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { prisma } from '../../../src/index';
import { runAutoCheckout } from '../../../src/payments/autoCheckout';

describe('runAutoCheckout', () => {
  const originalTz = process.env.CLUB_TIMEZONE;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CLUB_TIMEZONE = 'UTC';
    (prisma.clubVisit.updateMany as jest.Mock).mockResolvedValue({ count: 3 });
  });

  afterEach(() => {
    if (originalTz === undefined) delete process.env.CLUB_TIMEZONE;
    else process.env.CLUB_TIMEZONE = originalTz;
  });

  it('closes all open visits with clubDate strictly before today', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-31T15:00:00.000Z'));

    const result = await runAutoCheckout();

    expect(prisma.clubVisit.updateMany).toHaveBeenCalledWith({
      where: {
        clubDate: { lt: '2026-07-31' },
        checkOutAt: null,
      },
      data: {
        checkOutAt: new Date('2026-07-31T15:00:00.000Z'),
        closedBy: 'AUTO',
      },
    });
    expect(result).toEqual({ beforeClubDate: '2026-07-31', closedCount: 3 });

    jest.useRealTimers();
  });

  it('targets a single clubDate when provided', async () => {
    (prisma.clubVisit.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const result = await runAutoCheckout({ clubDate: '2026-07-28' });

    expect(prisma.clubVisit.updateMany).toHaveBeenCalledWith({
      where: {
        clubDate: '2026-07-28',
        checkOutAt: null,
      },
      data: expect.objectContaining({ closedBy: 'AUTO' }),
    });
    expect(result).toEqual({ clubDate: '2026-07-28', closedCount: 1 });
  });
});
