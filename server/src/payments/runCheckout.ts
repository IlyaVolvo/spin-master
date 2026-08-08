import { prisma } from '../index';
import { logger } from '../utils/logger';
import { emitPaymentUpdated } from '../services/socketService';
import { getCashPaymentProvider, memberCanPayOnline, resolveMemberOnlinePaymentProvider } from './getActivePaymentProvider';
import { resolvePlanForMember, planChargeAmountCents } from './resolvePlan';
import { getFutureEntitlement, refreshCurrentEntitlement } from './entitlementQueue';
import { planAllowsMemberPurchase } from './planPurchaseRules';
import {
  isMemberInTrialPeriod,
  trialEndsOnToYmd,
  trialPlanStartYmd,
} from './memberTrial';
import { confirmPayment } from './confirmPayment';
import type {
  CheckoutProduct,
  PaymentInitiatedBy,
  PaymentMetadata,
  StartCheckoutResult,
} from './types';
import { getClubDate } from '../utils/clubDate';

export type CheckoutMethod = 'cash' | 'online';

export type RunCheckoutParams = {
  memberId: number;
  kind?: 'plan' | 'pay_per_visit';
  familyKey?: string;
  amountCents?: number;
  clubDate?: string;
  /** YYYY-MM-DD first day for a new TIME plan (CURRENT only, or FUTURE when forced). */
  startDate?: string;
  autoRenew?: boolean;
  initiatedBy: PaymentInitiatedBy;
  /** When true, skip FUTURE guard (should not be used for normal purchases). */
  skipFutureGuard?: boolean;
  /** cash = desk PENDING; online = active PSP. */
  method?: CheckoutMethod;
  /**
   * When true with method cash: confirm SUCCEEDED immediately after startCheckout
   * (admin desk on Member Plan — no PENDING queue).
   */
  confirmCashImmediately?: boolean;
};

export type RunCheckoutResult = StartCheckoutResult & {
  providerId: string;
  listAmountCents: number;
  creditAppliedCents: number;
  amountCents: number;
  method: CheckoutMethod;
};

function clubTodayYmd(): string {
  return getClubDate();
}

/**
 * Shared checkout used by HTTP route and midnight auto-renew.
 */
export async function runMemberCheckout(params: RunCheckoutParams): Promise<RunCheckoutResult> {
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
      paymentProviderId: true,
      trialEndsOn: true,
      autoRenewEnabled: true,
    },
  });

  if (!member || !member.isActive) {
    throw new Error('Member not found');
  }

  const canPayOnline = memberCanPayOnline(member);
  let method: CheckoutMethod =
    params.method === 'cash' || params.method === 'online'
      ? params.method
      : canPayOnline
        ? 'online'
        : 'cash';

  if (method === 'online') {
    if (!member.email?.trim()) {
      throw new Error('Online payment requires a member email address');
    }
    if (member.onlinePayConsent !== true) {
      throw new Error('Online payment requires member consent to pay online');
    }
    if (!member.paymentProviderId?.trim()) {
      throw new Error('Online payment requires an assigned payment service');
    }
  }

  if (!params.skipFutureGuard) {
    const future = await getFutureEntitlement(member.id);
    if (future) {
      throw new Error(
        'Member already has a future plan; purchase is blocked until it starts or is reimbursed',
      );
    }
  }

  const current = await refreshCurrentEntitlement(member.id);
  if (
    !params.skipFutureGuard &&
    !planAllowsMemberPurchase({
      hasCurrent: Boolean(current),
      hasFuture: false,
      autoRenewEnabled: Boolean(member.autoRenewEnabled),
    })
  ) {
    throw new Error('Purchase is disabled while auto-renew is enabled for the current plan');
  }

  const todayYmd = clubTodayYmd();
  const inTrial = isMemberInTrialPeriod(member.trialEndsOn, todayYmd);

  let product: CheckoutProduct;
  let listAmountCents: number;
  let purpose: string;
  let startDateForMetadata: string | undefined;
  let forceFuture = false;

  const kind = params.kind === 'pay_per_visit' ? 'pay_per_visit' : 'plan';

  if (kind === 'pay_per_visit') {
    if (inTrial) {
      throw new Error('Pay per visit is not available during a trial; purchase a future plan instead');
    }
    listAmountCents = Number(params.amountCents);
    if (!Number.isInteger(listAmountCents) || listAmountCents < 0) {
      throw new Error('amountCents is required for pay_per_visit');
    }
    const clubDate =
      typeof params.clubDate === 'string' && params.clubDate ? params.clubDate : todayYmd;
    product = { kind: 'pay_per_visit', amountCents: listAmountCents, clubDate };
    purpose = `Pay per visit ${clubDate}`;
  } else {
    const familyKey = typeof params.familyKey === 'string' ? params.familyKey.trim() : '';
    if (!familyKey) {
      throw new Error('familyKey is required');
    }
    const plan = await resolvePlanForMember(familyKey, member.segment);
    listAmountCents = planChargeAmountCents(plan);
    if (listAmountCents <= 0) {
      throw new Error('Plan price must be greater than zero');
    }
    product = {
      kind: 'plan',
      familyKey: plan.familyKey,
      planId: plan.id,
      planSegment: plan.segment,
    };
    purpose = `Plan purchase: ${plan.name} (${plan.segment})`;

    if (inTrial) {
      forceFuture = true;
      const trialStart = trialPlanStartYmd(member.trialEndsOn);
      if (!trialStart) {
        throw new Error('Trial end date is required to purchase a future plan during trial');
      }
      startDateForMetadata = trialStart;
      purpose = `${purpose} [future after trial ${trialEndsOnToYmd(member.trialEndsOn)}]`;
    } else if (plan.kind === 'TIME' && !current) {
      const startDate =
        typeof params.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.startDate.trim())
          ? params.startDate.trim()
          : todayYmd;
      if (startDate < todayYmd) {
        throw new Error('Plan start date cannot be before today');
      }
      startDateForMetadata = startDate;
    } else if (plan.kind === 'TIME' && current) {
      // FUTURE after current — validFrom set from current.validTo on confirm
      forceFuture = false;
    }
  }

  const creditAvailable = Math.max(0, member.purchaseCreditCents || 0);
  const creditAppliedCents = Math.min(creditAvailable, listAmountCents);
  const amountCents = Math.max(0, listAmountCents - creditAppliedCents);

  if (params.confirmCashImmediately) {
    if (method !== 'cash') {
      throw new Error('Immediate cash confirm requires method cash');
    }
  }

  const openCourtesy = await prisma.clubVisit.findMany({
    where: {
      memberId: member.id,
      isCourtesy: true,
      courtesyClearedAt: null,
    },
    select: { id: true },
  });

  let payment = await prisma.clubPayment.findFirst({
    where: {
      memberId: member.id,
      status: 'PENDING',
    },
    orderBy: { recordedAt: 'desc' },
  });

  const metadata: PaymentMetadata = {
    kind: params.autoRenew ? 'auto_renew' : 'checkout',
    product,
    familyKey: product.kind === 'plan' ? product.familyKey : undefined,
    planId: product.kind === 'plan' ? product.planId : undefined,
    planSegment: product.kind === 'plan' ? product.planSegment : member.segment,
    initiatedBy: params.initiatedBy,
    visitIds: openCourtesy.map((v) => v.id),
    autoRenew: params.autoRenew === true,
    creditAppliedCents,
    listAmountCents,
    paymentMethod: method,
    ...(startDateForMetadata ? { startDate: startDateForMetadata } : {}),
    ...(forceFuture ? { forceFuture: true } : {}),
  };

  if (payment) {
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
  }

  if (openCourtesy.length > 0) {
    await prisma.clubVisit.updateMany({
      where: { id: { in: openCourtesy.map((v) => v.id) } },
      data: { obligationPaymentId: payment.id },
    });
  }

  const provider =
    method === 'cash' ? getCashPaymentProvider() : resolveMemberOnlinePaymentProvider(member);
  const result = await provider.startCheckout({
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

  let confirmedImmediately = Boolean(result.confirmedImmediately);
  if (method === 'cash' && params.confirmCashImmediately && result.externalRef) {
    await confirmPayment({
      providerId: provider.id,
      externalRef: result.externalRef,
      status: 'SUCCEEDED',
      amountCents,
      raw: { confirmedImmediatelyByAdmin: true },
    });
    confirmedImmediately = true;
  }

  logger.info('Checkout started', {
    paymentId: payment.id,
    memberId: member.id,
    providerId: provider.id,
    method,
    amountCents,
    creditAppliedCents,
    forceFuture,
    confirmedImmediately,
  });

  // Notify Admin Payment Log (and waiters) — PENDING cash and confirmed checkouts.
  // Immediate cash confirm already emits SUCCEEDED via confirmPayment; emit again is fine.
  const notified = await prisma.clubPayment.findUnique({
    where: { id: payment.id },
    select: {
      id: true,
      memberId: true,
      status: true,
      amountCents: true,
      provider: true,
      purpose: true,
    },
  });
  if (notified) {
    emitPaymentUpdated(notified);
  }

  return {
    ...result,
    confirmedImmediately,
    paymentId: payment.id,
    providerId: provider.id,
    listAmountCents,
    creditAppliedCents,
    amountCents,
    method,
  };
}
