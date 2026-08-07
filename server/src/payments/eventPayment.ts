import { prisma } from '../index';
import { logger } from '../utils/logger';
import { getActivePaymentProvider, getCashPaymentProvider } from './getActivePaymentProvider';
import type {
  CheckoutProduct,
  PaymentInitiatedBy,
  PaymentMetadata,
  StartCheckoutResult,
} from './types';
import type { CheckoutMethod, RunCheckoutResult } from './runCheckout';
import { confirmPayment } from './confirmPayment';

export const EVENT_PAYMENT_PURPOSE_PREFIX = 'Event registration:';

export type EventProduct = {
  kind: 'event';
  tournamentId: number;
  registrationId: number;
  amountCents: number;
};

function asMetadata(value: unknown): PaymentMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as PaymentMetadata;
}

function isEventProduct(product: CheckoutProduct | undefined): product is EventProduct {
  return Boolean(product && product.kind === 'event');
}

export function eventPurpose(tournamentName: string | null | undefined, tournamentId: number): string {
  const name = (tournamentName || '').trim() || `Tournament ${tournamentId}`;
  return `${EVENT_PAYMENT_PURPOSE_PREFIX} ${name}`;
}

/** Count seats held for capacity (PENDING + REGISTERED). */
export function countHeldRegistrations(
  registrations: Array<{ status: string }>,
): number {
  return registrations.filter((r) => r.status === 'PENDING' || r.status === 'REGISTERED').length;
}

export async function markRegistrationRegistered(params: {
  registrationId: number;
  paymentId: number;
}): Promise<void> {
  await prisma.tournamentRegistration.update({
    where: { id: params.registrationId },
    data: {
      status: 'REGISTERED',
      registeredAt: new Date(),
      rejectedAt: null,
      rejectionReason: null,
      eventPaymentId: params.paymentId,
    },
  });
}

/**
 * Start EVENT checkout for a PENDING registration. Does not grant club entitlements.
 * Creates/updates a PENDING ClubPayment keyed to this registration (does not reuse plan/courtesy PENDING).
 */
export async function runEventCheckout(params: {
  memberId: number;
  tournamentId: number;
  registrationId: number;
  eventPriceCents: number;
  tournamentName?: string | null;
  initiatedBy: PaymentInitiatedBy;
  method?: CheckoutMethod;
}): Promise<RunCheckoutResult> {
  const member = await prisma.member.findUnique({
    where: { id: params.memberId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      segment: true,
      isActive: true,
      purchaseCreditCents: true,
      onlinePayConsent: true,
    },
  });

  if (!member || !member.isActive) {
    throw new Error('Member not found');
  }

  const listAmountCents = Math.floor(Number(params.eventPriceCents));
  if (!Number.isInteger(listAmountCents) || listAmountCents < 0) {
    throw new Error('eventPriceCents must be a non-negative integer');
  }

  const hasEmail = Boolean(member.email?.trim());
  const hasConsent = member.onlinePayConsent === true;
  let method: CheckoutMethod =
    params.method === 'cash' || params.method === 'online'
      ? params.method
      : hasEmail && hasConsent
        ? 'online'
        : 'cash';

  if (method === 'online') {
    if (!hasEmail) {
      throw new Error('Online payment requires a member email address');
    }
    if (!hasConsent) {
      throw new Error('Online payment requires member consent to pay online');
    }
  }

  const creditAvailable = Math.max(0, member.purchaseCreditCents || 0);
  const creditAppliedCents = Math.min(creditAvailable, listAmountCents);
  const amountCents = Math.max(0, listAmountCents - creditAppliedCents);

  const product: EventProduct = {
    kind: 'event',
    tournamentId: params.tournamentId,
    registrationId: params.registrationId,
    amountCents: listAmountCents,
  };
  const purpose = eventPurpose(params.tournamentName, params.tournamentId);

  const metadata: PaymentMetadata = {
    kind: 'event',
    product,
    initiatedBy: params.initiatedBy,
    creditAppliedCents,
    listAmountCents,
    paymentMethod: method,
    tournamentId: params.tournamentId,
    registrationId: params.registrationId,
  };

  const registration = await prisma.tournamentRegistration.findUnique({
    where: { id: params.registrationId },
    select: { id: true, eventPaymentId: true, memberId: true, tournamentId: true },
  });
  if (!registration || registration.memberId !== params.memberId) {
    throw new Error('Registration not found');
  }

  let payment =
    registration.eventPaymentId != null
      ? await prisma.clubPayment.findUnique({ where: { id: registration.eventPaymentId } })
      : null;

  if (payment && payment.status === 'PENDING') {
    payment = await prisma.clubPayment.update({
      where: { id: payment.id },
      data: {
        amountCents,
        listAmountCents,
        creditAppliedCents,
        purpose,
        metadata,
      },
    });
  } else if (payment && payment.status === 'SUCCEEDED') {
    throw new Error('Event is already paid');
  } else {
    payment = await prisma.clubPayment.create({
      data: {
        memberId: member.id,
        amountCents,
        listAmountCents,
        creditAppliedCents,
        purpose,
        status: 'PENDING',
        provider: 'manual',
        metadata,
      },
    });
    await prisma.tournamentRegistration.update({
      where: { id: params.registrationId },
      data: { eventPaymentId: payment.id },
    });
  }

  const provider = method === 'cash' ? getCashPaymentProvider() : getActivePaymentProvider();
  const result: StartCheckoutResult = await provider.startCheckout({
    memberId: member.id,
    memberEmail: member.email,
    memberName: `${member.firstName} ${member.lastName}`.trim(),
    amountCents,
    currency: 'USD',
    purpose,
    product,
    initiatedBy: params.initiatedBy,
    paymentId: payment.id,
  });

  // Zero-balance (fully covered by credit): confirm immediately so registration becomes REGISTERED.
  if (amountCents === 0 && method === 'cash') {
    await confirmPayment({
      providerId: provider.id,
      externalRef: result.externalRef || `event-credit-${payment.id}`,
      status: 'SUCCEEDED',
      amountCents: 0,
    });
  }

  logger.info('Event checkout started', {
    paymentId: payment.id,
    memberId: member.id,
    tournamentId: params.tournamentId,
    registrationId: params.registrationId,
    method,
    amountCents,
  });

  return {
    ...result,
    paymentId: payment.id,
    providerId: provider.id,
    listAmountCents,
    creditAppliedCents,
    amountCents,
    method,
  };
}

/**
 * Organizer clears cash for an event PENDING payment → confirm → REGISTERED.
 */
export async function clearEventCashPayment(paymentId: number): Promise<{ paymentId: number }> {
  const payment = await prisma.clubPayment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new Error('Payment not found');
  // Zero-balance cash checkouts are confirmed inside runEventCheckout; treat SUCCEEDED as done.
  if (payment.status === 'SUCCEEDED') {
    return { paymentId: payment.id };
  }
  if (payment.status !== 'PENDING') throw new Error('Payment is not pending');
  const meta = asMetadata(payment.metadata);
  if (!isEventProduct(meta.product) && meta.kind !== 'event' && meta.kind !== 'event_obligation') {
    throw new Error('Not an event payment');
  }

  const externalRef = payment.externalRef || `cash-event-${payment.id}-${Date.now()}`;
  await prisma.clubPayment.update({
    where: { id: payment.id },
    data: { provider: 'cash', externalRef },
  });
  await confirmPayment({
    providerId: 'cash',
    externalRef,
    status: 'SUCCEEDED',
    amountCents: payment.amountCents,
  });
  return { paymentId: payment.id };
}

/**
 * Organizer clears member for event without collecting payment now:
 * REGISTERED + PENDING EVENT obligation in payment log.
 */
export async function clearEventUnpaid(params: {
  registrationId: number;
  tournamentId: number;
  memberId: number;
  eventPriceCents: number;
  tournamentName?: string | null;
}): Promise<{ paymentId: number }> {
  const listAmountCents = Math.floor(Number(params.eventPriceCents));
  if (!Number.isInteger(listAmountCents) || listAmountCents < 0) {
    throw new Error('Invalid event price');
  }

  const product: EventProduct = {
    kind: 'event',
    tournamentId: params.tournamentId,
    registrationId: params.registrationId,
    amountCents: listAmountCents,
  };
  const purpose = eventPurpose(params.tournamentName, params.tournamentId);
  const metadata: PaymentMetadata = {
    kind: 'event_obligation',
    product,
    listAmountCents,
    creditAppliedCents: 0,
    tournamentId: params.tournamentId,
    registrationId: params.registrationId,
    initiatedBy: 'ADMIN',
  };

  const payment = await prisma.clubPayment.create({
    data: {
      memberId: params.memberId,
      amountCents: listAmountCents,
      listAmountCents,
      creditAppliedCents: 0,
      purpose,
      status: 'PENDING',
      provider: 'cash',
      metadata,
    },
  });

  await markRegistrationRegistered({
    registrationId: params.registrationId,
    paymentId: payment.id,
  });

  return { paymentId: payment.id };
}

/**
 * Credit full event list price back to purchaseCreditCents.
 * Keeps the original SUCCEEDED payment on the ledger and adds a CANCELLED
 * credit row so both the payment and the cancellation are visible.
 * Call when cancelling a paid event registration or cancelling the preregistration tournament.
 */
export async function creditSucceededEventPayment(paymentId: number): Promise<number> {
  const payment = await prisma.clubPayment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.status !== 'SUCCEEDED') return 0;

  const meta = asMetadata(payment.metadata);
  if (!isEventProduct(meta.product) && meta.kind !== 'event' && meta.kind !== 'event_obligation') {
    return 0;
  }

  const alreadyCredited = Math.max(0, Math.floor(Number(meta.reimbursedAsCreditCents) || 0));
  if (alreadyCredited > 0) {
    return alreadyCredited;
  }

  const creditCents = Math.max(
    0,
    payment.listAmountCents > 0
      ? payment.listAmountCents
      : Math.floor(Number(meta.listAmountCents) || 0) ||
        (isEventProduct(meta.product) ? meta.product.amountCents : 0),
  );
  if (creditCents <= 0) return 0;

  const cancelPurpose = payment.purpose.startsWith('Cancelled:')
    ? payment.purpose
    : `Cancelled: ${payment.purpose}`;

  await prisma.$transaction(async (tx) => {
    await tx.member.update({
      where: { id: payment.memberId },
      data: { purchaseCreditCents: { increment: creditCents } },
    });
    await tx.clubPayment.update({
      where: { id: payment.id },
      data: {
        metadata: {
          ...meta,
          reimbursedAsCreditCents: creditCents,
          reimbursedAt: new Date().toISOString(),
        },
      },
    });
    await tx.clubPayment.create({
      data: {
        memberId: payment.memberId,
        amountCents: creditCents,
        listAmountCents: creditCents,
        creditAppliedCents: 0,
        provider: payment.provider || 'manual',
        status: 'CANCELLED',
        purpose: cancelPurpose,
        metadata: {
          kind: 'event_cancel_credit',
          originalPaymentId: payment.id,
          creditGrantedCents: creditCents,
          product: meta.product,
        },
      },
    });
  });

  return creditCents;
}

/**
 * Drop an unpaid PENDING event payment entirely — no CANCELLED ledger row.
 * Registration FKs are SetNull on payment delete.
 */
export async function cancelPendingEventPayment(paymentId: number): Promise<void> {
  const payment = await prisma.clubPayment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.status !== 'PENDING') return;
  const meta = asMetadata(payment.metadata);
  if (!isEventProduct(meta.product) && meta.kind !== 'event' && meta.kind !== 'event_obligation') {
    return;
  }
  await prisma.clubPayment.delete({ where: { id: payment.id } });
}

/**
 * After payment SUCCEEDED for an event product: mark registration REGISTERED (no entitlements).
 */
export async function applyEventPaymentSuccess(paymentId: number, metadata: PaymentMetadata): Promise<void> {
  const product = metadata.product;
  if (!isEventProduct(product)) return;

  await markRegistrationRegistered({
    registrationId: product.registrationId,
    paymentId,
  });
}

/**
 * Expire PENDING registrations past registrationDeadline → DECLINED; cancel unpaid payments.
 */
export async function expirePendingEventRegistrations(now = new Date()): Promise<number> {
  const overdue = await prisma.tournamentRegistration.findMany({
    where: {
      status: 'PENDING',
      tournament: {
        status: 'PRE_REGISTRATION',
        registrationDeadline: { lt: now },
      },
    },
    select: { id: true, eventPaymentId: true },
  });

  for (const row of overdue) {
    if (row.eventPaymentId != null) {
      await cancelPendingEventPayment(row.eventPaymentId);
    }
    await prisma.tournamentRegistration.update({
      where: { id: row.id },
      data: {
        status: 'DECLINED',
        rejectedAt: now,
        rejectionReason: 'Registration deadline passed without payment',
        registeredAt: null,
      },
    });
  }

  return overdue.length;
}
