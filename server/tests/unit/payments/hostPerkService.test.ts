jest.mock('../../../src/index', () => ({
  prisma: {
    hostPerkGrant: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    clubPlan: { findUnique: jest.fn() },
    clubEntitlement: { update: jest.fn() },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({
      clubEntitlement: { update: jest.fn() },
      hostPerkGrant: { update: jest.fn() },
    })),
  },
}));

jest.mock('../../../src/payments/checkInStateCache', () => ({
  invalidateCurrentEntitlement: jest.fn(),
}));

jest.mock('../../../src/payments/entitlementQueue', () => ({
  refreshCurrentEntitlement: jest.fn(),
  getFutureEntitlement: jest.fn(),
  getCurrentEntitlement: jest.fn(),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { prisma } from '../../../src/index';
import { refreshCurrentEntitlement, getFutureEntitlement } from '../../../src/payments/entitlementQueue';
import { ensureHostPerkGrant, applyHostPerkGrant } from '../../../src/payments/hostPerkService';

describe('hostPerkService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not create a second grant for the same shift and member', async () => {
    (prisma.hostPerkGrant.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 9, status: 'APPLIED', shiftId: 1, memberId: 4 })
      .mockResolvedValueOnce({ id: 9, status: 'APPLIED' });

    const result = await ensureHostPerkGrant(1, 4);
    expect(result).toEqual({ id: 9, status: 'APPLIED', created: false });
    expect(prisma.hostPerkGrant.create).not.toHaveBeenCalled();
  });

  it('leaves a pending grant pending when there is no current TIME/VISIT plan', async () => {
    (prisma.hostPerkGrant.findUnique as jest.Mock).mockResolvedValue({
      id: 3,
      status: 'PENDING',
      memberId: 8,
      shiftId: 2,
    });
    (refreshCurrentEntitlement as jest.Mock).mockResolvedValue(null);

    await applyHostPerkGrant(3);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('applies TIME days onto current and shifts future TIME', async () => {
    (prisma.hostPerkGrant.findUnique as jest.Mock).mockResolvedValue({
      id: 3,
      status: 'PENDING',
      memberId: 8,
      shiftId: 2,
    });
    (refreshCurrentEntitlement as jest.Mock).mockResolvedValue({
      id: 100,
      type: 'MONTHLY',
      planId: 5,
      validTo: new Date('2026-03-31T12:00:00.000Z'),
      visitsRemaining: null,
      visitsTotal: null,
    });
    (prisma.clubPlan.findUnique as jest.Mock).mockResolvedValue({
      id: 5,
      kind: 'TIME',
      hostPerkDays: 7,
      hostPerkVisits: 0,
    });
    (getFutureEntitlement as jest.Mock).mockResolvedValue({
      id: 101,
      type: 'MONTHLY',
      validFrom: new Date('2026-03-31T12:00:00.000Z'),
      validTo: new Date('2026-04-30T12:00:00.000Z'),
    });

    await applyHostPerkGrant(3);
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
