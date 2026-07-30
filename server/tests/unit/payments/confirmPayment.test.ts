/**
 * Payment feature — confirmPayment (clear / reject / credit / entitlement)
 */
jest.mock('../../../src/index', () => ({
  prisma: {
    clubPayment: {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    clubPlan: { findUnique: jest.fn() },
    clubEntitlement: { create: jest.fn() },
    clubVisit: { updateMany: jest.fn() },
    member: { findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/services/socketService', () => ({
  emitPaymentUpdated: jest.fn(),
}));

jest.mock('../../../src/payments/entitlementQueue', () => ({
  getCurrentEntitlement: jest.fn(),
  getFutureEntitlement: jest.fn(),
  refreshCurrentEntitlement: jest.fn(),
}));

jest.mock('../../../src/payments/paymentReceiptEmail', () => ({
  resolvePlanLabelForProduct: jest.fn().mockResolvedValue({
    planLabel: 'Monthly',
    planSegment: 'Regular',
  }),
  sendPaymentProcessedEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/utils/planDuration', () => ({
  computeValidTo: jest.fn(() => new Date('2026-09-01T12:00:00.000Z')),
}));

import { prisma } from '../../../src/index';
import { emitPaymentUpdated } from '../../../src/services/socketService';
import {
  getFutureEntitlement,
  refreshCurrentEntitlement,
} from '../../../src/payments/entitlementQueue';
import { sendPaymentProcessedEmail } from '../../../src/payments/paymentReceiptEmail';
import { confirmPayment } from '../../../src/payments/confirmPayment';

function pendingPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 50,
    memberId: 10,
    amountCents: 3000,
    listAmountCents: 5500,
    creditAppliedCents: 2500,
    status: 'PENDING',
    provider: 'cash',
    purpose: 'Plan purchase: Monthly (Regular)',
    externalRef: 'cash_50_x',
    metadata: {
      kind: 'checkout',
      product: {
        kind: 'plan',
        familyKey: 'monthly',
        planId: 1,
        planSegment: 'Regular',
      },
      familyKey: 'monthly',
      planSegment: 'Regular',
      creditAppliedCents: 2500,
      listAmountCents: 5500,
      startDate: '2026-08-01',
      forceFuture: false,
      autoRenew: false,
    },
    ...overrides,
  };
}

describe('confirmPayment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) =>
      fn({
        clubPayment: { update: prisma.clubPayment.update },
        member: { update: prisma.member.update },
        clubVisit: { updateMany: prisma.clubVisit.updateMany },
      }),
    );
    (prisma.clubPayment.update as jest.Mock).mockImplementation(async ({ data }) => ({
      ...pendingPayment(),
      ...data,
    }));
    (prisma.member.findUnique as jest.Mock).mockResolvedValue({
      segment: 'Regular',
      purchaseCreditCents: 2500,
      email: 'm@ex.com',
      firstName: 'Pat',
      lastName: 'Member',
    });
    (prisma.member.update as jest.Mock).mockResolvedValue({});
    (prisma.clubVisit.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (prisma.clubEntitlement.create as jest.Mock).mockResolvedValue({});
    (refreshCurrentEntitlement as jest.Mock).mockResolvedValue(null);
    (getFutureEntitlement as jest.Mock).mockResolvedValue(null);
    (prisma.clubPlan.findUnique as jest.Mock).mockResolvedValue({
      id: 1,
      name: 'Monthly',
      kind: 'TIME',
      segment: 'Regular',
      familyKey: 'monthly',
      durationUnit: 'MONTH',
      durationValue: 1,
      visitCount: null,
    });
  });

  it('throws when payment externalRef is unknown', async () => {
    (prisma.clubPayment.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(
      confirmPayment({
        providerId: 'cash',
        externalRef: 'missing',
        status: 'SUCCEEDED',
      }),
    ).rejects.toThrow(/No payment found/);
  });

  it('is idempotent for already SUCCEEDED / CANCELLED payments', async () => {
    (prisma.clubPayment.findFirst as jest.Mock).mockResolvedValue(
      pendingPayment({ status: 'SUCCEEDED' }),
    );
    await expect(
      confirmPayment({
        providerId: 'cash',
        externalRef: 'cash_50_x',
        status: 'SUCCEEDED',
      }),
    ).resolves.toEqual({ paymentId: 50, alreadyProcessed: true });

    (prisma.clubPayment.findFirst as jest.Mock).mockResolvedValue(
      pendingPayment({ status: 'CANCELLED' }),
    );
    await expect(
      confirmPayment({
        providerId: 'cash',
        externalRef: 'cash_50_x',
        status: 'CANCELLED',
      }),
    ).resolves.toEqual({ paymentId: 50, alreadyProcessed: true });
  });

  it('marks FAILED and emits update without granting entitlement', async () => {
    (prisma.clubPayment.findFirst as jest.Mock).mockResolvedValue(pendingPayment());
    await confirmPayment({
      providerId: 'cash',
      externalRef: 'cash_50_x',
      status: 'FAILED',
    });
    expect(prisma.clubPayment.update).toHaveBeenCalledWith({
      where: { id: 50 },
      data: { status: 'FAILED' },
    });
    expect(emitPaymentUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'FAILED', id: 50 }),
    );
    expect(prisma.clubEntitlement.create).not.toHaveBeenCalled();
  });

  it('rejects (CANCELLED) without deducting credit or granting plan', async () => {
    (prisma.clubPayment.findFirst as jest.Mock).mockResolvedValue(pendingPayment());
    await confirmPayment({
      providerId: 'cash',
      externalRef: 'cash_50_x',
      status: 'CANCELLED',
    });
    expect(prisma.clubPayment.update).toHaveBeenCalledWith({
      where: { id: 50 },
      data: { status: 'CANCELLED' },
    });
    expect(prisma.member.update).not.toHaveBeenCalled();
    expect(prisma.clubEntitlement.create).not.toHaveBeenCalled();
  });

  it('clears SUCCEEDED cash: persists credit columns, deducts credit, grants CURRENT plan', async () => {
    (prisma.clubPayment.findFirst as jest.Mock).mockResolvedValue(pendingPayment());

    const result = await confirmPayment({
      providerId: 'cash',
      externalRef: 'cash_50_x',
      status: 'SUCCEEDED',
      amountCents: 3000,
    });

    expect(result).toEqual({ paymentId: 50, alreadyProcessed: false });
    expect(prisma.clubPayment.update).toHaveBeenCalledWith({
      where: { id: 50 },
      data: expect.objectContaining({
        status: 'SUCCEEDED',
        amountCents: 3000,
        listAmountCents: 5500,
        creditAppliedCents: 2500,
        provider: 'cash',
      }),
    });
    expect(prisma.member.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { purchaseCreditCents: 0 },
    });
    expect(prisma.clubEntitlement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        memberId: 10,
        status: 'CURRENT',
        type: 'MONTHLY',
        amountPaidCents: 3000,
        validFrom: new Date('2026-08-01T12:00:00.000Z'),
      }),
    });
    expect(sendPaymentProcessedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        amountPaidCents: 3000,
        creditAppliedCents: 2500,
        listAmountCents: 5500,
      }),
    );
    expect(emitPaymentUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'SUCCEEDED', amountCents: 3000 }),
    );
  });

  it('uses column credit over metadata when both present', async () => {
    (prisma.clubPayment.findFirst as jest.Mock).mockResolvedValue(
      pendingPayment({
        creditAppliedCents: 1000,
        listAmountCents: 5500,
        amountCents: 4500,
        metadata: {
          creditAppliedCents: 9999,
          listAmountCents: 1,
          product: {
            kind: 'plan',
            familyKey: 'monthly',
            planId: 1,
            planSegment: 'Regular',
          },
        },
      }),
    );
    (prisma.member.findUnique as jest.Mock).mockResolvedValue({
      segment: 'Regular',
      purchaseCreditCents: 1000,
      email: null,
      firstName: 'Pat',
      lastName: 'Member',
    });

    await confirmPayment({
      providerId: 'cash',
      externalRef: 'cash_50_x',
      status: 'SUCCEEDED',
      amountCents: 4500,
    });

    expect(prisma.member.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { purchaseCreditCents: 0 },
    });
    expect(prisma.clubPayment.update).toHaveBeenCalledWith({
      where: { id: 50 },
      data: expect.objectContaining({
        creditAppliedCents: 1000,
        listAmountCents: 5500,
      }),
    });
    expect(sendPaymentProcessedEmail).not.toHaveBeenCalled();
  });

  it('grants FUTURE entitlement when forceFuture is set (trial purchase)', async () => {
    (prisma.clubPayment.findFirst as jest.Mock).mockResolvedValue(
      pendingPayment({
        metadata: {
          product: {
            kind: 'plan',
            familyKey: 'monthly',
            planId: 1,
            planSegment: 'Regular',
          },
          forceFuture: true,
          startDate: '2026-08-09',
          creditAppliedCents: 0,
          listAmountCents: 5500,
        },
        creditAppliedCents: 0,
        listAmountCents: 5500,
        amountCents: 5500,
      }),
    );

    await confirmPayment({
      providerId: 'cash',
      externalRef: 'cash_50_x',
      status: 'SUCCEEDED',
      amountCents: 5500,
    });

    expect(prisma.clubEntitlement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'FUTURE',
        validFrom: new Date('2026-08-09T12:00:00.000Z'),
      }),
    });
    expect(prisma.member.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { autoRenewEnabled: false, autoRenewFamilyKey: null },
    });
  });

  it('grants VISIT_PACK with visit totals on confirm', async () => {
    (prisma.clubPlan.findUnique as jest.Mock).mockResolvedValue({
      id: 4,
      name: '10 visits',
      kind: 'VISIT',
      segment: 'Regular',
      familyKey: '10-visits',
      visitCount: 10,
      durationUnit: null,
      durationValue: null,
    });
    (prisma.clubPayment.findFirst as jest.Mock).mockResolvedValue(
      pendingPayment({
        amountCents: 8500,
        listAmountCents: 8500,
        creditAppliedCents: 0,
        metadata: {
          product: {
            kind: 'plan',
            familyKey: '10-visits',
            planId: 4,
            planSegment: 'Regular',
          },
        },
      }),
    );

    await confirmPayment({
      providerId: 'cash',
      externalRef: 'cash_50_x',
      status: 'SUCCEEDED',
      amountCents: 8500,
    });

    expect(prisma.clubEntitlement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'VISIT_PACK',
        visitsRemaining: 10,
        visitsTotal: 10,
        status: 'CURRENT',
      }),
    });
  });

  it('enables auto-renew from metadata when confirming without a future plan', async () => {
    (prisma.clubPayment.findFirst as jest.Mock).mockResolvedValue(
      pendingPayment({
        creditAppliedCents: 0,
        listAmountCents: 5500,
        amountCents: 5500,
        metadata: {
          product: {
            kind: 'plan',
            familyKey: 'monthly',
            planId: 1,
            planSegment: 'Regular',
          },
          autoRenew: true,
          familyKey: 'monthly',
          creditAppliedCents: 0,
          listAmountCents: 5500,
        },
      }),
    );

    await confirmPayment({
      providerId: 'cash',
      externalRef: 'cash_50_x',
      status: 'SUCCEEDED',
      amountCents: 5500,
    });

    expect(prisma.member.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { autoRenewEnabled: true, autoRenewFamilyKey: 'monthly' },
    });
  });
});
