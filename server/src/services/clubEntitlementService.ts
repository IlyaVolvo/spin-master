import type { ClubEntitlement, ClubEntitlementType, Prisma } from '@prisma/client';
import { prisma } from '../index';

const TYPE_PRIORITY: Record<ClubEntitlementType, number> = {
  YEARLY: 0,
  MONTHLY: 1,
  VISIT_PACK: 2,
  PAY_PER_VISIT_EXTERNAL: 3,
};

function sortEntitlements(list: ClubEntitlement[]): ClubEntitlement[] {
  return [...list].sort((a, b) => TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type]);
}

function isEntitlementInEffect(e: ClubEntitlement, at: Date): boolean {
  if (!e.active) return false;
  if (at < e.validFrom) return false;
  if (e.validTo && at > e.validTo) return false;
  return true;
}

export type DailyAccessResult =
  | { ok: true; dailyPaymentApplied: boolean; paymentId?: number }
  | { ok: false; reason: 'NEEDS_PAYMENT' };

/**
 * First check-in of the club day must clear payment / entitlement.
 * Later check-ins the same day skip debits (still create a new visit row).
 */
export async function ensureDailyAccessForCheckIn(
  tx: Prisma.TransactionClient,
  memberId: number,
  clubDate: string,
  at: Date
): Promise<DailyAccessResult> {
  const paidEarlier = await tx.clubVisit.findFirst({
    where: { memberId, clubDate, dailyPaymentApplied: true },
    select: { id: true },
  });
  if (paidEarlier) {
    return { ok: true, dailyPaymentApplied: false };
  }

  const raw = await tx.clubEntitlement.findMany({
    where: { memberId, active: true },
  });
  const entitlements = sortEntitlements(raw).filter((e) => isEntitlementInEffect(e, at));

  for (const e of entitlements) {
    if (e.type === 'YEARLY' || e.type === 'MONTHLY') {
      const pay = await tx.clubPayment.create({
        data: {
          memberId,
          amountCents: 0,
          provider: 'MANUAL',
          status: 'SUCCEEDED',
          purpose: 'DAILY_CHECKIN_MEMBERSHIP',
          metadata: { entitlementId: e.id, clubDate },
        },
      });
      return { ok: true, dailyPaymentApplied: true, paymentId: pay.id };
    }
    if (e.type === 'VISIT_PACK') {
      const remaining = e.visitsRemaining ?? 0;
      if (remaining <= 0) continue;
      const upd = await tx.clubEntitlement.updateMany({
        where: { id: e.id, visitsRemaining: { gt: 0 } },
        data: { visitsRemaining: { decrement: 1 } },
      });
      if (upd.count === 0) continue;
      const pay = await tx.clubPayment.create({
        data: {
          memberId,
          amountCents: 0,
          provider: 'MANUAL',
          status: 'SUCCEEDED',
          purpose: 'VISIT_PACK_DEBIT',
          metadata: { entitlementId: e.id, clubDate },
        },
      });
      return { ok: true, dailyPaymentApplied: true, paymentId: pay.id };
    }
    if (e.type === 'PAY_PER_VISIT_EXTERNAL') {
      const candidates = await tx.clubPayment.findMany({
        where: {
          memberId,
          status: 'SUCCEEDED',
          purpose: 'PER_VISIT_DAY',
        },
        orderBy: { id: 'desc' },
        take: 20,
      });
      const manual = candidates.find((p) => {
        const m = p.metadata;
        return (
          m &&
          typeof m === 'object' &&
          !Array.isArray(m) &&
          (m as Record<string, unknown>).clubDate === clubDate
        );
      });
      if (manual) {
        return { ok: true, dailyPaymentApplied: true, paymentId: manual.id };
      }
      return { ok: false, reason: 'NEEDS_PAYMENT' };
    }
  }

  return { ok: false, reason: 'NEEDS_PAYMENT' };
}

const EXPIRY_WARN_DAYS = 14;

export async function getExpiryWarningForMember(memberId: number, at: Date = new Date()) {
  const entitlements = await prisma.clubEntitlement.findMany({
    where: { memberId, active: true, validTo: { not: null } },
  });
  let soonest: { daysRemaining: number; label: string | null; type: ClubEntitlementType } | null =
    null;

  for (const e of entitlements) {
    if (!e.validTo) continue;
    if (at > e.validTo) continue;
    const ms = e.validTo.getTime() - at.getTime();
    const daysRemaining = Math.ceil(ms / (24 * 60 * 60 * 1000));
    if (daysRemaining > EXPIRY_WARN_DAYS) continue;
    if (!soonest || daysRemaining < soonest.daysRemaining) {
      soonest = { daysRemaining, label: e.label, type: e.type };
    }
  }
  return soonest;
}
