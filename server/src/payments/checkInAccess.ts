import { prisma } from '../index';
import type { Prisma } from '@prisma/client';
import { evaluateCourtesy, ensureCourtesyObligation, notifyAdminsOfCourtesy } from './courtesy';
import { isMemberInTrialPeriod, trialEndsOnToYmd } from './memberTrial';
import { clubLocalDayRangeUtc } from '../utils/clubDate';
import { formatCourtesyAdmissionBasis, formatTrialAdmissionBasis } from './visitAdmissionBasis';

export type CheckInEntitlement = {
  id: number;
  type: string;
  visitsRemaining: number | null;
};

export type CoveredWritePlan = {
  kind: 'covered';
  dailyPaymentApplied: true;
  entitlementId: number;
  /** Null when PPV already paid today (no ledger write). */
  paymentPurpose: string | null;
  packUpdate?: { visitsRemaining: number; ended: boolean };
};

export type FirstVisitOutcome =
  | CoveredWritePlan
  | {
      kind: 'trial';
      warning: string;
      canPay: boolean;
    }
  | {
      kind: 'courtesy';
      visitId: number;
      warning: string;
      canPay: boolean;
      paymentInProgress: boolean;
    }
  | {
      kind: 'payment_required';
      warning: string;
      canPay: boolean;
    };

type DbClient = Prisma.TransactionClient | typeof prisma;

/** Persist covered first-of-day debit / zero-amount ledger row. */
export async function applyCoveredFirstVisitWrites(
  db: DbClient,
  memberId: number,
  plan: CoveredWritePlan,
): Promise<void> {
  if (plan.packUpdate) {
    await db.clubEntitlement.update({
      where: { id: plan.entitlementId },
      data: {
        visitsRemaining: plan.packUpdate.visitsRemaining,
        ...(plan.packUpdate.ended ? { status: 'ENDED' as const, active: false } : {}),
      },
    });
  }
  if (plan.paymentPurpose) {
    await db.clubPayment.create({
      data: {
        memberId,
        amountCents: 0,
        purpose: plan.paymentPurpose,
        status: 'SUCCEEDED',
      },
    });
  }
}

/**
 * Apply first-of-day entitlement debit / trial / courtesy / payment-required.
 * Pass `deferWrites: true` to plan covered ledger/entitlement writes without executing them
 * (caller applies via `applyCoveredFirstVisitWrites` inside a transaction).
 */
export async function resolveFirstVisitOfDay(opts: {
  memberId: number;
  clubDate: string;
  entitlement: CheckInEntitlement | null;
  trialEndsOn: Date | null | undefined;
  memberEmail: string | null | undefined;
  /** When true, covered paths do not write; caller must apply CoveredWritePlan. */
  deferWrites?: boolean;
  /** Preloaded member display fields for courtesy (skips member findUnique). */
  memberName?: { firstName: string; lastName: string } | null;
}): Promise<FirstVisitOutcome> {
  const { memberId, clubDate, entitlement } = opts;
  const deferWrites = opts.deferWrites === true;
  const onTrial = isMemberInTrialPeriod(opts.trialEndsOn, clubDate);
  const canPayFromEmail = Boolean(opts.memberEmail?.trim());

  if (!entitlement) {
    if (onTrial && opts.trialEndsOn) {
      return trialOutcome(opts.trialEndsOn, canPayFromEmail);
    }
    return courtesyOrPayment(
      memberId,
      clubDate,
      'No active plan. Please purchase a plan or contact staff.',
      opts.memberEmail,
      opts.memberName,
    );
  }

  switch (entitlement.type) {
    case 'YEARLY':
    case 'MONTHLY': {
      const plan: CoveredWritePlan = {
        kind: 'covered',
        dailyPaymentApplied: true,
        entitlementId: entitlement.id,
        paymentPurpose: `Covered visit (${entitlement.type})`,
      };
      if (!deferWrites) await applyCoveredFirstVisitWrites(prisma, memberId, plan);
      return plan;
    }

    case 'VISIT_PACK': {
      if (entitlement.visitsRemaining !== null && entitlement.visitsRemaining > 0) {
        const nextRemaining = entitlement.visitsRemaining - 1;
        const plan: CoveredWritePlan = {
          kind: 'covered',
          dailyPaymentApplied: true,
          entitlementId: entitlement.id,
          paymentPurpose: `Visit pack debit (${nextRemaining} remaining)`,
          packUpdate: { visitsRemaining: nextRemaining, ended: nextRemaining <= 0 },
        };
        if (!deferWrites) await applyCoveredFirstVisitWrites(prisma, memberId, plan);
        return plan;
      }
      if (onTrial && opts.trialEndsOn) {
        return trialOutcome(opts.trialEndsOn, canPayFromEmail);
      }
      return courtesyOrPayment(
        memberId,
        clubDate,
        'Visit pack exhausted. Please purchase a new plan.',
        opts.memberEmail,
        opts.memberName,
      );
    }

    case 'PAY_PER_VISIT_EXTERNAL': {
      const todayPayment = await prisma.clubPayment.findFirst({
        where: {
          memberId,
          status: 'SUCCEEDED',
          recordedAt: clubLocalDayRangeUtc(clubDate, clubDate),
          purpose: { contains: 'per-visit' },
        },
      });
      if (!todayPayment) {
        if (onTrial && opts.trialEndsOn) {
          return trialOutcome(opts.trialEndsOn, canPayFromEmail);
        }
        return {
          kind: 'payment_required',
          warning: 'Per-visit payment required. Please pay at the front desk or start checkout.',
          canPay: canPayFromEmail,
        };
      }
      return {
        kind: 'covered',
        dailyPaymentApplied: true,
        entitlementId: entitlement.id,
        paymentPurpose: null,
      };
    }

    default:
      return courtesyOrPayment(
        memberId,
        clubDate,
        'No active plan. Please purchase a plan or contact staff.',
        opts.memberEmail,
        opts.memberName,
      );
  }
}

function trialOutcome(trialEndsOn: Date, canPay: boolean): FirstVisitOutcome {
  const endYmd = trialEndsOnToYmd(trialEndsOn);
  return {
    kind: 'trial',
    warning: endYmd ? `Trial access until ${endYmd}.` : 'Trial access.',
    canPay,
  };
}

async function courtesyOrPayment(
  memberId: number,
  clubDate: string,
  paymentRequiredMessage: string,
  memberEmail?: string | null,
  memberName?: { firstName: string; lastName: string } | null,
): Promise<FirstVisitOutcome> {
  let firstName = memberName?.firstName;
  let lastName = memberName?.lastName;
  let email = memberEmail;
  if (firstName === undefined || lastName === undefined || email === undefined) {
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { firstName: true, lastName: true, email: true },
    });
    firstName = member?.firstName;
    lastName = member?.lastName;
    email = member?.email;
  }
  const canPay = Boolean(email?.trim());

  const courtesy = await evaluateCourtesy(memberId);
  if (!courtesy.allowed) {
    return {
      kind: 'payment_required',
      warning: courtesy.message || paymentRequiredMessage,
      canPay,
    };
  }

  const visit = await prisma.clubVisit.create({
    data: {
      memberId,
      clubDate,
      dailyPaymentApplied: false,
      isCourtesy: true,
      admissionBasis: formatCourtesyAdmissionBasis(),
    },
  });
  await ensureCourtesyObligation(memberId, visit.id);

  const displayName =
    firstName != null || lastName != null
      ? `${firstName || ''} ${lastName || ''}`.trim()
      : `Member ${memberId}`;
  await notifyAdminsOfCourtesy({
    memberId,
    memberName: displayName || `Member ${memberId}`,
    message: courtesy.message,
  });

  const pending = await prisma.clubPayment.findFirst({
    where: { memberId, status: 'PENDING' },
    orderBy: { recordedAt: 'desc' },
  });

  return {
    kind: 'courtesy',
    visitId: visit.id,
    warning: courtesy.message,
    canPay,
    paymentInProgress: Boolean(pending?.externalRef),
  };
}

/** Create a free trial visit row (no entitlement debit). */
export async function createTrialVisit(memberId: number, clubDate: string) {
  return prisma.clubVisit.create({
    data: {
      memberId,
      clubDate,
      dailyPaymentApplied: false,
      isCourtesy: false,
      admissionBasis: formatTrialAdmissionBasis(),
    },
  });
}
