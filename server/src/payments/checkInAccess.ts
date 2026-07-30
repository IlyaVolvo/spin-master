import { prisma } from '../index';
import { evaluateCourtesy, ensureCourtesyObligation, notifyAdminsOfCourtesy } from './courtesy';
import { isMemberInTrialPeriod, trialEndsOnToYmd } from './memberTrial';

export type CheckInEntitlement = {
  id: number;
  type: string;
  visitsRemaining: number | null;
};

export type FirstVisitOutcome =
  | {
      kind: 'covered';
      dailyPaymentApplied: true;
      entitlementId: number;
    }
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

/**
 * Apply first-of-day entitlement debit / trial / courtesy / payment-required.
 * Extracted for unit testing; used by club toggleVisit.
 */
export async function resolveFirstVisitOfDay(opts: {
  memberId: number;
  clubDate: string;
  entitlement: CheckInEntitlement | null;
  trialEndsOn: Date | null | undefined;
  memberEmail: string | null | undefined;
}): Promise<FirstVisitOutcome> {
  const { memberId, clubDate, entitlement } = opts;
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
    );
  }

  switch (entitlement.type) {
    case 'YEARLY':
    case 'MONTHLY': {
      await prisma.clubPayment.create({
        data: {
          memberId,
          amountCents: 0,
          purpose: `Covered visit (${entitlement.type})`,
          status: 'SUCCEEDED',
        },
      });
      return { kind: 'covered', dailyPaymentApplied: true, entitlementId: entitlement.id };
    }

    case 'VISIT_PACK': {
      if (entitlement.visitsRemaining !== null && entitlement.visitsRemaining > 0) {
        const nextRemaining = entitlement.visitsRemaining - 1;
        await prisma.clubEntitlement.update({
          where: { id: entitlement.id },
          data: {
            visitsRemaining: nextRemaining,
            ...(nextRemaining <= 0 ? { status: 'ENDED', active: false } : {}),
          },
        });
        await prisma.clubPayment.create({
          data: {
            memberId,
            amountCents: 0,
            purpose: `Visit pack debit (${nextRemaining} remaining)`,
            status: 'SUCCEEDED',
          },
        });
        return { kind: 'covered', dailyPaymentApplied: true, entitlementId: entitlement.id };
      }
      if (onTrial && opts.trialEndsOn) {
        return trialOutcome(opts.trialEndsOn, canPayFromEmail);
      }
      return courtesyOrPayment(
        memberId,
        clubDate,
        'Visit pack exhausted. Please purchase a new plan.',
      );
    }

    case 'PAY_PER_VISIT_EXTERNAL': {
      const todayPayment = await prisma.clubPayment.findFirst({
        where: {
          memberId,
          status: 'SUCCEEDED',
          recordedAt: {
            gte: new Date(clubDate + 'T00:00:00'),
          },
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
      return { kind: 'covered', dailyPaymentApplied: true, entitlementId: entitlement.id };
    }

    default:
      return courtesyOrPayment(
        memberId,
        clubDate,
        'No active plan. Please purchase a plan or contact staff.',
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
): Promise<FirstVisitOutcome> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { firstName: true, lastName: true, email: true },
  });
  const canPay = Boolean(member?.email);

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
    },
  });
  await ensureCourtesyObligation(memberId, visit.id);

  const memberName = member ? `${member.firstName} ${member.lastName}`.trim() : `Member ${memberId}`;
  await notifyAdminsOfCourtesy({
    memberId,
    memberName,
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
    },
  });
}
