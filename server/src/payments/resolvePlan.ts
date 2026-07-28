import { prisma } from '../index';
import type { ClubPlan } from '@prisma/client';

const REGULAR = 'Regular';

/**
 * Charge amount for a plan row.
 * TIME: priceCents is the total.
 * VISIT: priceCents is per visit; total = priceCents × visitCount.
 */
export function planChargeAmountCents(
  plan: Pick<ClubPlan, 'kind' | 'priceCents' | 'visitCount'>,
): number {
  const unit = Math.max(0, plan.priceCents || 0);
  if (plan.kind === 'VISIT') {
    return unit * Math.max(0, plan.visitCount || 0);
  }
  return unit;
}

/**
 * Resolve the sellable plan for a family + member segment.
 * Falls back to Regular when the member's segment has no variant.
 */
export async function resolvePlanForMember(
  familyKey: string,
  memberSegment: string | null | undefined,
): Promise<ClubPlan> {
  const segment = (memberSegment || REGULAR).trim() || REGULAR;
  const normalized = segment === 'Normal' ? REGULAR : segment;

  const preferred = await prisma.clubPlan.findFirst({
    where: { familyKey, segment: normalized, isActive: true },
  });
  if (preferred) return preferred;

  if (normalized !== REGULAR) {
    const regular = await prisma.clubPlan.findFirst({
      where: { familyKey, segment: REGULAR, isActive: true },
    });
    if (regular) return regular;
  }

  throw new Error(`No active plan found for family "${familyKey}" (segment ${normalized} / Regular)`);
}

export async function listActivePlanFamilies(): Promise<
  Array<{ familyKey: string; name: string; kind: string; sortOrder: number }>
> {
  const plans = await prisma.clubPlan.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  const byFamily = new Map<string, { familyKey: string; name: string; kind: string; sortOrder: number }>();
  for (const p of plans) {
    if (!byFamily.has(p.familyKey)) {
      byFamily.set(p.familyKey, {
        familyKey: p.familyKey,
        name: p.name,
        kind: p.kind,
        sortOrder: p.sortOrder,
      });
    }
  }
  return Array.from(byFamily.values()).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}
