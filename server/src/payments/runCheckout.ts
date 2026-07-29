import { prisma } from '../index';
import { logger } from '../utils/logger';
import { getActivePaymentProvider } from './getActivePaymentProvider';
import { resolvePlanForMember, planChargeAmountCents } from './resolvePlan';
import { getFutureEntitlement, refreshCurrentEntitlement } from './entitlementQueue';
import { planAllowsMemberPurchase } from './planPurchaseRules';
import type {
  CheckoutProduct,
  PaymentInitiatedBy,
  PaymentMetadata,
  StartCheckoutResult,
} from './types';

export type RunCheckoutParams = {
  memberId: number;
  kind?: 'plan' | 'pay_per_visit';
  familyKey?: string;
  amountCents?: number;
  clubDate?: string;
  /** YYYY-MM-DD first day for a new TIME plan (CURRENT only). */
  startDate?: string;
  autoRenew?: boolean;
  initiatedBy: PaymentInitiatedBy;
  /** When true, skip FUTURE guard (should not be used for normal purchases). */
  skipFutureGuard?: boolean;
};

export type RunCheckoutResult = StartCheckoutResult & {
  providerId: string;
  listAmountCents: number;
  creditAppliedCents: number;
  amountCents: number;
};

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
    },
  });

  if (!member || !member.isActive) {
    throw new Error('Member not found');
  }

  if (!member.email || !member.email.trim()) {
    throw new Error('Member must have an email address to pay');
  }

  if (!params.skipFutureGuard) {
    const future = await getFutureEntitlement(member.id);
    if (future) {
      throw new Error('Member already has a future plan; purchase is blocked until it starts or is reimbursed');
    }
  }

  const current = await refreshCurrentEntitlement(member.id);
  const memberFlags = await prisma.member.findUnique({
    where: { id: member.id },
    select: { autoRenewEnabled: true },
  });
  if (
    !params.skipFutureGuard &&
    !planAllowsMemberPurchase({
      hasCurrent: Boolean(current),
      hasFuture: false,
      autoRenewEnabled: Boolean(memberFlags?.autoRenewEnabled),
    })
  ) {
    throw new Error('Purchase is disabled while auto-renew is enabled for the current plan');
  }

  let product: CheckoutProduct;
  let listAmountCents: number;
  let purpose: string;
  let startDateForMetadata: string | undefined;

  const kind = params.kind === 'pay_per_visit' ? 'pay_per_visit' : 'plan';

  if (kind === 'pay_per_visit') {
    listAmountCents = Number(params.amountCents);
    if (!Number.isInteger(listAmountCents) || listAmountCents < 0) {
      throw new Error('amountCents is required for pay_per_visit');
    }
    const clubDate =
      typeof params.clubDate === 'string' && params.clubDate
        ? params.clubDate
        : new Date().toLocaleDateString('en-CA', {
            timeZone: process.env.CLUB_TIMEZONE || 'UTC',
          });
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

    // New TIME CURRENT plan: selectable first day (YYYY-MM-DD), default today
    if (plan.kind === 'TIME' && !current) {
      const clubTz = process.env.CLUB_TIMEZONE || 'UTC';
      const todayYmd = new Date().toLocaleDateString('en-CA', { timeZone: clubTz });
      const startDate =
        typeof params.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.startDate.trim())
          ? params.startDate.trim()
          : todayYmd;
      if (startDate < todayYmd) {
        throw new Error('Plan start date cannot be before today');
      }
      startDateForMetadata = startDate;
    }
  }

  const creditAvailable = Math.max(0, member.purchaseCreditCents || 0);
  const creditAppliedCents = Math.min(creditAvailable, listAmountCents);
  const amountCents = Math.max(0, listAmountCents - creditAppliedCents);

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
    ...(startDateForMetadata ? { startDate: startDateForMetadata } : {}),
  };

  if (payment) {
    payment = await prisma.clubPayment.update({
      where: { id: payment.id },
      data: {
        amountCents,
        purpose,
        metadata,
      },
    });
  } else {
    payment = await prisma.clubPayment.create({
      data: {
        memberId: member.id,
        amountCents,
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

  const provider = getActivePaymentProvider();
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

  logger.info('Checkout started', {
    paymentId: payment.id,
    memberId: member.id,
    providerId: provider.id,
    amountCents,
    creditAppliedCents,
  });

  return {
    ...result,
    paymentId: payment.id,
    providerId: provider.id,
    listAmountCents,
    creditAppliedCents,
    amountCents,
  };
}
