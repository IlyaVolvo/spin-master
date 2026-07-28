import { prisma } from '../index';
import type { ClubEntitlement, ClubEntitlementStatus } from '@prisma/client';

export async function getEntitlementByStatus(
  memberId: number,
  status: ClubEntitlementStatus,
): Promise<ClubEntitlement | null> {
  return prisma.clubEntitlement.findFirst({
    where: { memberId, status },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getCurrentEntitlement(memberId: number): Promise<ClubEntitlement | null> {
  return getEntitlementByStatus(memberId, 'CURRENT');
}

export async function getFutureEntitlement(memberId: number): Promise<ClubEntitlement | null> {
  return getEntitlementByStatus(memberId, 'FUTURE');
}

/** Mark entitlement ENDED and inactive. */
export async function endEntitlement(id: number): Promise<void> {
  await prisma.clubEntitlement.update({
    where: { id },
    data: { status: 'ENDED', active: false },
  });
}

/**
 * If CURRENT is expired (time) or exhausted (visits), mark ENDED and return null.
 * Otherwise return the entitlement (or null if none).
 */
export async function refreshCurrentEntitlement(memberId: number): Promise<ClubEntitlement | null> {
  const entitlement = await getCurrentEntitlement(memberId);
  if (!entitlement) return null;

  const now = new Date();

  if (entitlement.validTo && entitlement.validTo <= now) {
    await endEntitlement(entitlement.id);
    return null;
  }

  if (
    entitlement.type === 'VISIT_PACK' &&
    entitlement.visitsRemaining !== null &&
    entitlement.visitsRemaining <= 0
  ) {
    await endEntitlement(entitlement.id);
    return null;
  }

  return entitlement;
}

export function serializeEntitlement(e: ClubEntitlement | null) {
  if (!e) return null;
  return {
    id: e.id,
    type: e.type,
    status: e.status,
    label: e.label,
    validFrom: e.validFrom.toISOString(),
    validTo: e.validTo ? e.validTo.toISOString() : null,
    visitsRemaining: e.visitsRemaining,
    visitsTotal: e.visitsTotal,
    amountPaidCents: e.amountPaidCents,
    familyKey: e.familyKey,
    planId: e.planId,
    planSegment: e.planSegment,
    active: e.active,
  };
}

/**
 * Proportional reimburse cents for a FUTURE entitlement.
 * TIME: remaining ms / full period ms × amountPaid
 * VISIT: visitsRemaining / visitsTotal × amountPaid
 */
export function computeFutureReimburseCents(ent: ClubEntitlement, now: Date = new Date()): number {
  const paid = Math.max(0, ent.amountPaidCents || 0);
  if (paid <= 0) return 0;

  if (ent.type === 'VISIT_PACK') {
    const total = Math.max(0, ent.visitsTotal ?? ent.visitsRemaining ?? 0);
    const remaining = Math.max(0, ent.visitsRemaining ?? 0);
    if (total <= 0) return 0;
    return Math.floor((remaining / total) * paid);
  }

  if (!ent.validTo) return paid;
  const fullMs = ent.validTo.getTime() - ent.validFrom.getTime();
  if (fullMs <= 0) return 0;
  const remainingMs = Math.max(0, ent.validTo.getTime() - Math.max(now.getTime(), ent.validFrom.getTime()));
  return Math.floor((remainingMs / fullMs) * paid);
}
