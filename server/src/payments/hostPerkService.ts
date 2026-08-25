import { prisma } from '../index';
import { invalidateCurrentEntitlement } from './checkInStateCache';
import {
  getCurrentEntitlement,
  getFutureEntitlement,
  refreshCurrentEntitlement,
} from './entitlementQueue';
import {
  computeHostPerkEntitlementPatches,
  perkAmountsForPlan,
} from './hostPerkMath';
import { logger } from '../utils/logger';

function isPayableCurrentType(type: string): boolean {
  return type === 'YEARLY' || type === 'MONTHLY' || type === 'VISIT_PACK';
}

/**
 * Apply one PENDING grant if the member now has a current TIME/VISIT plan.
 * 0-perk plans close the grant as APPLIED with zeros.
 */
export async function applyHostPerkGrant(grantId: number): Promise<void> {
  const grant = await prisma.hostPerkGrant.findUnique({ where: { id: grantId } });
  if (!grant || grant.status !== 'PENDING') return;

  const current = await refreshCurrentEntitlement(grant.memberId);
  if (!current || !isPayableCurrentType(current.type) || !current.planId) {
    return;
  }

  const plan = await prisma.clubPlan.findUnique({ where: { id: current.planId } });
  if (!plan) return;

  const { days, visits } = perkAmountsForPlan(plan);
  const future = await getFutureEntitlement(grant.memberId);
  const patches = computeHostPerkEntitlementPatches({
    current,
    future,
    days,
    visits,
  });

  await prisma.$transaction(async (tx) => {
    const hasCurrentPatch = Object.keys(patches.current).length > 0;
    if (hasCurrentPatch) {
      await tx.clubEntitlement.update({
        where: { id: current.id },
        data: patches.current,
      });
    }
    if (patches.future && future) {
      await tx.clubEntitlement.update({
        where: { id: future.id },
        data: patches.future,
      });
    }
    await tx.hostPerkGrant.update({
      where: { id: grant.id },
      data: {
        status: 'APPLIED',
        daysAdded: days,
        visitsAdded: visits,
        entitlementId: current.id,
        appliedAt: new Date(),
      },
    });
  });

  invalidateCurrentEntitlement(grant.memberId);
  logger.info('Host perk grant applied', {
    grantId: grant.id,
    memberId: grant.memberId,
    shiftId: grant.shiftId,
    days,
    visits,
    entitlementId: current.id,
  });
}

export async function applyPendingHostPerksForMember(memberId: number): Promise<void> {
  const pending = await prisma.hostPerkGrant.findMany({
    where: { memberId, status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
  });
  for (const grant of pending) {
    await applyHostPerkGrant(grant.id);
  }
}

/**
 * Create a grant for this member+shift if missing, then try to apply it.
 * Unique (shiftId, memberId) prevents double pay for the same person.
 */
export async function ensureHostPerkGrant(shiftId: number, memberId: number): Promise<{
  id: number;
  status: 'PENDING' | 'APPLIED';
  created: boolean;
}> {
  const existing = await prisma.hostPerkGrant.findUnique({
    where: { shiftId_memberId: { shiftId, memberId } },
  });
  if (existing) {
    if (existing.status === 'PENDING') {
      await applyHostPerkGrant(existing.id);
    }
    const fresh = await prisma.hostPerkGrant.findUnique({ where: { id: existing.id } });
    return {
      id: existing.id,
      status: (fresh?.status || existing.status) as 'PENDING' | 'APPLIED',
      created: false,
    };
  }

  const created = await prisma.hostPerkGrant.create({
    data: { shiftId, memberId, status: 'PENDING' },
  });
  await applyHostPerkGrant(created.id);
  const fresh = await prisma.hostPerkGrant.findUnique({ where: { id: created.id } });
  return {
    id: created.id,
    status: (fresh?.status || 'PENDING') as 'PENDING' | 'APPLIED',
    created: true,
  };
}
