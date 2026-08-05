/**
 * Human-readable admission grounds for attendance log.
 * Prefer the snapshot written at check-in (`admissionBasis`).
 */

export type PlanAdmissionEntitlement = {
  type: string;
  label?: string | null;
  visitsRemaining: number | null;
  visitsTotal: number | null;
  validFrom: Date | null;
  validTo: Date | null;
};

function ymdUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function planDisplayName(entitlement: PlanAdmissionEntitlement): string {
  const label = (entitlement.label || '').trim();
  if (label) return label;
  if (entitlement.type === 'VISIT_PACK') {
    const total = entitlement.visitsTotal;
    if (total != null && total > 0) return `${total} Visit${total === 1 ? '' : 's'}`;
    return 'Visit pack';
  }
  if (entitlement.type === 'MONTHLY') return 'Monthly';
  if (entitlement.type === 'YEARLY') return 'Yearly';
  if (entitlement.type === 'PAY_PER_VISIT_EXTERNAL') return 'Per-visit';
  return 'Plan';
}

/** Format plan admission: plan name + remaining visits or validity dates. */
export function formatPlanAdmissionBasis(entitlement: PlanAdmissionEntitlement): string {
  const name = planDisplayName(entitlement);
  if (entitlement.type === 'VISIT_PACK') {
    const remaining = entitlement.visitsRemaining != null ? entitlement.visitsRemaining : 0;
    return `${name} (${remaining} remaining)`;
  }

  const from = entitlement.validFrom ? ymdUtc(entitlement.validFrom) : null;
  const to = entitlement.validTo ? ymdUtc(entitlement.validTo) : null;
  if (from && to) return `${name} (${from} - ${to})`;
  if (to) return `${name} (until ${to})`;
  if (from) return `${name} (from ${from})`;
  return name;
}

export function formatEventAdmissionBasis(eventName: string | null | undefined): string {
  const name = (eventName || '').trim();
  return name || 'Event';
}

export function formatTrialAdmissionBasis(): string {
  return 'Trial';
}

export function formatCourtesyAdmissionBasis(): string {
  return 'Courtesy';
}

export type VisitAdmissionFields = {
  rejectedAt?: Date | string | null;
  isCourtesy: boolean;
  dailyPaymentApplied: boolean;
  eventTournamentId?: number | null;
  eventName?: string | null;
  admissionBasis?: string | null;
};

/**
 * Resolve display label from the stored snapshot, or from flags on the same row.
 */
export function resolveVisitAdmissionBasis(visit: VisitAdmissionFields): string | null {
  if (visit.rejectedAt) return null;

  const stored = typeof visit.admissionBasis === 'string' ? visit.admissionBasis.trim() : '';
  if (stored) return stored;

  if (visit.eventTournamentId != null) {
    return formatEventAdmissionBasis(visit.eventName);
  }
  if (visit.isCourtesy) {
    return formatCourtesyAdmissionBasis();
  }
  if (visit.dailyPaymentApplied) {
    return 'Plan';
  }

  return formatTrialAdmissionBasis();
}
