import type { Request } from 'express';
import { prisma } from '../../../index';
import { logger } from '../../../utils/logger';
import type {
  ConfirmEvent,
  PaymentProvider,
  PaymentProviderEnvironment,
  StartCheckoutInput,
  StartCheckoutResult,
} from '../../types';
import {
  getClientBaseUrl,
  getStripeClient,
  getStripeWebhookSecret,
  resolveStripeSecretKey,
} from './stripeClient';

type StripeVariant = {
  id: 'stripe-test' | 'stripe';
  displayName: string;
  environment: PaymentProviderEnvironment;
  requiredKeyMode: 'test' | 'live';
};

/**
 * Shared Stripe Checkout + webhook implementation.
 * Thin wrappers differ only by id / environment / key mode gate.
 */
export function createStripePaymentProvider(variant: StripeVariant): PaymentProvider {
  return {
    id: variant.id,
    displayName: variant.displayName,
    environment: variant.environment,

    isUsable(): boolean {
      const resolved = resolveStripeSecretKey();
      if (!resolved) return false;
      if (resolved.mode !== variant.requiredKeyMode) return false;
      if (!getStripeWebhookSecret()) return false;
      return true;
    },

    isOfferedForNewPayments(): boolean {
      return this.isUsable();
    },

    async startCheckout(input: StartCheckoutInput): Promise<StartCheckoutResult> {
      const stripe = getStripeClient();
      if (!stripe) {
        throw new Error('Stripe is not configured');
      }
      const resolved = resolveStripeSecretKey();
      if (!resolved || resolved.mode !== variant.requiredKeyMode) {
        throw new Error(`${variant.displayName} is not available with the current Stripe keys`);
      }
      if (!input.memberEmail?.trim()) {
        throw new Error('Online Stripe checkout requires a member email');
      }

      const base = getClientBaseUrl();
      const successUrl = `${base}/payment-return?status=success&paymentId=${input.paymentId}`;
      const cancelUrl = `${base}/payment-return?status=cancel&paymentId=${input.paymentId}`;
      const currency = (input.currency || 'USD').toLowerCase();
      const amount = Math.max(0, Math.floor(input.amountCents));

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: input.memberEmail.trim(),
        client_reference_id: String(input.paymentId),
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency,
              unit_amount: amount,
              product_data: {
                name: input.purpose || 'Club payment',
              },
            },
          },
        ],
        metadata: {
          paymentId: String(input.paymentId),
          memberId: String(input.memberId),
          providerId: variant.id,
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });

      const externalRef = session.id;
      if (!externalRef) {
        throw new Error('Stripe did not return a Checkout Session id');
      }
      const checkoutUrl = session.url || undefined;

      await prisma.clubPayment.update({
        where: { id: input.paymentId },
        data: {
          provider: variant.id,
          externalRef,
          status: 'PENDING',
          amountCents: amount,
        },
      });

      logger.info('Stripe Checkout Session created', {
        providerId: variant.id,
        paymentId: input.paymentId,
        externalRef,
        hasCheckoutUrl: Boolean(checkoutUrl),
      });

      return {
        paymentId: input.paymentId,
        externalRef,
        checkoutUrl,
        instructions: 'Pay via the link emailed to you.',
        confirmedImmediately: false,
      };
    },

    async parseWebhook(req: Request): Promise<ConfirmEvent | null> {
      const stripe = getStripeClient();
      const secret = getStripeWebhookSecret();
      if (!stripe || !secret) {
        throw new Error('Stripe webhook is not configured');
      }

      const signature = req.headers['stripe-signature'];
      if (typeof signature !== 'string' || !signature) {
        throw new Error('Missing Stripe-Signature header');
      }

      const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
      if (!rawBody || !Buffer.isBuffer(rawBody)) {
        throw new Error('Stripe webhook requires raw body');
      }

      const event = stripe.webhooks.constructEvent(rawBody, signature, secret);

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as {
          id?: string;
          payment_status?: string;
          amount_total?: number | null;
          metadata?: { providerId?: string; paymentId?: string };
        };
        const externalRef = session.id;
        if (!externalRef) return null;
        // Ignore events for the other Stripe twin if metadata mismatches.
        const metaProvider = session.metadata?.providerId;
        if (metaProvider && metaProvider !== variant.id) {
          return null;
        }
        if (session.payment_status && session.payment_status !== 'paid') {
          return {
            providerId: variant.id,
            externalRef,
            status: 'FAILED',
            amountCents:
              typeof session.amount_total === 'number' ? session.amount_total : undefined,
            raw: event,
          };
        }
        return {
          providerId: variant.id,
          externalRef,
          status: 'SUCCEEDED',
          amountCents: typeof session.amount_total === 'number' ? session.amount_total : undefined,
          raw: event,
        };
      }

      if (event.type === 'checkout.session.expired') {
        const session = event.data.object as {
          id?: string;
          metadata?: { providerId?: string };
          amount_total?: number | null;
        };
        const externalRef = session.id;
        if (!externalRef) return null;
        const metaProvider = session.metadata?.providerId;
        if (metaProvider && metaProvider !== variant.id) {
          return null;
        }
        return {
          providerId: variant.id,
          externalRef,
          status: 'CANCELLED',
          amountCents: typeof session.amount_total === 'number' ? session.amount_total : undefined,
          raw: event,
        };
      }

      // Acknowledge other events without confirming.
      return null;
    },

    async reconcilePending(payment: {
      id: number;
      externalRef: string | null;
      metadata: unknown;
    }): Promise<ConfirmEvent | null> {
      if (!payment.externalRef) return null;
      const stripe = getStripeClient();
      if (!stripe) return null;
      try {
        const session = await stripe.checkout.sessions.retrieve(payment.externalRef);
        if (session.payment_status === 'paid' || session.status === 'complete') {
          return {
            providerId: variant.id,
            externalRef: payment.externalRef,
            status: 'SUCCEEDED',
            amountCents:
              typeof session.amount_total === 'number' ? session.amount_total : undefined,
            raw: session,
          };
        }
        if (session.status === 'expired') {
          return {
            providerId: variant.id,
            externalRef: payment.externalRef,
            status: 'CANCELLED',
            raw: session,
          };
        }
        return null;
      } catch (err) {
        logger.warn('Stripe reconcile failed', {
          paymentId: payment.id,
          externalRef: payment.externalRef,
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
    },

    async cancelPendingCheckout(externalRef: string): Promise<void> {
      const stripe = getStripeClient();
      if (!stripe) {
        throw new Error('Stripe is not configured');
      }
      try {
        await stripe.checkout.sessions.expire(externalRef);
      } catch (err) {
        // Already paid/expired is acceptable for cash-escape preconditions.
        const message = err instanceof Error ? err.message : String(err);
        if (/already|expired|complete/i.test(message)) {
          logger.info('Stripe session expire skipped', { externalRef, message });
          return;
        }
        throw err;
      }
    },
  };
}

export const stripeTestPaymentProvider = createStripePaymentProvider({
  id: 'stripe-test',
  displayName: 'Stripe (test)',
  environment: 'testing',
  requiredKeyMode: 'test',
});

export const stripeLivePaymentProvider = createStripePaymentProvider({
  id: 'stripe',
  displayName: 'Stripe',
  environment: 'production',
  requiredKeyMode: 'live',
});
