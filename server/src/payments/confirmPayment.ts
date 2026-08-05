import { prisma } from '../index';
import { logger } from '../utils/logger';
import { computeValidTo, type DurationUnit } from '../utils/planDuration';
import { emitPaymentUpdated } from '../services/socketService';
import {
  getCurrentEntitlement,
  getFutureEntitlement,
  refreshCurrentEntitlement,
} from './entitlementQueue';
import { invalidateCurrentEntitlement } from './checkInStateCache';
import { resolvePlanLabelForProduct, sendPaymentProcessedEmail } from './paymentReceiptEmail';
import type { ConfirmEvent, CheckoutProduct, PaymentMetadata } from './types';
import { applyEventPaymentSuccess } from './eventPayment';

function asMetadata(value: unknown): PaymentMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as PaymentMetadata;
}

async function createEntitlementFromProduct(
  memberId: number,
  product: CheckoutProduct | undefined,
  planSegmentFallback: string,
  amountPaidCents: number,
  startDateYmd?: string | null,
  forceFuture?: boolean,
): Promise<void> {
  if (!product) return;
  if (product.kind === 'event') return;

  if (product.kind === 'pay_per_visit') {
    // PPV remains out of queue redesign scope; grant CURRENT coverage marker
    const current = await refreshCurrentEntitlement(memberId);
    if (!current) {
      await prisma.clubEntitlement.create({
        data: {
          memberId,
          type: 'PAY_PER_VISIT_EXTERNAL',
          status: 'CURRENT',
          label: 'Pay per visit',
          validFrom: new Date(),
          validTo: null,
          visitsRemaining: null,
          amountPaidCents,
          active: true,
          planSegment: planSegmentFallback,
        },
      });
    }
    await prisma.clubPayment.create({
      data: {
        memberId,
        amountCents: 0,
        provider: 'manual',
        purpose: `per-visit payment for ${product.clubDate} (covered by checkout)`,
        status: 'SUCCEEDED',
        metadata: { coveredByCheckout: true },
      },
    });
    invalidateCurrentEntitlement(memberId);
    return;
  }

  const plan = await prisma.clubPlan.findUnique({ where: { id: product.planId } });
  if (!plan) {
    throw new Error(`Plan ${product.planId} not found`);
  }

  const planSegment = product.planSegment || plan.segment || planSegmentFallback;
  const familyKey = product.familyKey || plan.familyKey;

  const current = await refreshCurrentEntitlement(memberId);
  const future = await getFutureEntitlement(memberId);
  if (future) {
    throw new Error('Member already has a future entitlement; cannot grant another');
  }

  const status: 'CURRENT' | 'FUTURE' = forceFuture || current ? 'FUTURE' : 'CURRENT';

  if (plan.kind === 'VISIT') {
    const visits = Number(plan.visitCount) || 0;
    const validFrom =
      status === 'FUTURE' && startDateYmd && /^\d{4}-\d{2}-\d{2}$/.test(startDateYmd)
        ? new Date(`${startDateYmd}T12:00:00.000Z`)
        : status === 'FUTURE' && current?.validTo
          ? new Date(current.validTo)
          : new Date();
    await prisma.clubEntitlement.create({
      data: {
        memberId,
        type: 'VISIT_PACK',
        status,
        label: plan.name,
        validFrom,
        validTo: null,
        visitsRemaining: visits,
        visitsTotal: visits,
        amountPaidCents,
        familyKey,
        active: true,
        planId: plan.id,
        planSegment,
      },
    });
  } else {
    const unit = (plan.durationUnit || 'MONTH') as DurationUnit;
    const value = Number(plan.durationValue) || 1;
    let validFrom: Date;
    if (status === 'FUTURE' && startDateYmd && /^\d{4}-\d{2}-\d{2}$/.test(startDateYmd)) {
      validFrom = new Date(`${startDateYmd}T12:00:00.000Z`);
    } else if (status === 'FUTURE' && current?.validTo) {
      validFrom = new Date(current.validTo);
    } else if (status === 'CURRENT' && startDateYmd && /^\d{4}-\d{2}-\d{2}$/.test(startDateYmd)) {
      // Club-local calendar day at noon UTC (stable across DST)
      validFrom = new Date(`${startDateYmd}T12:00:00.000Z`);
    } else {
      validFrom = new Date();
    }
    const validTo = computeValidTo(validFrom, unit, value);

    await prisma.clubEntitlement.create({
      data: {
        memberId,
        type: unit === 'YEAR' ? 'YEARLY' : 'MONTHLY',
        status,
        label: plan.name,
        validFrom,
        validTo,
        visitsRemaining: null,
        amountPaidCents,
        familyKey,
        active: true,
        planId: plan.id,
        planSegment,
      },
    });
  }

  // Future plan replaces auto-renew for the current plan
  if (status === 'FUTURE') {
    await prisma.member.update({
      where: { id: memberId },
      data: { autoRenewEnabled: false, autoRenewFamilyKey: null },
    });
  }

  invalidateCurrentEntitlement(memberId);
}

/**
 * Idempotent payment confirmation: update ledger, grant entitlement, clear covered courtesy visits.
 */
export async function confirmPayment(event: ConfirmEvent): Promise<{ paymentId: number; alreadyProcessed: boolean }> {
  const payment = await prisma.clubPayment.findFirst({
    where: {
      OR: [
        { externalRef: event.externalRef, provider: event.providerId },
        { externalRef: event.externalRef },
      ],
    },
    orderBy: { recordedAt: 'desc' },
  });

  if (!payment) {
    throw new Error(`No payment found for externalRef=${event.externalRef}`);
  }

  if (payment.status === 'SUCCEEDED' || payment.status === 'CANCELLED') {
    return { paymentId: payment.id, alreadyProcessed: true };
  }

  if (event.status === 'FAILED') {
    const failed = await prisma.clubPayment.update({
      where: { id: payment.id },
      data: { status: 'FAILED' },
    });
    emitPaymentUpdated({
      id: failed.id,
      memberId: failed.memberId,
      status: failed.status,
      amountCents: failed.amountCents,
      provider: failed.provider,
      purpose: failed.purpose,
    });
    return { paymentId: payment.id, alreadyProcessed: false };
  }

  if (event.status === 'CANCELLED') {
    const cancelled = await prisma.clubPayment.update({
      where: { id: payment.id },
      data: { status: 'CANCELLED' },
    });
    emitPaymentUpdated({
      id: cancelled.id,
      memberId: cancelled.memberId,
      status: cancelled.status,
      amountCents: cancelled.amountCents,
      provider: cancelled.provider,
      purpose: cancelled.purpose,
    });
    return { paymentId: payment.id, alreadyProcessed: false };
  }

  const meta = asMetadata(payment.metadata);
  const isEventPayment =
    meta.product?.kind === 'event' || meta.kind === 'event' || meta.kind === 'event_obligation';

  const member = await prisma.member.findUnique({
    where: { id: payment.memberId },
    select: {
      segment: true,
      purchaseCreditCents: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  });

  const creditFromMeta = Math.max(0, Math.floor(Number(meta.creditAppliedCents) || 0));
  const creditApplied = Math.max(
    0,
    Number(payment.creditAppliedCents) > 0 ? payment.creditAppliedCents : creditFromMeta,
  );
  const listFromMeta =
    meta.listAmountCents != null ? Math.max(0, Math.floor(Number(meta.listAmountCents) || 0)) : null;
  const listAmountCents = Math.max(
    0,
    Number(payment.listAmountCents) > 0
      ? payment.listAmountCents
      : listFromMeta != null
        ? listFromMeta
        : (event.amountCents ?? payment.amountCents) + creditApplied,
  );
  const amountPaid = event.amountCents ?? payment.amountCents;

  await prisma.$transaction(async (tx) => {
    await tx.clubPayment.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCEEDED',
        amountCents: amountPaid,
        listAmountCents,
        creditAppliedCents: creditApplied,
        provider: event.providerId,
        externalRef: event.externalRef,
      },
    });

    if (creditApplied > 0) {
      const currentCredit = member?.purchaseCreditCents ?? 0;
      await tx.member.update({
        where: { id: payment.memberId },
        data: {
          purchaseCreditCents: Math.max(0, currentCredit - creditApplied),
        },
      });
    }

    if (!isEventPayment) {
      if (meta.autoRenew === true && meta.familyKey) {
        const futureAfter = await getFutureEntitlement(payment.memberId);
        if (!futureAfter) {
          await tx.member.update({
            where: { id: payment.memberId },
            data: {
              autoRenewEnabled: true,
              autoRenewFamilyKey: meta.familyKey,
            },
          });
        }
      }

      const now = new Date();
      await tx.clubVisit.updateMany({
        where: {
          memberId: payment.memberId,
          isCourtesy: true,
          courtesyClearedAt: null,
          OR: [{ obligationPaymentId: payment.id }, { obligationPaymentId: null }],
        },
        data: {
          courtesyClearedAt: now,
          obligationPaymentId: payment.id,
          isCourtesy: true,
        },
      });
    }
  });

  if (isEventPayment) {
    try {
      await applyEventPaymentSuccess(payment.id, meta);
    } catch (err) {
      logger.error('Failed to apply event registration after payment confirm', {
        paymentId: payment.id,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  } else {
    try {
      await createEntitlementFromProduct(
        payment.memberId,
        meta.product,
        meta.planSegment || member?.segment || 'Regular',
        amountPaid,
        meta.startDate,
        meta.forceFuture === true,
      );
    } catch (err) {
      logger.error('Failed to create entitlement after payment confirm', {
        paymentId: payment.id,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  logger.info('Payment confirmed', {
    paymentId: payment.id,
    provider: event.providerId,
    externalRef: event.externalRef,
    isEventPayment,
  });

  emitPaymentUpdated({
    id: payment.id,
    memberId: payment.memberId,
    status: 'SUCCEEDED',
    amountCents: amountPaid,
    provider: event.providerId,
    purpose: payment.purpose,
  });

  const email = member?.email?.trim();
  if (email && !isEventPayment) {
    try {
      const { planLabel, planSegment } = await resolvePlanLabelForProduct(meta.product);
      await sendPaymentProcessedEmail({
        to: email,
        memberName: `${member?.firstName || ''} ${member?.lastName || ''}`.trim() || 'Member',
        amountPaidCents: amountPaid,
        creditAppliedCents: creditApplied,
        listAmountCents,
        planLabel,
        planSegment: planSegment || meta.planSegment || member?.segment,
      });
    } catch (err) {
      logger.warn('Payment receipt email failed', {
        paymentId: payment.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { paymentId: payment.id, alreadyProcessed: false };
}

export { getCurrentEntitlement, getFutureEntitlement };
