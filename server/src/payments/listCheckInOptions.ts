import { prisma } from '../index';
import { getClubDate, clubLocalDayRangeUtc } from '../utils/clubDate';
import { isMemberInTrialPeriod } from './memberTrial';
import { getCurrentEntitlement } from './entitlementQueue';
import {
  getEventCheckInWindowBounds,
  isEventCheckInWindowOpen,
} from './eventCheckInWindow';
import { countHeldRegistrations } from './eventPayment';

export type CheckInOptionKind =
  | 'regular'
  | 'event_check_in'
  | 'register_and_pay'
  | 'buy_plan';

export type CheckInOptionDto = {
  id: string;
  kind: CheckInOptionKind;
  /** Client display label (server-provided for consistency). */
  label: string;
  actionable: boolean;
  /** True when event fee is already SUCCEEDED (or organizer-cleared REGISTERED). */
  prepaid: boolean;
  tournamentId?: number | null;
  name?: string | null;
  tournamentDate?: string | null;
  eventPriceCents?: number | null;
  clubChargeWaived?: boolean;
  clubChargeWarning?: string | null;
  /** ISO instant when the event check-in window opens (for disabled upcoming rows). */
  opensAt?: string | null;
  disabledReason?: 'window_not_open' | 'uncovered' | null;
};

function tournamentSatisfiesRating(
  member: { rating: number | null },
  tournament: { minRating: number | null; maxRating: number | null },
): boolean {
  const rating = member.rating;
  if (tournament.minRating != null && (rating == null || rating < tournament.minRating)) return false;
  if (tournament.maxRating != null && (rating == null || rating > tournament.maxRating)) return false;
  return true;
}

function isSameClubDay(date: Date | null | undefined, clubDateYmd: string): boolean {
  if (!date) return false;
  return getClubDate(date) === clubDateYmd;
}

function sortPriority(option: CheckInOptionDto): number {
  if (option.kind === 'event_check_in' && option.actionable && option.prepaid) return 0;
  if (option.kind === 'regular' && option.actionable) return 1;
  if (option.kind === 'register_and_pay' && option.actionable) return 2;
  if (
    (option.kind === 'event_check_in' || option.kind === 'register_and_pay') &&
    !option.actionable
  ) {
    return 3;
  }
  if (option.kind === 'buy_plan' || (option.kind === 'regular' && !option.actionable)) return 4;
  return 5;
}

function sortOptions(options: CheckInOptionDto[]): CheckInOptionDto[] {
  return [...options].sort((a, b) => {
    const pa = sortPriority(a);
    const pb = sortPriority(b);
    if (pa !== pb) return pa - pb;
    const ta = a.tournamentDate ? Date.parse(a.tournamentDate) : 0;
    const tb = b.tournamentDate ? Date.parse(b.tournamentDate) : 0;
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Non-mutating preview: can the member check in under regular club coverage
 * (plan, trial, visit pack, or already paid PPV / free re-entry today)?
 * Does not create courtesy visits.
 */
export async function previewRegularCheckInCovered(memberId: number, now = new Date()): Promise<boolean> {
  const clubDate = getClubDate(now);

  const successfulVisitToday = await prisma.clubVisit.findFirst({
    where: {
      memberId,
      clubDate,
      rejectedAt: null,
    },
    select: { id: true },
  });
  if (successfulVisitToday) return true;

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { trialEndsOn: true },
  });
  if (isMemberInTrialPeriod(member?.trialEndsOn, clubDate)) return true;

  const entitlement = await getCurrentEntitlement(memberId);
  if (!entitlement) return false;
  if (entitlement.validTo && entitlement.validTo <= now) return false;

  switch (entitlement.type) {
    case 'YEARLY':
    case 'MONTHLY':
      return true;
    case 'VISIT_PACK':
      return entitlement.visitsRemaining != null && entitlement.visitsRemaining > 0;
    case 'PAY_PER_VISIT_EXTERNAL': {
      const todayPayment = await prisma.clubPayment.findFirst({
        where: {
          memberId,
          status: 'SUCCEEDED',
          recordedAt: clubLocalDayRangeUtc(clubDate, clubDate),
          purpose: { contains: 'per-visit' },
        },
        select: { id: true },
      });
      return Boolean(todayPayment);
    }
    default:
      return false;
  }
}

function eventLabel(
  name: string | null | undefined,
  tournamentId: number,
  mode: 'event_check_in' | 'register_and_pay',
  priceCents: number | null | undefined,
  opensAt: Date | null,
  actionable: boolean,
): string {
  const base = name?.trim() || `Event #${tournamentId}`;
  if (!actionable && opensAt) {
    return base; // client appends " — at hh:mm"
  }
  if (mode === 'register_and_pay') {
    const price =
      priceCents != null && Number.isFinite(priceCents)
        ? ` ($${(priceCents / 100).toFixed(2)})`
        : '';
    return `Register & pay: ${base}${price}`;
  }
  return `Event: ${base}`;
}

/**
 * Unified check-in choices for kiosk + authenticated self-check-in.
 * Includes regular admission, today's events (open/upcoming), and Buy a plan when uncovered.
 */
export async function listCheckInOptions(
  memberId: number,
  now = new Date(),
): Promise<CheckInOptionDto[]> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true, isActive: true, rating: true, roles: true },
  });
  if (!member || !member.isActive) return [];

  const roles = (member.roles || []).map((r) => String(r).toUpperCase());
  const canParticipate =
    roles.includes('PLAYER') || roles.includes('ORGANIZER') || roles.includes('ADMIN');
  if (!canParticipate) return [];

  const clubDate = getClubDate(now);
  const options: CheckInOptionDto[] = [];

  const regularCovered = await previewRegularCheckInCovered(memberId, now);

  // ── Events for today (club-local calendar day) ────────────────────────────
  const todayEvents = await prisma.tournament.findMany({
    where: {
      isEvent: true,
      tournamentDate: clubLocalDayRangeUtc(clubDate, clubDate),
    },
    select: {
      id: true,
      name: true,
      tournamentDate: true,
      isEvent: true,
      status: true,
      eventPriceCents: true,
      minRating: true,
      maxRating: true,
      maxParticipants: true,
      registrationDeadline: true,
      eventCheckInLeadMinutes: true,
      eventCheckInCloseMinutesBeforeStart: true,
      registrations: {
        where: { memberId },
        select: {
          status: true,
          eventPayment: { select: { status: true } },
        },
      },
    },
  });

  for (const t of todayEvents) {
    if (!isSameClubDay(t.tournamentDate, clubDate)) continue;
    const bounds = getEventCheckInWindowBounds(t);
    if (!bounds) continue;

    const tNow = now.getTime();
    // After window closes → omit
    if (tNow > bounds.closesAt.getTime()) continue;

    const windowOpen = isEventCheckInWindowOpen(t, now);
    const myReg = t.registrations[0];
    const paid = myReg?.eventPayment?.status === 'SUCCEEDED';
    const isRegistered = myReg?.status === 'REGISTERED';
    const isPending = myReg?.status === 'PENDING';
    const prepaidRegistered = isRegistered; // REGISTERED (paid or organizer unpaid-clear)

    // Prepaid / REGISTERED event check-in
    if (prepaidRegistered) {
      const actionable = windowOpen;
      options.push({
        id: `event:${t.id}`,
        kind: 'event_check_in',
        label: eventLabel(t.name, t.id, 'event_check_in', t.eventPriceCents, bounds.opensAt, actionable),
        actionable,
        prepaid: paid || isRegistered,
        tournamentId: t.id,
        name: t.name,
        tournamentDate: t.tournamentDate?.toISOString() ?? null,
        eventPriceCents: t.eventPriceCents,
        clubChargeWaived: windowOpen,
        clubChargeWarning:
          windowOpen && !paid
            ? 'Event check-in allowed; event fee may still be unpaid in the payment log.'
            : null,
        opensAt: bounds.opensAt.toISOString(),
        disabledReason: actionable ? null : 'window_not_open',
      });
      continue;
    }

    // Unpaid / not yet registered — register_and_pay when eligible
    if (t.status !== 'PRE_REGISTRATION' || t.eventPriceCents == null) continue;
    if (t.registrationDeadline && now > new Date(t.registrationDeadline)) continue;
    if (!tournamentSatisfiesRating(member, t)) continue;

    const allRegs = await prisma.tournamentRegistration.findMany({
      where: { tournamentId: t.id },
      select: { status: true },
    });
    const held = countHeldRegistrations(allRegs);
    const alreadyHolding = isPending || isRegistered;
    if (!alreadyHolding && t.maxParticipants != null && held >= t.maxParticipants) {
      continue;
    }

    const actionable = windowOpen;
    options.push({
      id: `event:${t.id}`,
      kind: 'register_and_pay',
      label: eventLabel(t.name, t.id, 'register_and_pay', t.eventPriceCents, bounds.opensAt, actionable),
      actionable,
      prepaid: false,
      tournamentId: t.id,
      name: t.name,
      tournamentDate: t.tournamentDate?.toISOString() ?? null,
      eventPriceCents: t.eventPriceCents,
      clubChargeWaived: windowOpen,
      clubChargeWarning: null,
      opensAt: bounds.opensAt.toISOString(),
      disabledReason: actionable ? null : 'window_not_open',
    });
  }

  // ── Regular / Buy a plan ──────────────────────────────────────────────────
  if (regularCovered) {
    options.push({
      id: 'regular',
      kind: 'regular',
      label: 'Regular admission',
      actionable: true,
      prepaid: false,
      disabledReason: null,
    });
  } else {
    options.push({
      id: 'buy_plan',
      kind: 'buy_plan',
      label: 'Buy a plan',
      actionable: true,
      prepaid: false,
      disabledReason: 'uncovered',
    });
  }

  return sortOptions(options);
}

/** @deprecated Prefer listCheckInOptions; kept for callers that only want event rows. */
export async function listEventCheckInOptions(memberId: number) {
  const all = await listCheckInOptions(memberId);
  return all
    .filter((o) => o.kind === 'event_check_in' || o.kind === 'register_and_pay')
    .map((o) => ({
      tournamentId: o.tournamentId!,
      name: o.name ?? null,
      tournamentDate: o.tournamentDate ? new Date(o.tournamentDate) : null,
      eventPriceCents: o.eventPriceCents ?? null,
      mode: o.kind as 'event_check_in' | 'register_and_pay',
      clubChargeWaived: o.clubChargeWaived === true,
      clubChargeWarning: o.clubChargeWarning ?? null,
      actionable: o.actionable,
      opensAt: o.opensAt ?? null,
      prepaid: o.prepaid,
      disabledReason: o.disabledReason ?? null,
    }));
}
