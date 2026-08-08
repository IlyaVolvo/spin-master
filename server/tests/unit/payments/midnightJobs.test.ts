/**
 * Payment — midnight jobs (end / promote / auto-renew / trial notify)
 */
jest.mock('../../../src/index', () => ({
  prisma: {
    clubEntitlement: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    member: { findMany: jest.fn() },
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/payments/entitlementQueue', () => ({
  endEntitlement: jest.fn(),
  getCurrentEntitlement: jest.fn(),
  getFutureEntitlement: jest.fn(),
  refreshCurrentEntitlement: jest.fn(),
}));

jest.mock('../../../src/payments/runCheckout', () => ({
  runMemberCheckout: jest.fn(),
}));

jest.mock('../../../src/payments/getActivePaymentProvider', () => ({
  memberCanPayOnline: jest.fn(),
}));

jest.mock('../../../src/payments/memberTrial', () => ({
  notifyCompletedTrials: jest.fn(),
}));

jest.mock('../../../src/payments/eventPayment', () => ({
  expirePendingEventRegistrations: jest.fn(),
}));

import { prisma } from '../../../src/index';
import {
  endEntitlement,
  getCurrentEntitlement,
  getFutureEntitlement,
  refreshCurrentEntitlement,
} from '../../../src/payments/entitlementQueue';
import { runMemberCheckout } from '../../../src/payments/runCheckout';
import { memberCanPayOnline } from '../../../src/payments/getActivePaymentProvider';
import { notifyCompletedTrials } from '../../../src/payments/memberTrial';
import { expirePendingEventRegistrations } from '../../../src/payments/eventPayment';
import { runClubMidnightJobs } from '../../../src/payments/midnightJobs';

describe('runClubMidnightJobs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.clubEntitlement.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.member.findMany as jest.Mock).mockResolvedValue([]);
    (notifyCompletedTrials as jest.Mock).mockResolvedValue({ emailed: 0, marked: 0 });
    (prisma.clubEntitlement.update as jest.Mock).mockResolvedValue({});
    (memberCanPayOnline as jest.Mock).mockReturnValue(false);
    (expirePendingEventRegistrations as jest.Mock).mockResolvedValue(0);
  });

  it('ends expired TIME and exhausted visit packs', async () => {
    (prisma.clubEntitlement.findMany as jest.Mock).mockImplementation(async ({ where }) => {
      if (where.status === 'CURRENT') {
        return [
          {
            id: 1,
            type: 'MONTHLY',
            validTo: new Date('2020-01-01T00:00:00.000Z'),
            visitsRemaining: null,
          },
          {
            id: 2,
            type: 'VISIT_PACK',
            validTo: null,
            visitsRemaining: 0,
          },
          {
            id: 3,
            type: 'MONTHLY',
            validTo: new Date('2099-01-01T00:00:00.000Z'),
            visitsRemaining: null,
          },
        ];
      }
      return [];
    });

    const result = await runClubMidnightJobs({ clubDate: '2026-07-30' });
    expect(result.endedCurrent).toBe(2);
    expect(endEntitlement).toHaveBeenCalledWith(1);
    expect(endEntitlement).toHaveBeenCalledWith(2);
    expect(endEntitlement).not.toHaveBeenCalledWith(3);
  });

  it('promotes FUTURE when no CURRENT and start reached', async () => {
    (prisma.clubEntitlement.findMany as jest.Mock).mockImplementation(async ({ where }) => {
      if (where.status === 'FUTURE') {
        return [
          {
            id: 10,
            memberId: 5,
            type: 'MONTHLY',
            validFrom: new Date('2020-01-01T00:00:00.000Z'),
          },
        ];
      }
      return [];
    });
    (getCurrentEntitlement as jest.Mock).mockResolvedValue(null);

    const result = await runClubMidnightJobs({ clubDate: '2026-07-30' });
    expect(result.promoted).toBe(1);
    expect(prisma.clubEntitlement.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: expect.objectContaining({ status: 'CURRENT', active: true }),
    });
  });

  it('skips VISIT FUTURE while CURRENT still exists', async () => {
    (prisma.clubEntitlement.findMany as jest.Mock).mockImplementation(async ({ where }) => {
      if (where.status === 'FUTURE') {
        return [
          {
            id: 11,
            memberId: 5,
            type: 'VISIT_PACK',
            validFrom: new Date('2020-01-01T00:00:00.000Z'),
          },
        ];
      }
      return [];
    });
    (getCurrentEntitlement as jest.Mock).mockResolvedValue({ id: 99 });

    const result = await runClubMidnightJobs({ clubDate: '2026-07-30' });
    expect(result.promoted).toBe(0);
    expect(prisma.clubEntitlement.update).not.toHaveBeenCalled();
  });

  it('auto-renews when last ENDED expired previous club day', async () => {
    (prisma.member.findMany as jest.Mock).mockResolvedValue([
      {
        id: 20,
        autoRenewFamilyKey: 'monthly',
        email: 'a@ex.com',
        onlinePayConsent: true,
        paymentProviderId: 'dummy',
      },
    ]);
    (memberCanPayOnline as jest.Mock).mockReturnValue(true);
    (refreshCurrentEntitlement as jest.Mock).mockResolvedValue(null);
    (getCurrentEntitlement as jest.Mock).mockResolvedValue(null);
    (getFutureEntitlement as jest.Mock).mockResolvedValue(null);
    (prisma.clubEntitlement.findFirst as jest.Mock).mockResolvedValue({
      id: 30,
      validTo: new Date('2026-07-29T15:00:00.000Z'),
      updatedAt: new Date('2026-07-29T15:00:00.000Z'),
    });
    (runMemberCheckout as jest.Mock).mockResolvedValue({ paymentId: 1 });

    const result = await runClubMidnightJobs({ clubDate: '2026-07-30' });
    expect(result.autoRenewStarted).toBe(1);
    expect(runMemberCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        memberId: 20,
        familyKey: 'monthly',
        method: 'online',
        autoRenew: true,
        initiatedBy: 'ADMIN',
      }),
    );
  });

  it('counts auto-renew errors when online pay not fully enabled', async () => {
    (prisma.member.findMany as jest.Mock).mockResolvedValue([
      {
        id: 21,
        autoRenewFamilyKey: 'monthly',
        email: 'a@ex.com',
        onlinePayConsent: false,
        paymentProviderId: null,
      },
    ]);
    (memberCanPayOnline as jest.Mock).mockReturnValue(false);
    (refreshCurrentEntitlement as jest.Mock).mockResolvedValue(null);
    (getCurrentEntitlement as jest.Mock).mockResolvedValue(null);
    (getFutureEntitlement as jest.Mock).mockResolvedValue(null);
    (prisma.clubEntitlement.findFirst as jest.Mock).mockResolvedValue({
      id: 31,
      validTo: new Date('2026-07-29T15:00:00.000Z'),
      updatedAt: new Date('2026-07-29T15:00:00.000Z'),
    });

    const result = await runClubMidnightJobs({ clubDate: '2026-07-30' });
    expect(result.autoRenewStarted).toBe(0);
    expect(result.autoRenewErrors).toBe(1);
    expect(runMemberCheckout).not.toHaveBeenCalled();
  });

  it('invokes trial completion notify with clubDate', async () => {
    (notifyCompletedTrials as jest.Mock).mockResolvedValue({ emailed: 2, marked: 3 });
    const result = await runClubMidnightJobs({ clubDate: '2026-07-30' });
    expect(notifyCompletedTrials).toHaveBeenCalledWith('2026-07-30');
    expect(result.trialEndedEmailed).toBe(2);
    expect(result.trialEndedMarked).toBe(3);
  });
});
