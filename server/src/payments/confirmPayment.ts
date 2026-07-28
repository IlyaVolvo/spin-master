import { prisma } from '../index';
import { logger } from '../utils/logger';
import { computeValidTo, type DurationUnit } from '../utils/planDuration';
import type { ConfirmEvent, CheckoutProduct, PaymentMetadata } from './types';

function asMetadata(value: unknown): PaymentMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as PaymentMetadata;
}

async function createEntitlementFromProduct(
  memberId: number,
  product: CheckoutProduct | undefined,
  planSegmentFallback: string,
): Promise<void> {
  if (!product) return;

  // Deactivate existing active entitlements before granting new access
  await prisma.clubEntitlement.updateMany({
    where: { memberId, active: true },
    data: { active: false },
  });

  if (product.kind === 'pay_per_visit') {
    await prisma.clubEntitlement.create({
      data: {
        memberId,
        type: 'PAY_PER_VISIT_EXTERNAL',
        label: 'Pay per visit',
        validFrom: new Date(),
        validTo: null,
        visitsRemaining: null,
        active: true,
        planSegment: planSegmentFallback,
      },
    });
    // Record succeeded per-visit coverage for today (toggleVisit looks for purpose containing per-visit)
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
    return;
  }

  const plan = await prisma.clubPlan.findUnique({ where: { id: product.planId } });
  if (!plan) {
    throw new Error(`Plan ${product.planId} not found`);
  }

  const planSegment = product.planSegment || plan.segment || planSegmentFallback;

  if (plan.kind === 'VISIT') {
    const visits = Number(plan.visitCount) || 0;
    await prisma.clubEntitlement.create({
      data: {
        memberId,
        type: 'VISIT_PACK',
        label: plan.name,
        validFrom: new Date(),
        validTo: null,
        visitsRemaining: visits,
        active: true,
        planId: plan.id,
        planSegment,
      },
    });
    return;
  }

  // TIME — map to MONTHLY/YEARLY for existing toggleVisit switch
  const unit = (plan.durationUnit || 'MONTH') as DurationUnit;
  const value = Number(plan.durationValue) || 1;
  const validFrom = new Date();
  const validTo = computeValidTo(validFrom, unit, value);

  await prisma.clubEntitlement.create({
    data: {
      memberId,
      type: unit === 'YEAR' ? 'YEARLY' : 'MONTHLY',
      label: plan.name,
      validFrom,
      validTo,
      visitsRemaining: null,
      active: true,
      planId: plan.id,
      planSegment,
    },
  });
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
    await prisma.clubPayment.update({
      where: { id: payment.id },
      data: { status: 'FAILED' },
    });
    return { paymentId: payment.id, alreadyProcessed: false };
  }

  if (event.status === 'CANCELLED') {
    await prisma.clubPayment.update({
      where: { id: payment.id },
      data: { status: 'CANCELLED' },
    });
    return { paymentId: payment.id, alreadyProcessed: false };
  }

  const meta = asMetadata(payment.metadata);
  const member = await prisma.member.findUnique({
    where: { id: payment.memberId },
    select: { segment: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.clubPayment.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCEEDED',
        amountCents: event.amountCents ?? payment.amountCents,
        provider: event.providerId,
        externalRef: event.externalRef,
      },
    });

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
  });

  try {
    await createEntitlementFromProduct(
      payment.memberId,
      meta.product,
      meta.planSegment || member?.segment || 'Regular',
    );
  } catch (err) {
    logger.error('Failed to create entitlement after payment confirm', {
      paymentId: payment.id,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  logger.info('Payment confirmed', {
    paymentId: payment.id,
    provider: event.providerId,
    externalRef: event.externalRef,
  });

  return { paymentId: payment.id, alreadyProcessed: false };
}
