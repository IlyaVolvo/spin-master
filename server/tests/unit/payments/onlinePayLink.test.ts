/**
 * Stripe pay-link helpers + mail-fail classification
 */
jest.mock('../../../src/index', () => ({
  prisma: {
    clubPayment: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/services/mailService', () => ({
  sendMail: jest.fn(),
  getClientBaseUrl: () => 'http://localhost:3002',
}));

jest.mock('../../../src/services/systemConfigService', () => ({
  getPaymentsConfig: () => ({
    mailFailCashEscapeDelayMinutes: 15,
  }),
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

jest.mock('../../../src/payments/getActivePaymentProvider', () => ({
  getCashPaymentProvider: jest.fn(() => ({
    id: 'cash',
    displayName: 'Cash (desk)',
  })),
}));

import { prisma } from '../../../src/index';
import { sendMail } from '../../../src/services/mailService';
import { paymentProviderRegistry } from '../../../src/payments/PaymentProviderRegistry';
import {
  classifyMailSendError,
  deliverOnlinePayLink,
  escapeOnlinePaymentToCash,
} from '../../../src/payments/onlinePayLink';

describe('classifyMailSendError', () => {
  it('marks hard rejects as irrecoverable', () => {
    expect(classifyMailSendError(new Error('550 mailbox unavailable'))).toBe('irrecoverable');
    expect(classifyMailSendError(new Error('Invalid recipient address'))).toBe('irrecoverable');
  });

  it('marks timeouts as recoverable', () => {
    expect(classifyMailSendError(new Error('SMTP timeout'))).toBe('recoverable');
    expect(classifyMailSendError(Object.assign(new Error('fail'), { code: 'ETIMEDOUT' }))).toBe(
      'recoverable',
    );
  });
});

describe('deliverOnlinePayLink', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.clubPayment.findUnique as jest.Mock).mockResolvedValue({
      id: 9,
      memberId: 1,
      status: 'PENDING',
      amountCents: 1000,
      provider: 'stripe-test',
      purpose: 'Plan',
      metadata: {},
    });
    (prisma.clubPayment.update as jest.Mock).mockResolvedValue({});
  });

  it('marks emailed success on metadata', async () => {
    (sendMail as jest.Mock).mockResolvedValue(undefined);
    const result = await deliverOnlinePayLink({
      paymentId: 9,
      memberEmail: 'a@ex.com',
      memberName: 'Ada',
      purpose: 'Monthly',
      amountCents: 2500,
      checkoutUrl: 'https://checkout.stripe.com/test',
    });
    expect(result.emailed).toBe(true);
    expect(prisma.clubPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 9 },
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            payLinkEmailedAt: expect.any(String),
          }),
        }),
      }),
    );
  });

  it('retries recoverable failures then annotates cash escape', async () => {
    (sendMail as jest.Mock)
      .mockRejectedValueOnce(new Error('ETIMEDOUT smtp'))
      .mockRejectedValueOnce(new Error('ETIMEDOUT smtp'));
    const result = await deliverOnlinePayLink({
      paymentId: 9,
      memberEmail: 'a@ex.com',
      memberName: 'Ada',
      purpose: 'Monthly',
      amountCents: 2500,
      checkoutUrl: 'https://checkout.stripe.com/test',
    });
    expect(result.emailed).toBe(false);
    expect(result.mailFailClass).toBe('recoverable');
    expect(result.cashEscapeAvailableAt).toBeTruthy();
    expect(sendMail).toHaveBeenCalledTimes(2);
  });
});

describe('escapeOnlinePaymentToCash', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('cancels Stripe session before switching to cash', async () => {
    const cancelPendingCheckout = jest.fn().mockResolvedValue(undefined);
    (paymentProviderRegistry.has as jest.Mock).mockReturnValue(true);
    (paymentProviderRegistry.get as jest.Mock).mockReturnValue({
      id: 'stripe-test',
      cancelPendingCheckout,
    });
    (prisma.clubPayment.findUnique as jest.Mock).mockResolvedValue({
      id: 11,
      memberId: 2,
      status: 'PENDING',
      amountCents: 1000,
      provider: 'stripe-test',
      externalRef: 'cs_test_abc',
      purpose: 'Monthly',
      metadata: {
        paymentMethod: 'online',
        mailFailClass: 'irrecoverable',
        cashEscapeAvailableAt: new Date(Date.now() - 1000).toISOString(),
      },
    });
    (prisma.clubPayment.update as jest.Mock).mockResolvedValue({
      id: 11,
      memberId: 2,
      status: 'PENDING',
      amountCents: 1000,
      provider: 'cash',
      purpose: 'Monthly',
    });

    const result = await escapeOnlinePaymentToCash(11);
    expect(cancelPendingCheckout).toHaveBeenCalledWith('cs_test_abc');
    expect(result.providerId).toBe('cash');
    expect(prisma.clubPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: 'cash',
          metadata: expect.objectContaining({
            paymentMethod: 'cash',
            escapedToCashAt: expect.any(String),
          }),
        }),
      }),
    );
  });
});
