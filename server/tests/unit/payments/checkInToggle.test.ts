/**
 * Bundled toggleVisit — covered check-in / checkout use ≤2 sequential Prisma RTs
 * when member context + entitlement cache are warm.
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
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/services/socketService', () => ({
  emitClubVisitUpdated: jest.fn(),
}));

jest.mock('../../../src/utils/clubDate', () => ({
  getClubDate: jest.fn(() => '2026-07-30'),
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

import { prisma } from '../../../src/index';
import { toggleVisit } from '../../../src/payments/checkInToggle';
import {
  clearCheckInStateCache,
  setCachedCurrentEntitlement,
} from '../../../src/payments/checkInStateCache';
import { getExpiryWarning } from '../../../src/payments/checkInReminders';
import type { ClubEntitlement } from '@prisma/client';

const memberContext = {
  trialEndsOn: null as Date | null,
  email: 'p@ex.com',
  firstName: 'Pat',
  lastName: 'Member',
};

function monthlyEntitlement(overrides: Partial<ClubEntitlement> = {}): ClubEntitlement {
  return {
    id: 5,
    memberId: 10,
    type: 'MONTHLY',
    status: 'CURRENT',
    label: 'Monthly',
    validFrom: new Date('2026-07-01T00:00:00.000Z'),
    validTo: new Date('2027-08-01T00:00:00.000Z'),
    visitsRemaining: null,
    visitsTotal: null,
    amountPaidCents: 10000,
    familyKey: null,
    planId: 'monthly',
    planSegment: null,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ClubEntitlement;
}

describe('toggleVisit bundling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearCheckInStateCache();
    (getExpiryWarning as jest.Mock).mockReturnValue(null);
  });

  it('checkout: one read $transaction then one visit update (no entitlement reload)', async () => {
    const openVisit = {
      id: 99,
      memberId: 10,
      clubDate: '2026-07-30',
      checkOutAt: null,
      rejectedAt: null,
      isCourtesy: false,
    };
    const updated = { ...openVisit, checkOutAt: new Date(), closedBy: 'MANUAL' };
    const ent = monthlyEntitlement();
    setCachedCurrentEntitlement(10, ent);

    const tx = {
      clubVisit: {
        findFirst: jest.fn().mockResolvedValue(openVisit),
        count: jest.fn().mockResolvedValue(1),
      },
      clubEntitlement: { findFirst: jest.fn(), update: jest.fn() },
      clubPayment: { findFirst: jest.fn().mockResolvedValue(null) },
      member: { findUnique: jest.fn() },
    };
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (t: typeof tx) => unknown) =>
      fn(tx),
    );
    (prisma.clubVisit.update as jest.Mock).mockResolvedValue(updated);

    const out = await toggleVisit(10, 'MANUAL', memberContext);

    expect(out.action).toBe('CHECK_OUT');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.clubVisit.update).toHaveBeenCalledTimes(1);
    expect(tx.clubEntitlement.findFirst).not.toHaveBeenCalled();
    expect(out.entitlement).toEqual({
      type: 'MONTHLY',
      visitsRemaining: null,
      validTo: ent.validTo,
    });
  });

  it('covered first-of-day: read bundle + one write $transaction (no post entitlement find)', async () => {
    const ent = monthlyEntitlement();
    setCachedCurrentEntitlement(10, ent);
    const createdVisit = {
      id: 42,
      memberId: 10,
      clubDate: '2026-07-30',
      dailyPaymentApplied: true,
    };

    let transactionCalls = 0;
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (t: unknown) => unknown) => {
      transactionCalls += 1;
      if (transactionCalls === 1) {
        const tx = {
          clubVisit: {
            findFirst: jest.fn().mockResolvedValue(null),
            count: jest.fn().mockResolvedValue(0),
          },
          clubEntitlement: { findFirst: jest.fn(), update: jest.fn() },
          clubPayment: { findFirst: jest.fn().mockResolvedValue(null) },
          member: { findUnique: jest.fn() },
        };
        return fn(tx);
      }
      const writeTx = {
        clubEntitlement: { update: jest.fn() },
        clubPayment: {
          create: jest.fn().mockResolvedValue({ id: 1 }),
        },
        clubVisit: {
          create: jest.fn().mockResolvedValue(createdVisit),
        },
      };
      return fn(writeTx);
    });

    const out = await toggleVisit(10, 'MANUAL', memberContext);

    expect(out.action).toBe('CHECK_IN');
    expect(out.charged).toBe(true);
    expect(out.visit).toEqual(createdVisit);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(prisma.clubEntitlement.findUnique).not.toHaveBeenCalled();
    expect(prisma.clubVisit.create).not.toHaveBeenCalled();
  });

  it('visit pack debit derives warning from in-memory entitlement', async () => {
    const ent = monthlyEntitlement({
      id: 7,
      type: 'VISIT_PACK',
      visitsRemaining: 2,
      visitsTotal: 10,
      validTo: null,
    });
    setCachedCurrentEntitlement(10, ent);
    (getExpiryWarning as jest.Mock).mockImplementation((e: { visitsRemaining: number | null }) =>
      e.visitsRemaining === 1 ? 'Only 1 visit(s) remaining on your plan.' : null,
    );

    let transactionCalls = 0;
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (t: unknown) => unknown) => {
      transactionCalls += 1;
      if (transactionCalls === 1) {
        return fn({
          clubVisit: {
            findFirst: jest.fn().mockResolvedValue(null),
            count: jest.fn().mockResolvedValue(0),
          },
          clubEntitlement: { findFirst: jest.fn(), update: jest.fn() },
          clubPayment: { findFirst: jest.fn().mockResolvedValue(null) },
          member: { findUnique: jest.fn() },
        });
      }
      return fn({
        clubEntitlement: { update: jest.fn().mockResolvedValue({}) },
        clubPayment: { create: jest.fn().mockResolvedValue({ id: 1 }) },
        clubVisit: {
          create: jest.fn().mockResolvedValue({ id: 50, memberId: 10 }),
        },
      });
    });

    const out = await toggleVisit(10, 'MANUAL', memberContext);

    expect(out.charged).toBe(true);
    expect(out.entitlement?.visitsRemaining).toBe(1);
    expect(out.warning).toBe('Only 1 visit(s) remaining on your plan.');
    expect(getExpiryWarning).toHaveBeenCalledWith(
      expect.objectContaining({ visitsRemaining: 1, type: 'VISIT_PACK' }),
    );
  });
});
