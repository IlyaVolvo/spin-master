import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { prisma } from '../../../index';
import type {
  ConfirmEvent,
  PaymentProvider,
  StartCheckoutInput,
  StartCheckoutResult,
} from '../../types';

/**
 * Cash (desk) provider: leaves payment PENDING until an Admin clears it.
 * Never auto-confirms; not selected as the active online PSP.
 */
export class CashPaymentProvider implements PaymentProvider {
  readonly id = 'cash';
  readonly displayName = 'Cash (desk)';

  isUsable(): boolean {
    return true;
  }

  isOfferedForNewPayments(): boolean {
    return true;
  }

  async startCheckout(input: StartCheckoutInput): Promise<StartCheckoutResult> {
    const externalRef = input.externalRef || `cash_${input.paymentId}_${randomUUID()}`;

    await prisma.clubPayment.update({
      where: { id: input.paymentId },
      data: {
        provider: this.id,
        externalRef,
        status: 'PENDING',
        amountCents: input.amountCents,
      },
    });

    return {
      paymentId: input.paymentId,
      externalRef,
      instructions: 'Cash payment pending — awaiting admin confirmation.',
      confirmedImmediately: false,
    };
  }

  async parseWebhook(_req: Request): Promise<ConfirmEvent | null> {
    return null;
  }

  async reconcilePending(_payment: {
    id: number;
    externalRef: string | null;
    metadata: unknown;
  }): Promise<ConfirmEvent | null> {
    // Admin must clear cash payments explicitly
    return null;
  }
}
