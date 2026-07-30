import { getPaymentsConfig } from '../services/systemConfigService';

export type PlanIndicator = 'active' | 'expiring_soon' | 'none';

type EntitlementLike = {
  type: string;
  validTo: Date | null;
  visitsRemaining: number | null;
};

function isEffectivelyCurrent(entitlement: EntitlementLike, now: Date = new Date()): boolean {
  if (entitlement.validTo && entitlement.validTo <= now) return false;
  if (
    entitlement.type === 'VISIT_PACK' &&
    entitlement.visitsRemaining !== null &&
    entitlement.visitsRemaining <= 0
  ) {
    return false;
  }
  return true;
}

function isNearExpiry(
  entitlement: EntitlementLike,
  reminders: { periodDaysBeforeExpiry: number; visitPackVisitsRemaining: number },
  now: Date = new Date(),
): boolean {
  if (entitlement.type === 'VISIT_PACK') {
    return (
      entitlement.visitsRemaining !== null &&
      entitlement.visitsRemaining <= reminders.visitPackVisitsRemaining
    );
  }
  if (!entitlement.validTo) return false;
  const daysLeft = Math.ceil((entitlement.validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return daysLeft <= reminders.periodDaysBeforeExpiry;
}

/**
 * Admin roster $ color:
 * - active (green): CURRENT plan in effect
 * - expiring_soon (yellow): CURRENT near expiry and no FUTURE queued
 * - none (red): no effective CURRENT plan
 */
export function computePlanIndicator(
  current: EntitlementLike | null,
  hasFuture: boolean,
  reminders: { periodDaysBeforeExpiry: number; visitPackVisitsRemaining: number } = getPaymentsConfig().reminders,
  now: Date = new Date(),
): PlanIndicator {
  if (!current || !isEffectivelyCurrent(current, now)) return 'none';
  if (isNearExpiry(current, reminders, now) && !hasFuture) return 'expiring_soon';
  return 'active';
}
