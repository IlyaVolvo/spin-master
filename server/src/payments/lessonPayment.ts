import { prisma } from '../index';
import { logger } from '../utils/logger';
import { getCashPaymentProvider, memberCanPayOnline, resolveMemberOnlinePaymentProvider } from './getActivePaymentProvider';
import type { CheckoutProduct, PaymentInitiatedBy, PaymentMetadata, StartCheckoutResult } from './types';
import type { CheckoutMethod } from './runCheckout';
import { confirmPayment } from './confirmPayment';
import { deliverOnlinePayLink } from './onlinePayLink';

export type LessonIndividualProduct = {
  kind: 'lesson_individual';
  lessonId: number;
  amountCents: number;
};

export type LessonGroupProduct = {
  kind: 'lesson_group';
  registrationId: number;
  occurrenceId: number;
  amountCents: number;
};

export type LessonProduct = LessonIndividualProduct | LessonGroupProduct;

function asMetadata(value: unknown): PaymentMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as PaymentMetadata;
}

function isLessonProduct(product: CheckoutProduct | undefined): product is LessonProduct {
  return Boolean(product && (product.kind === 'lesson_individual' || product.kind === 'lesson_group'));
}

export async function runLessonCheckout(params: {
  memberId: number;
  amountCents: number;
  purpose: string;
  product: LessonProduct;
  initiatedBy: PaymentInitiatedBy;
  method?: CheckoutMethod;
  attach: { individualLessonId?: number; groupRegistrationId?: number };
}): Promise<StartCheckoutResult & { paymentId: number; method: CheckoutMethod }> {
  const member = await prisma.member.findUnique({
    where: { id: params.memberId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      purchaseCreditCents: true,
      onlinePayConsent: true,
      paymentProviderId: true,
      emailPayLink: true,
    },
  });
  if (!member) throw new Error('Member not found');

  const listAmountCents = Math.max(0, Math.floor(params.amountCents));
  const canPayOnline = memberCanPayOnline(member);
  let method: CheckoutMethod =
    params.method === 'cash' || params.method === 'online'
      ? params.method
      : canPayOnline
        ? 'online'
        : 'cash';
  if (method === 'online' && (!member.email?.trim() || member.onlinePayConsent !== true || !member.paymentProviderId?.trim())) {
    method = 'cash';
  }

  const creditAvailable = Math.max(0, member.purchaseCreditCents || 0);
  const creditAppliedCents = Math.min(creditAvailable, listAmountCents);
  const amountCents = Math.max(0, listAmountCents - creditAppliedCents);
  const metadata: PaymentMetadata = {
    kind: 'checkout',
    product: params.product,
    initiatedBy: params.initiatedBy,
    creditAppliedCents,
    listAmountCents,
    paymentMethod: method,
  };

  const payment = await prisma.clubPayment.create({
    data: {
      memberId: member.id,
      amountCents,
      listAmountCents,
      creditAppliedCents,
      purpose: params.purpose,
      status: 'PENDING',
      provider: 'manual',
      metadata,
    },
  });

  if (params.attach.individualLessonId) {
    await prisma.individualLesson.update({
      where: { id: params.attach.individualLessonId },
      data: { paymentId: payment.id },
    });
  }
  if (params.attach.groupRegistrationId) {
    await prisma.groupClassRegistration.update({
      where: { id: params.attach.groupRegistrationId },
      data: { paymentId: payment.id },
    });
  }

  const provider = method === 'cash' ? getCashPaymentProvider() : resolveMemberOnlinePaymentProvider(member);
  const result = await provider.startCheckout({
    memberId: member.id,
    memberEmail: member.email,
    memberName: `${member.firstName} ${member.lastName}`.trim(),
    amountCents,
    currency: 'USD',
    purpose: params.purpose,
    product: params.product,
    initiatedBy: params.initiatedBy,
    paymentId: payment.id,
  });

  if (amountCents === 0 && method === 'cash') {
    await confirmPayment({
      providerId: provider.id,
      externalRef: result.externalRef || `lesson-credit-${payment.id}`,
      status: 'SUCCEEDED',
      amountCents: 0,
    });
  }

  if (method === 'online' && result.checkoutUrl && member.email?.trim() && amountCents > 0) {
    const forceEmail = params.initiatedBy === 'ADMIN' || member.emailPayLink === true;
    if (forceEmail) {
      await deliverOnlinePayLink({
        paymentId: payment.id,
        memberEmail: member.email.trim(),
        memberName: `${member.firstName} ${member.lastName}`.trim(),
        purpose: params.purpose,
        amountCents,
        checkoutUrl: result.checkoutUrl,
      });
    }
  }

  logger.auditInfo('Lesson payment checkout started', {
    paymentId: payment.id,
    memberId: member.id,
    kind: params.product.kind,
    amountCents,
    listAmountCents,
  });

  return { ...result, paymentId: payment.id, method };
}

export async function creditSucceededLessonPayment(paymentId: number): Promise<number> {
  const payment = await prisma.clubPayment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.status !== 'SUCCEEDED') return 0;
  const meta = asMetadata(payment.metadata);
  if (!isLessonProduct(meta.product)) return 0;
  const alreadyCredited = Math.max(0, Math.floor(Number(meta.reimbursedAsCreditCents) || 0));
  if (alreadyCredited > 0) return alreadyCredited;
  const creditCents = Math.max(0, payment.listAmountCents || 0);
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
        metadata: { ...meta, reimbursedAsCreditCents: creditCents, reimbursedAt: new Date().toISOString() },
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
          kind: 'checkout',
          originalPaymentId: payment.id,
          creditGrantedCents: creditCents,
          product: meta.product,
        },
      },
    });
  });
  return creditCents;
}

export async function cancelPendingLessonPayment(paymentId: number): Promise<void> {
  const payment = await prisma.clubPayment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.status !== 'PENDING') return;
  await prisma.clubPayment.delete({ where: { id: paymentId } }).catch(() => undefined);
}
