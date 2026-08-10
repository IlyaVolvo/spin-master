/**
 * Cancel pending online payment — R1 already paid vs wipe
 */
jest.mock('../../../src/index', () => ({
  prisma: {
    clubPayment: { findUnique: jest.fn(), delete: jest.fn() },
    clubVisit: { updateMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    auditInfo: jest.fn(),
  },
}));

jest.mock('../../../src/services/socketService', () => ({
  emitPaymentUpdated: jest.fn(),
}));

jest.mock('../../../src/payments/PaymentProviderRegistry', () => ({
  paymentProviderRegistry: {
    has: jest.fn(),
    get: jest.fn(),
  },
}));

jest.mock('../../../src/payments/confirmPayment', () => ({
  confirmPayment: jest.fn(),
}));

import { prisma } from '../../../src/index';
import { paymentProviderRegistry } from '../../../src/payments/PaymentProviderRegistry';
import { confirmPayment } from '../../../src/payments/confirmPayment';
import { cancelPendingOnlinePayment } from '../../../src/payments/cancelPendingOnlinePayment';

describe('cancelPendingOnlinePayment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn) => {
      const tx = {
        clubVisit: { updateMany: jest.fn() },
        clubPayment: { delete: jest.fn() },
      };
      return fn(tx);
    });
  });

  it('confirms when session already paid (R1)', async () => {
    (prisma.clubPayment.findUnique as jest.Mock).mockResolvedValue({
      id: 5,
      memberId: 10,
      status: 'PENDING',
      provider: 'stripe-test',
      externalRef: 'cs_paid',
      amountCents: 1000,
      purpose: 'Plan',
      metadata: { paymentMethod: 'online' },
    });
    (paymentProviderRegistry.has as jest.Mock).mockReturnValue(true);
    (paymentProviderRegistry.get as jest.Mock).mockReturnValue({
      reconcilePending: jest.fn().mockResolvedValue({
        providerId: 'stripe-test',
        externalRef: 'cs_paid',
        status: 'SUCCEEDED',
        amountCents: 1000,
      }),
      cancelPendingCheckout: jest.fn(),
    });
    (confirmPayment as jest.Mock).mockResolvedValue({ paymentId: 5, alreadyProcessed: false });

    const result = await cancelPendingOnlinePayment({
      paymentId: 5,
      actorMemberId: 10,
      asAdmin: false,
    });
    expect(result.outcome).toBe('already_paid');
    expect(confirmPayment).toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('wipes pending when unpaid', async () => {
    (prisma.clubPayment.findUnique as jest.Mock).mockResolvedValue({
      id: 5,
      memberId: 10,
      status: 'PENDING',
      provider: 'stripe-test',
      externalRef: 'cs_open',
      amountCents: 1000,
      purpose: 'Plan',
      metadata: { paymentMethod: 'online' },
    });
    (paymentProviderRegistry.has as jest.Mock).mockReturnValue(true);
    const cancelPendingCheckout = jest.fn().mockResolvedValue(undefined);
    (paymentProviderRegistry.get as jest.Mock).mockReturnValue({
      reconcilePending: jest.fn().mockResolvedValue(null),
      cancelPendingCheckout,
    });

    const result = await cancelPendingOnlinePayment({
      paymentId: 5,
      actorMemberId: 1,
      asAdmin: true,
    });
    expect(result.outcome).toBe('wiped');
    expect(cancelPendingCheckout).toHaveBeenCalledWith('cs_open');
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
