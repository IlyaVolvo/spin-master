/**
 * confirmPayment for EVENT products — register, no entitlement / receipt email.
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
  resolvePlanLabelForProduct: jest.fn(),
  sendPaymentProcessedEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/payments/eventPayment', () => ({
  applyEventPaymentSuccess: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '../../../src/index';
import { emitPaymentUpdated } from '../../../src/services/socketService';
import { sendPaymentProcessedEmail } from '../../../src/payments/paymentReceiptEmail';
import { applyEventPaymentSuccess } from '../../../src/payments/eventPayment';
import { confirmPayment } from '../../../src/payments/confirmPayment';

function pendingEventPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 26,
    memberId: 170,
    amountCents: 1000,
    listAmountCents: 1000,
    creditAppliedCents: 0,
    status: 'PENDING',
    provider: 'cash',
    purpose: 'Event registration: Club Championship',
    externalRef: 'cash_26_x',
    metadata: {
      kind: 'event',
      product: {
        kind: 'event',
        tournamentId: 35,
        registrationId: 9,
        amountCents: 1000,
      },
      creditAppliedCents: 0,
      listAmountCents: 1000,
      tournamentId: 35,
      registrationId: 9,
    },
    ...overrides,
  };
}

describe('confirmPayment event', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) =>
      fn({
        clubPayment: { update: prisma.clubPayment.update },
        member: { update: prisma.member.update },
        clubVisit: { updateMany: prisma.clubVisit.updateMany },
      }),
    );
    (prisma.clubPayment.findFirst as jest.Mock).mockResolvedValue(pendingEventPayment());
    (prisma.clubPayment.update as jest.Mock).mockImplementation(async ({ data }) => ({
      ...pendingEventPayment(),
      ...data,
    }));
    (prisma.member.findUnique as jest.Mock).mockResolvedValue({
      segment: 'Regular',
      purchaseCreditCents: 0,
      email: 'king.adam@gmail.com',
      firstName: 'Adam',
      lastName: 'King',
    });
  });

  it('marks SUCCEEDED, applies registration, skips entitlement and receipt email', async () => {
    const result = await confirmPayment({
      providerId: 'cash',
      externalRef: 'cash_26_x',
      status: 'SUCCEEDED',
      amountCents: 1000,
    });

    expect(result).toEqual({ paymentId: 26, alreadyProcessed: false });
    expect(applyEventPaymentSuccess).toHaveBeenCalledWith(
      26,
      expect.objectContaining({
        product: expect.objectContaining({ kind: 'event', registrationId: 9 }),
      }),
    );
    expect(prisma.clubEntitlement.create).not.toHaveBeenCalled();
    expect(sendPaymentProcessedEmail).not.toHaveBeenCalled();
    expect(emitPaymentUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 26, status: 'SUCCEEDED', amountCents: 1000 }),
    );
  });

  it('applies credit for zero-balance event payment without creating entitlement', async () => {
    (prisma.clubPayment.findFirst as jest.Mock).mockResolvedValue(
      pendingEventPayment({
        amountCents: 0,
        creditAppliedCents: 1000,
        listAmountCents: 1000,
        metadata: {
          kind: 'event',
          product: {
            kind: 'event',
            tournamentId: 35,
            registrationId: 9,
            amountCents: 1000,
          },
          creditAppliedCents: 1000,
          listAmountCents: 1000,
        },
      }),
    );
    (prisma.member.findUnique as jest.Mock).mockResolvedValue({
      segment: 'Regular',
      purchaseCreditCents: 1000,
      email: 'king.adam@gmail.com',
      firstName: 'Adam',
      lastName: 'King',
    });

    await confirmPayment({
      providerId: 'cash',
      externalRef: 'cash_26_x',
      status: 'SUCCEEDED',
      amountCents: 0,
    });

    expect(prisma.member.update).toHaveBeenCalledWith({
      where: { id: 170 },
      data: { purchaseCreditCents: 0 },
    });
    expect(applyEventPaymentSuccess).toHaveBeenCalled();
    expect(prisma.clubEntitlement.create).not.toHaveBeenCalled();
  });
});
