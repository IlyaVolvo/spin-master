import { prisma } from '../index';
import { getSystemConfig } from '../services/systemConfigService';
import { sendMail } from '../services/mailService';
import { logger } from '../utils/logger';
import type { PaymentMetadata } from './types';

export type CourtesyDecision =
  | { allowed: true; basis: 'period' | 'visit_pack'; message: string }
  | { allowed: false; reason: 'suspended' | 'no_plan' | 'ppv' | 'grace_exhausted'; message: string };

/**
 * Latest entitlement for courtesy basis (including inactive/expired).
 */
async function getLatestEntitlementForCourtesy(memberId: number) {
  return prisma.clubEntitlement.findFirst({
    where: { memberId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function evaluateCourtesy(memberId: number): Promise<CourtesyDecision> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { courtesySuspended: true },
  });
  if (!member) {
    return { allowed: false, reason: 'no_plan', message: 'Member not found' };
  }
  if (member.courtesySuspended) {
    return {
      allowed: false,
      reason: 'suspended',
      message: 'Courtesy check-in is suspended for this member. Payment is required.',
    };
  }

  const entitlement = await getLatestEntitlementForCourtesy(memberId);
  if (!entitlement) {
    return {
      allowed: false,
      reason: 'no_plan',
      message: 'No plan on file. Courtesy check-in is not available.',
    };
  }

  if (entitlement.type === 'PAY_PER_VISIT_EXTERNAL') {
    return {
      allowed: false,
      reason: 'ppv',
      message: 'Pay-per-visit members cannot use courtesy check-in.',
    };
  }

  const paymentsCfg = getSystemConfig().payments;
  const now = new Date();

  if (entitlement.type === 'VISIT_PACK') {
    const graceVisits = paymentsCfg.courtesyExtraVisits;
    const courtesyUsed = await prisma.clubVisit.count({
      where: {
        memberId,
        isCourtesy: true,
        courtesyClearedAt: null,
        rejectedAt: null,
      },
    });
    // Grace applies after pack is exhausted (active false or remaining 0)
    const packExhausted =
      !entitlement.active ||
      (entitlement.visitsRemaining !== null && entitlement.visitsRemaining <= 0);
    if (!packExhausted) {
      // Still has pack — caller should use normal entitlement path
      return {
        allowed: false,
        reason: 'no_plan',
        message: 'Active visit pack covers check-in.',
      };
    }
    if (courtesyUsed >= graceVisits) {
      return {
        allowed: false,
        reason: 'grace_exhausted',
        message: `Courtesy visit limit (${graceVisits}) reached. Payment is required.`,
      };
    }
    return {
      allowed: true,
      basis: 'visit_pack',
      message: `Courtesy visit ${courtesyUsed + 1} of ${graceVisits}. Payment will be required.`,
    };
  }

  // YEARLY / MONTHLY period
  const graceDays = paymentsCfg.courtesyGraceDays;
  if (!entitlement.validTo) {
    // Period without end — if inactive, treat as needing grace from updatedAt/validFrom
    if (entitlement.active) {
      return {
        allowed: false,
        reason: 'no_plan',
        message: 'Active plan covers check-in.',
      };
    }
  } else if (entitlement.validTo > now && entitlement.active) {
    return {
      allowed: false,
      reason: 'no_plan',
      message: 'Active plan covers check-in.',
    };
  }

  const expiredAt = entitlement.validTo || entitlement.updatedAt;
  const graceEnd = new Date(expiredAt);
  graceEnd.setDate(graceEnd.getDate() + graceDays);
  if (now > graceEnd) {
    return {
      allowed: false,
      reason: 'grace_exhausted',
      message: `Courtesy period (${graceDays} days) has ended. Payment is required.`,
    };
  }

  const daysLeft = Math.ceil((graceEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return {
    allowed: true,
    basis: 'period',
    message: `Courtesy check-in (${daysLeft} day(s) of grace remaining). Payment will be required.`,
  };
}

export async function ensureCourtesyObligation(memberId: number, visitId: number) {
  let payment = await prisma.clubPayment.findFirst({
    where: { memberId, status: 'PENDING' },
    orderBy: { recordedAt: 'desc' },
  });

  if (!payment) {
    payment = await prisma.clubPayment.create({
      data: {
        memberId,
        amountCents: 0,
        purpose: 'Courtesy check-in obligation',
        status: 'PENDING',
        provider: 'manual',
        metadata: {
          kind: 'courtesy_obligation',
          visitIds: [visitId],
        } satisfies PaymentMetadata,
      },
    });
  } else {
    const meta = (payment.metadata || {}) as PaymentMetadata;
    const visitIds = Array.isArray(meta.visitIds) ? [...meta.visitIds] : [];
    if (!visitIds.includes(visitId)) visitIds.push(visitId);
    payment = await prisma.clubPayment.update({
      where: { id: payment.id },
      data: {
        metadata: { ...meta, kind: 'courtesy_obligation', visitIds },
      },
    });
  }

  await prisma.clubVisit.update({
    where: { id: visitId },
    data: { obligationPaymentId: payment.id, isCourtesy: true },
  });

  return payment;
}

export async function notifyAdminsOfCourtesy(params: {
  memberName: string;
  memberId: number;
  message: string;
}): Promise<void> {
  const cfg = getSystemConfig().payments;
  if (!cfg.notifyAdminsOnCourtesy) return;
  const emails = cfg.adminNotifyEmails.filter((e) => e && e.includes('@'));
  if (emails.length === 0) return;

  const subject = `Courtesy check-in: ${params.memberName}`;
  const text = `Member #${params.memberId} ${params.memberName} used courtesy check-in.\n${params.message}`;
  const html = `<p>Member #${params.memberId} <strong>${params.memberName}</strong> used courtesy check-in.</p><p>${params.message}</p>`;

  for (const to of emails) {
    try {
      await sendMail({ to, subject, text, html });
    } catch (err) {
      logger.warn('Failed to notify admin of courtesy check-in', {
        to,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
