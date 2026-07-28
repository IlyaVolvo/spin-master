import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { prisma } from '../../../index';
import { confirmPayment } from '../../confirmPayment';
import { logger } from '../../../utils/logger';
import { sendMail } from '../../../services/mailService';
import type {
  ConfirmEvent,
  PaymentProvider,
  StartCheckoutInput,
  StartCheckoutResult,
} from '../../types';

/**
 * Test (dev) provider: creates checkout then immediately confirms via shared handler.
 * Optional member email is best-effort and not required for success.
 */
export class TestPaymentProvider implements PaymentProvider {
  readonly id = 'test';
  readonly displayName = 'Test (dev)';

  isUsable(): boolean {
    return true;
  }

  isOfferedForNewPayments(): boolean {
    return true;
  }

  async startCheckout(input: StartCheckoutInput): Promise<StartCheckoutResult> {
    const externalRef = input.externalRef || `test_${input.paymentId}_${randomUUID()}`;

    await prisma.clubPayment.update({
      where: { id: input.paymentId },
      data: {
        provider: this.id,
        externalRef,
        status: 'PENDING',
        amountCents: input.amountCents,
      },
    });

    if (input.memberEmail) {
      try {
        await sendMail({
          to: input.memberEmail,
          subject: 'Test payment completed',
          text: `Your test payment for ${input.purpose} (${input.amountCents} cents) was confirmed.`,
          html: `<p>Your test payment for <strong>${input.purpose}</strong> (${input.amountCents} cents) was confirmed.</p>`,
        });
      } catch (err) {
        logger.warn('Test provider: optional member email failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await confirmPayment({
      providerId: this.id,
      externalRef,
      status: 'SUCCEEDED',
      amountCents: input.amountCents,
    });

    return {
      paymentId: input.paymentId,
      externalRef,
      instructions: 'Test payment confirmed immediately.',
      confirmedImmediately: true,
    };
  }

  async parseWebhook(req: Request): Promise<ConfirmEvent | null> {
    const body = req.body || {};
    const externalRef = typeof body.externalRef === 'string' ? body.externalRef : null;
    const status =
      body.status === 'SUCCEEDED' || body.status === 'FAILED' || body.status === 'CANCELLED'
        ? body.status
        : null;
    if (!externalRef || !status) return null;
    return {
      providerId: this.id,
      externalRef,
      status,
      amountCents: typeof body.amountCents === 'number' ? body.amountCents : undefined,
      raw: body,
    };
  }

  async reconcilePending(payment: {
    id: number;
    externalRef: string | null;
    metadata: unknown;
  }): Promise<ConfirmEvent | null> {
    if (!payment.externalRef) return null;
    return {
      providerId: this.id,
      externalRef: payment.externalRef,
      status: 'SUCCEEDED',
    };
  }
}
