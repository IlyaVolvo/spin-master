/**
 * Stripe provider unit tests (mocked Stripe SDK)
 */

const constructEvent = jest.fn();
const sessionsCreate = jest.fn();
const sessionsRetrieve = jest.fn();
const sessionsExpire = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: sessionsCreate,
        retrieve: sessionsRetrieve,
        expire: sessionsExpire,
      },
    },
    webhooks: {
      constructEvent,
    },
  }));
});

jest.mock('../../../src/index', () => ({
  prisma: {
    clubPayment: {
      update: jest.fn().mockResolvedValue({}),
    },
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import type { Request } from 'express';
import { stripeTestPaymentProvider } from '../../../src/payments/providers/stripe/StripePaymentProvider';

describe('StripeTestPaymentProvider', () => {
  const prevKey = process.env.STRIPE_SECRET_KEY;
  const prevWh = process.env.STRIPE_WEBHOOK_SECRET;
  const prevAllow = process.env.STRIPE_ALLOW_LIVE;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    delete process.env.STRIPE_ALLOW_LIVE;
  });

  afterAll(() => {
    process.env.STRIPE_SECRET_KEY = prevKey;
    process.env.STRIPE_WEBHOOK_SECRET = prevWh;
    process.env.STRIPE_ALLOW_LIVE = prevAllow;
  });

  it('is usable only with sk_test and webhook secret', () => {
    expect(stripeTestPaymentProvider.isUsable()).toBe(true);
    process.env.STRIPE_SECRET_KEY = 'sk_live_123';
    expect(stripeTestPaymentProvider.isUsable()).toBe(false);
  });

  it('startCheckout creates session and returns checkoutUrl', async () => {
    sessionsCreate.mockResolvedValue({
      id: 'cs_test_1',
      url: 'https://checkout.stripe.com/c/pay/cs_test_1',
    });
    const result = await stripeTestPaymentProvider.startCheckout({
      memberId: 1,
      memberEmail: 'a@ex.com',
      memberName: 'Ada',
      amountCents: 1500,
      currency: 'USD',
      purpose: 'Monthly',
      product: { kind: 'plan', familyKey: 'monthly', planId: 1, planSegment: 'Regular' },
      initiatedBy: 'MEMBER',
      paymentId: 42,
    });
    expect(result.externalRef).toBe('cs_test_1');
    expect(result.checkoutUrl).toContain('checkout.stripe.com');
    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        customer_email: 'a@ex.com',
        client_reference_id: '42',
        metadata: expect.objectContaining({ paymentId: '42', providerId: 'stripe-test' }),
      }),
    );
  });

  it('parseWebhook maps checkout.session.completed to SUCCEEDED', async () => {
    constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_1',
          payment_status: 'paid',
          amount_total: 1500,
          metadata: { providerId: 'stripe-test' },
        },
      },
    });
    const req = {
      headers: { 'stripe-signature': 'sig' },
      rawBody: Buffer.from('{}'),
      body: Buffer.from('{}'),
    } as unknown as Request;
    const event = await stripeTestPaymentProvider.parseWebhook(req);
    expect(event).toEqual(
      expect.objectContaining({
        providerId: 'stripe-test',
        externalRef: 'cs_test_1',
        status: 'SUCCEEDED',
        amountCents: 1500,
      }),
    );
  });

  it('reconcilePending returns SUCCEEDED when session paid', async () => {
    sessionsRetrieve.mockResolvedValue({
      payment_status: 'paid',
      status: 'complete',
      amount_total: 1500,
    });
    const event = await stripeTestPaymentProvider.reconcilePending({
      id: 1,
      externalRef: 'cs_test_1',
      metadata: null,
    });
    expect(event?.status).toBe('SUCCEEDED');
  });
});
