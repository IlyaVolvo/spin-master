/**
 * Payment feature — runMemberCheckout (cash/online, credit, trial FUTURE)
 */
jest.mock('../../../src/index', () => ({
  prisma: {
    member: { findUnique: jest.fn() },
    clubVisit: { findMany: jest.fn(), updateMany: jest.fn() },
    clubPayment: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/services/socketService', () => ({
  emitPaymentUpdated: jest.fn(),
}));

jest.mock('../../../src/payments/getActivePaymentProvider', () => ({
  getCashPaymentProvider: jest.fn(),
  resolveMemberOnlinePaymentProvider: jest.fn(),
  memberCanPayOnline: jest.fn(),
}));

jest.mock('../../../src/payments/resolvePlan', () => ({
  resolvePlanForMember: jest.fn(),
  planChargeAmountCents: jest.fn(),
}));

jest.mock('../../../src/payments/entitlementQueue', () => ({
  getFutureEntitlement: jest.fn(),
  refreshCurrentEntitlement: jest.fn(),
}));

jest.mock('../../../src/payments/confirmPayment', () => ({
  confirmPayment: jest.fn(),
}));

import { prisma } from '../../../src/index';
import {
  getCashPaymentProvider,
  memberCanPayOnline,
  resolveMemberOnlinePaymentProvider,
} from '../../../src/payments/getActivePaymentProvider';
import { planChargeAmountCents, resolvePlanForMember } from '../../../src/payments/resolvePlan';
import {
  getFutureEntitlement,
  refreshCurrentEntitlement,
} from '../../../src/payments/entitlementQueue';
import { confirmPayment } from '../../../src/payments/confirmPayment';
import { runMemberCheckout } from '../../../src/payments/runCheckout';

const cashProvider = {
  id: 'cash',
  startCheckout: jest.fn(),
};

const onlineProvider = {
  id: 'dummy',
  startCheckout: jest.fn(),
};

function baseMember(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    email: 'm@ex.com',
    firstName: 'Pat',
    lastName: 'Member',
    segment: 'Regular',
    isActive: true,
    purchaseCreditCents: 0,
    onlinePayConsent: false,
    paymentProviderId: null as string | null,
    trialEndsOn: null,
    autoRenewEnabled: false,
    ...overrides,
  };
}

function monthlyPlan(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    familyKey: 'monthly',
    name: 'Monthly',
    kind: 'TIME',
    segment: 'Regular',
    priceCents: 5500,
    visitCount: null,
    durationUnit: 'MONTH',
    durationValue: 1,
    ...overrides,
  };
}

describe('runMemberCheckout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCashPaymentProvider as jest.Mock).mockReturnValue(cashProvider);
    (resolveMemberOnlinePaymentProvider as jest.Mock).mockReturnValue(onlineProvider);
    (memberCanPayOnline as jest.Mock).mockImplementation(
      (m: { email?: string | null; onlinePayConsent?: boolean; paymentProviderId?: string | null }) =>
        Boolean(m.email?.trim() && m.onlinePayConsent === true && m.paymentProviderId?.trim()),
    );
    cashProvider.startCheckout.mockResolvedValue({
      paymentId: 100,
      externalRef: 'cash_100_x',
      confirmedImmediately: false,
    });
    onlineProvider.startCheckout.mockResolvedValue({
      paymentId: 100,
      externalRef: 'test_100_x',
      confirmedImmediately: true,
    });
    (getFutureEntitlement as jest.Mock).mockResolvedValue(null);
    (refreshCurrentEntitlement as jest.Mock).mockResolvedValue(null);
    (prisma.clubVisit.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.clubPayment.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.clubPayment.create as jest.Mock).mockImplementation(async ({ data }) => ({
      id: 100,
      ...data,
    }));
    (prisma.clubPayment.update as jest.Mock).mockImplementation(async ({ data }) => ({
      id: 100,
      ...data,
    }));
    (prisma.clubPayment.findUnique as jest.Mock).mockImplementation(async ({ where }) => ({
      id: where.id ?? 100,
      memberId: 10,
      status: 'PENDING',
      amountCents: 5500,
      provider: 'cash',
      purpose: 'Monthly',
    }));
    (resolvePlanForMember as jest.Mock).mockResolvedValue(monthlyPlan());
    (planChargeAmountCents as jest.Mock).mockReturnValue(5500);
    (confirmPayment as jest.Mock).mockResolvedValue({ paymentId: 100, alreadyProcessed: false });
  });

  it('rejects inactive / missing members', async () => {
    (prisma.member.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(
      runMemberCheckout({ memberId: 1, familyKey: 'monthly', initiatedBy: 'ADMIN' }),
    ).rejects.toThrow(/Member not found/);

    (prisma.member.findUnique as jest.Mock).mockResolvedValue(baseMember({ isActive: false }));
    await expect(
      runMemberCheckout({ memberId: 1, familyKey: 'monthly', initiatedBy: 'ADMIN' }),
    ).rejects.toThrow(/Member not found/);
  });

  it('defaults to cash without email consent; requires email+consent+provider for online', async () => {
    (prisma.member.findUnique as jest.Mock).mockResolvedValue(
      baseMember({ email: null, onlinePayConsent: false }),
    );
    const cash = await runMemberCheckout({
      memberId: 10,
      familyKey: 'monthly',
      initiatedBy: 'ADMIN',
    });
    expect(cash.method).toBe('cash');
    expect(getCashPaymentProvider).toHaveBeenCalled();

    (prisma.member.findUnique as jest.Mock).mockResolvedValue(
      baseMember({ email: null, onlinePayConsent: true, paymentProviderId: 'dummy' }),
    );
    await expect(
      runMemberCheckout({
        memberId: 10,
        familyKey: 'monthly',
        method: 'online',
        initiatedBy: 'MEMBER',
      }),
    ).rejects.toThrow(/email/);

    (prisma.member.findUnique as jest.Mock).mockResolvedValue(
      baseMember({ email: 'm@ex.com', onlinePayConsent: false, paymentProviderId: 'dummy' }),
    );
    await expect(
      runMemberCheckout({
        memberId: 10,
        familyKey: 'monthly',
        method: 'online',
        initiatedBy: 'MEMBER',
      }),
    ).rejects.toThrow(/consent/);

    (prisma.member.findUnique as jest.Mock).mockResolvedValue(
      baseMember({ email: 'm@ex.com', onlinePayConsent: true, paymentProviderId: null }),
    );
    await expect(
      runMemberCheckout({
        memberId: 10,
        familyKey: 'monthly',
        method: 'online',
        initiatedBy: 'MEMBER',
      }),
    ).rejects.toThrow(/assigned payment service/);
  });

  it('blocks purchase when future entitlement exists', async () => {
    (prisma.member.findUnique as jest.Mock).mockResolvedValue(baseMember());
    (getFutureEntitlement as jest.Mock).mockResolvedValue({ id: 9 });
    await expect(
      runMemberCheckout({ memberId: 10, familyKey: 'monthly', initiatedBy: 'ADMIN' }),
    ).rejects.toThrow(/future plan/);
  });

  it('blocks purchase when auto-renew is enabled on current plan', async () => {
    (prisma.member.findUnique as jest.Mock).mockResolvedValue(
      baseMember({ autoRenewEnabled: true }),
    );
    (refreshCurrentEntitlement as jest.Mock).mockResolvedValue({ id: 5 });
    await expect(
      runMemberCheckout({ memberId: 10, familyKey: 'monthly', initiatedBy: 'ADMIN' }),
    ).rejects.toThrow(/auto-renew/);
  });

  it('records listAmountCents, creditAppliedCents, and reduced cash amount', async () => {
    (prisma.member.findUnique as jest.Mock).mockResolvedValue(
      baseMember({ purchaseCreditCents: 2500, onlinePayConsent: false }),
    );

    const result = await runMemberCheckout({
      memberId: 10,
      familyKey: 'monthly',
      method: 'cash',
      initiatedBy: 'ADMIN',
      startDate: '2099-01-01',
    });

    expect(result.listAmountCents).toBe(5500);
    expect(result.creditAppliedCents).toBe(2500);
    expect(result.amountCents).toBe(3000);
    expect(result.method).toBe('cash');

    expect(prisma.clubPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amountCents: 3000,
        listAmountCents: 5500,
        creditAppliedCents: 2500,
        status: 'PENDING',
        metadata: expect.objectContaining({
          creditAppliedCents: 2500,
          listAmountCents: 5500,
          paymentMethod: 'cash',
        }),
      }),
    });
    expect(cashProvider.startCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 3000, paymentId: 100 }),
    );
  });

  it('caps credit at list price (full credit → $0 cash)', async () => {
    (prisma.member.findUnique as jest.Mock).mockResolvedValue(
      baseMember({ purchaseCreditCents: 99999 }),
    );
    const result = await runMemberCheckout({
      memberId: 10,
      familyKey: 'monthly',
      method: 'cash',
      initiatedBy: 'ADMIN',
    });
    expect(result.creditAppliedCents).toBe(5500);
    expect(result.amountCents).toBe(0);
  });

  it('updates an existing PENDING payment instead of creating another', async () => {
    (prisma.member.findUnique as jest.Mock).mockResolvedValue(baseMember());
    (prisma.clubPayment.findFirst as jest.Mock).mockResolvedValue({ id: 77, status: 'PENDING' });

    await runMemberCheckout({
      memberId: 10,
      familyKey: 'monthly',
      method: 'cash',
      initiatedBy: 'ADMIN',
    });

    expect(prisma.clubPayment.update).toHaveBeenCalledWith({
      where: { id: 77 },
      data: expect.objectContaining({
        amountCents: 5500,
        listAmountCents: 5500,
        creditAppliedCents: 0,
      }),
    });
    expect(prisma.clubPayment.create).not.toHaveBeenCalled();
  });

  it('forces FUTURE start day after trial end during trial', async () => {
    (prisma.member.findUnique as jest.Mock).mockResolvedValue(
      baseMember({
        trialEndsOn: new Date(Date.UTC(2099, 0, 10, 12, 0, 0)),
      }),
    );

    await runMemberCheckout({
      memberId: 10,
      familyKey: 'monthly',
      method: 'cash',
      initiatedBy: 'ADMIN',
    });

    expect(prisma.clubPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        purpose: expect.stringContaining('future after trial'),
        metadata: expect.objectContaining({
          forceFuture: true,
          startDate: '2099-01-11',
        }),
      }),
    });
  });

  it('rejects pay-per-visit during trial', async () => {
    (prisma.member.findUnique as jest.Mock).mockResolvedValue(
      baseMember({
        trialEndsOn: new Date(Date.UTC(2099, 0, 10, 12, 0, 0)),
      }),
    );
    await expect(
      runMemberCheckout({
        memberId: 10,
        kind: 'pay_per_visit',
        amountCents: 2000,
        method: 'cash',
        initiatedBy: 'ADMIN',
      }),
    ).rejects.toThrow(/Pay per visit is not available during a trial/);
  });

  it('rejects zero-priced plans and missing familyKey', async () => {
    (prisma.member.findUnique as jest.Mock).mockResolvedValue(baseMember());
    await expect(
      runMemberCheckout({ memberId: 10, initiatedBy: 'ADMIN' } as any),
    ).rejects.toThrow(/familyKey/);

    (planChargeAmountCents as jest.Mock).mockReturnValue(0);
    await expect(
      runMemberCheckout({ memberId: 10, familyKey: 'monthly', initiatedBy: 'ADMIN' }),
    ).rejects.toThrow(/greater than zero/);
  });

  it('uses online provider when method=online with consent and assigned service', async () => {
    (prisma.member.findUnique as jest.Mock).mockResolvedValue(
      baseMember({ onlinePayConsent: true, paymentProviderId: 'dummy' }),
    );
    const result = await runMemberCheckout({
      memberId: 10,
      familyKey: 'monthly',
      method: 'online',
      initiatedBy: 'MEMBER',
    });
    expect(result.method).toBe('online');
    expect(result.providerId).toBe('dummy');
    expect(resolveMemberOnlinePaymentProvider).toHaveBeenCalled();
    expect(getCashPaymentProvider).not.toHaveBeenCalled();
  });

  it('links open courtesy visits to the payment', async () => {
    (prisma.member.findUnique as jest.Mock).mockResolvedValue(baseMember());
    (prisma.clubVisit.findMany as jest.Mock).mockResolvedValue([{ id: 3 }, { id: 4 }]);

    await runMemberCheckout({
      memberId: 10,
      familyKey: 'monthly',
      method: 'cash',
      initiatedBy: 'ADMIN',
    });

    expect(prisma.clubVisit.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [3, 4] } },
      data: { obligationPaymentId: 100 },
    });
    expect(prisma.clubPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({ visitIds: [3, 4] }),
      }),
    });
  });

  it('confirms cash immediately when confirmCashImmediately for a current plan', async () => {
    (prisma.member.findUnique as jest.Mock).mockResolvedValue(baseMember());
    const result = await runMemberCheckout({
      memberId: 10,
      familyKey: 'monthly',
      method: 'cash',
      initiatedBy: 'ADMIN',
      confirmCashImmediately: true,
    });
    expect(result.confirmedImmediately).toBe(true);
    expect(confirmPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'cash',
        externalRef: 'cash_100_x',
        status: 'SUCCEEDED',
      }),
    );
  });

  it('confirms cash immediately for future plan when admin records desk cash', async () => {
    (prisma.member.findUnique as jest.Mock).mockResolvedValue(baseMember());
    (refreshCurrentEntitlement as jest.Mock).mockResolvedValue({ id: 5 });
    const result = await runMemberCheckout({
      memberId: 10,
      familyKey: 'monthly',
      method: 'cash',
      initiatedBy: 'ADMIN',
      confirmCashImmediately: true,
    });
    expect(result.confirmedImmediately).toBe(true);
    expect(confirmPayment).toHaveBeenCalled();
  });
});
