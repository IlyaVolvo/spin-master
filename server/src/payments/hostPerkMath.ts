import type { ClubEntitlement, ClubEntitlementType, ClubPlanKind } from '@prisma/client';

export function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function isTimeEntitlementType(type: ClubEntitlementType): boolean {
  return type === 'YEARLY' || type === 'MONTHLY';
}

export function perkAmountsForPlan(plan: {
  kind: ClubPlanKind;
  hostPerkDays: number;
  hostPerkVisits: number;
}): { days: number; visits: number } {
  if (plan.kind === 'TIME') {
    return { days: Math.max(0, Math.floor(plan.hostPerkDays) || 0), visits: 0 };
  }
  return { days: 0, visits: Math.max(0, Math.floor(plan.hostPerkVisits) || 0) };
}

export type EntitlementPerkPatch = {
  validTo?: Date | null;
  validFrom?: Date;
  visitsRemaining?: number | null;
  visitsTotal?: number | null;
};

/**
 * Pure perk mutation: TIME extends current.validTo and shifts a chained future TIME
 * plan by the same number of days. VISIT adds to remaining and total.
 */
export function computeHostPerkEntitlementPatches(args: {
  current: Pick<ClubEntitlement, 'type' | 'validTo' | 'visitsRemaining' | 'visitsTotal'>;
  future: Pick<ClubEntitlement, 'type' | 'validFrom' | 'validTo'> | null;
  days: number;
  visits: number;
}): { current: EntitlementPerkPatch; future: EntitlementPerkPatch | null } {
  const current: EntitlementPerkPatch = {};
  let future: EntitlementPerkPatch | null = null;

  if (isTimeEntitlementType(args.current.type) && args.days > 0 && args.current.validTo) {
    current.validTo = addUtcDays(args.current.validTo, args.days);
    if (args.future && isTimeEntitlementType(args.future.type)) {
      future = {
        validFrom: addUtcDays(args.future.validFrom, args.days),
        validTo: args.future.validTo ? addUtcDays(args.future.validTo, args.days) : args.future.validTo,
      };
    }
  }

  if (args.current.type === 'VISIT_PACK' && args.visits > 0) {
    const remaining = Math.max(0, args.current.visitsRemaining ?? 0) + args.visits;
    const total = Math.max(0, args.current.visitsTotal ?? 0) + args.visits;
    current.visitsRemaining = remaining;
    current.visitsTotal = total;
  }

  return { current, future };
}
