import { prisma } from '../index';
import { logger } from '../utils/logger';
import { emitPaymentUpdated } from '../services/socketService';
import { paymentProviderRegistry } from './PaymentProviderRegistry';
import { confirmPayment } from './confirmPayment';

export type CancelPendingOnlinePaymentResult =
  | { outcome: 'wiped'; paymentId: number; memberId: number }
  | { outcome: 'already_paid'; paymentId: number; memberId: number };

/**
 * Member or Admin cancel of an online PENDING payment:
 * R1 — if PSP session already paid, confirm (payment wins).
 * Else expire session, hard-delete PENDING, unlink courtesy obligations on that payment.
 */
export async function cancelPendingOnlinePayment(opts: {
  paymentId: number;
  actorMemberId: number;
  /** When true, actor may cancel any member's PENDING online payment. */
  asAdmin: boolean;
}): Promise<CancelPendingOnlinePaymentResult> {
  const payment = await prisma.clubPayment.findUnique({
    where: { id: opts.paymentId },
  });
  if (!payment) {
    throw new Error('Payment not found');
  }
  if (payment.status !== 'PENDING') {
    throw new Error('Only pending payments can be cancelled');
  }
  if (!opts.asAdmin && payment.memberId !== opts.actorMemberId) {
    throw new Error('Forbidden');
  }

  const meta =
    payment.metadata && typeof payment.metadata === 'object' && !Array.isArray(payment.metadata)
      ? (payment.metadata as Record<string, unknown>)
      : {};
  const paymentMethod = meta.paymentMethod;
  if (payment.provider === 'cash' || paymentMethod === 'cash') {
    throw new Error('Use desk clear/write-off for cash payments');
  }

  // R1: if provider reports paid, confirm instead of wiping.
  if (payment.externalRef && paymentProviderRegistry.has(payment.provider)) {
    const provider = paymentProviderRegistry.get(payment.provider);
    const reconciled = await provider.reconcilePending({
      id: payment.id,
      externalRef: payment.externalRef,
      metadata: payment.metadata,
    });
    if (reconciled?.status === 'SUCCEEDED') {
      const confirmed = await confirmPayment(reconciled);
      logger.auditInfo('Payment cancel aborted — already paid', {
        paymentId: payment.id,
        memberId: payment.memberId,
        actorMemberId: opts.actorMemberId,
        externalRef: payment.externalRef,
      });
      return {
        outcome: 'already_paid',
        paymentId: confirmed.paymentId,
        memberId: payment.memberId,
      };
    }
    if (provider.cancelPendingCheckout && payment.externalRef) {
      try {
        await provider.cancelPendingCheckout(payment.externalRef);
      } catch (err) {
        // Re-check paid in case of race during expire.
        const again = await provider.reconcilePending({
          id: payment.id,
          externalRef: payment.externalRef,
          metadata: payment.metadata,
        });
        if (again?.status === 'SUCCEEDED') {
          const confirmed = await confirmPayment(again);
          return {
            outcome: 'already_paid',
            paymentId: confirmed.paymentId,
            memberId: payment.memberId,
          };
        }
        logger.warn('Cancel pending checkout expire failed', {
          paymentId: payment.id,
          externalRef: payment.externalRef,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const snapshot = {
    id: payment.id,
    memberId: payment.memberId,
    amountCents: payment.amountCents,
    provider: payment.provider,
    purpose: payment.purpose,
    externalRef: payment.externalRef,
  };

  await prisma.$transaction(async (tx) => {
    await tx.clubVisit.updateMany({
      where: { obligationPaymentId: payment.id },
      data: { obligationPaymentId: null },
    });
    await tx.clubPayment.delete({ where: { id: payment.id } });
  });

  logger.auditInfo('Payment cancelled wiped', {
    paymentId: snapshot.id,
    memberId: snapshot.memberId,
    actorMemberId: opts.actorMemberId,
    provider: snapshot.provider,
    externalRef: snapshot.externalRef,
    amountCents: snapshot.amountCents,
    purpose: snapshot.purpose,
    status: 'CANCELLED',
    removed: true,
  });

  emitPaymentUpdated({
    id: snapshot.id,
    memberId: snapshot.memberId,
    status: 'CANCELLED',
    amountCents: snapshot.amountCents,
    provider: snapshot.provider,
    purpose: snapshot.purpose,
  });

  return {
    outcome: 'wiped',
    paymentId: snapshot.id,
    memberId: snapshot.memberId,
  };
}
