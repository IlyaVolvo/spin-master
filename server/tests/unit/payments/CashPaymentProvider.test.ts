/**
 * Payment feature — cash desk provider
 */
jest.mock('../../../src/index', () => ({
  prisma: {
    clubPayment: {
      update: jest.fn(),
    },
  },
}));

import { prisma } from '../../../src/index';
import { CashPaymentProvider } from '../../../src/payments/providers/cash/CashPaymentProvider';

describe('CashPaymentProvider', () => {
  const provider = new CashPaymentProvider();

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.clubPayment.update as jest.Mock).mockResolvedValue({});
  });

  it('identifies as cash and is always usable/offered', () => {
    expect(provider.id).toBe('cash');
    expect(provider.displayName).toMatch(/cash/i);
    expect(provider.isUsable()).toBe(true);
    expect(provider.isOfferedForNewPayments()).toBe(true);
  });

  it('marks payment PENDING with cash provider and externalRef', async () => {
    const result = await provider.startCheckout({
      memberId: 10,
      memberEmail: null,
      memberName: 'Pat Member',
      amountCents: 3000,
      currency: 'USD',
      purpose: 'Plan purchase',
      product: { kind: 'plan', familyKey: 'monthly', planId: 1, planSegment: 'Regular' },
      initiatedBy: 'ADMIN',
      paymentId: 99,
    });

    expect(result.paymentId).toBe(99);
    expect(result.confirmedImmediately).toBe(false);
    expect(result.externalRef).toMatch(/^cash_99_/);
    expect(prisma.clubPayment.update).toHaveBeenCalledWith({
      where: { id: 99 },
      data: {
        provider: 'cash',
        externalRef: result.externalRef,
        status: 'PENDING',
        amountCents: 3000,
      },
    });
  });

  it('never auto-confirms via webhook or reconcile', async () => {
    await expect(provider.parseWebhook({} as any)).resolves.toBeNull();
    await expect(
      provider.reconcilePending({ id: 1, externalRef: 'cash_1_x', metadata: {} }),
    ).resolves.toBeNull();
  });
});
