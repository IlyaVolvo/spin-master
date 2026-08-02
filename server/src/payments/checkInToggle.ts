/**
 * Bundled kiosk check-in/out: ~1 read transaction + ~1 write transaction.
 * Optional in-memory member stub / CURRENT entitlement cache (single Node instance).
 */

import type { ClubEntitlement, ClubVisit, Prisma } from '@prisma/client';
import { prisma } from '../index';
import { logger } from '../utils/logger';
import { getClubDate } from '../utils/clubDate';
import { getExpiryWarning } from './checkInReminders';
import {
  applyCoveredFirstVisitWrites,
  createTrialVisit,
  resolveFirstVisitOfDay,
  type CoveredWritePlan,
} from './checkInAccess';
import { recordRejectedCheckIn } from './recordRejectedCheckIn';
import { emitClubVisitUpdated } from '../services/socketService';
import {
  getCachedCurrentEntitlement,
  setCachedCurrentEntitlement,
  type MemberCheckInStub,
} from './checkInStateCache';

export type ToggleClosedBy = 'SCAN' | 'MANUAL';

/** Preloaded member fields (e.g. from pin-toggle cache) to avoid a member round-trip. */
export type ToggleVisitMemberContext = {
  trialEndsOn: Date | null;
  email: string | null;
  firstName: string;
  lastName: string;
};

export type ToggleVisitResult = {
  action: 'CHECK_IN' | 'CHECK_OUT' | 'PAYMENT_REQUIRED';
  visit: ClubVisit | null;
  warning: string | null;
  charged: boolean;
  entitlement: {
    type: string;
    visitsRemaining: number | null;
    validTo: Date | null;
  } | null;
  courtesy: boolean;
  canPay: boolean;
  paymentInProgress: boolean;
};

function serializeEntitlementBrief(entitlement: ClubEntitlement | null) {
  if (!entitlement) return null;
  return {
    type: entitlement.type,
    visitsRemaining: entitlement.visitsRemaining,
    validTo: entitlement.validTo,
  };
}

function applyPackDebitInMemory(
  entitlement: ClubEntitlement,
  plan: CoveredWritePlan,
): ClubEntitlement | null {
  if (!plan.packUpdate) return entitlement;
  if (plan.packUpdate.ended) return null;
  return {
    ...entitlement,
    visitsRemaining: plan.packUpdate.visitsRemaining,
  };
}

/** Expire CURRENT entitlement inside a transaction (same rules as refreshCurrentEntitlement). */
async function expireEntitlementIfNeeded(
  tx: Prisma.TransactionClient,
  entitlement: ClubEntitlement | null,
): Promise<ClubEntitlement | null> {
  if (!entitlement) return null;
  const now = new Date();
  if (entitlement.validTo && entitlement.validTo <= now) {
    await tx.clubEntitlement.update({
      where: { id: entitlement.id },
      data: { status: 'ENDED', active: false },
    });
    return null;
  }
  if (
    entitlement.type === 'VISIT_PACK' &&
    entitlement.visitsRemaining !== null &&
    entitlement.visitsRemaining <= 0
  ) {
    await tx.clubEntitlement.update({
      where: { id: entitlement.id },
      data: { status: 'ENDED', active: false },
    });
    return null;
  }
  return entitlement;
}

type ReadBundle = {
  openVisit: ClubVisit | null;
  existingVisitsToday: number;
  entitlement: ClubEntitlement | null;
  pendingCheckout: { id: number; externalRef: string | null } | null;
  member: ToggleVisitMemberContext | null;
};

async function loadReadBundle(
  memberId: number,
  memberContext?: ToggleVisitMemberContext | null,
): Promise<{ bundle: ReadBundle; usedEntitlementCache: boolean }> {
  const cachedEntitlement = getCachedCurrentEntitlement(memberId);
  const usedEntitlementCache = cachedEntitlement !== undefined;

  const bundle = await prisma.$transaction(async (tx) => {
    const openVisit = await tx.clubVisit.findFirst({
      where: { memberId, checkOutAt: null, rejectedAt: null },
      orderBy: { checkInAt: 'desc' },
    });

    const clubDate = getClubDate();
    const existingVisitsToday = await tx.clubVisit.count({
      where: { memberId, clubDate, rejectedAt: null },
    });

    let entitlement: ClubEntitlement | null =
      cachedEntitlement !== undefined
        ? cachedEntitlement
        : await tx.clubEntitlement.findFirst({
            where: { memberId, status: 'CURRENT' },
            orderBy: { createdAt: 'desc' },
          });

    entitlement = await expireEntitlementIfNeeded(tx, entitlement);

    const pendingCheckout = await tx.clubPayment.findFirst({
      where: { memberId, status: 'PENDING', externalRef: { not: null } },
      orderBy: { recordedAt: 'desc' },
      select: { id: true, externalRef: true },
    });

    let member: ToggleVisitMemberContext | null = memberContext ?? null;
    if (!member && !openVisit) {
      const row = await tx.member.findUnique({
        where: { id: memberId },
        select: {
          trialEndsOn: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      });
      if (row) {
        member = {
          trialEndsOn: row.trialEndsOn,
          email: row.email,
          firstName: row.firstName,
          lastName: row.lastName,
        };
      }
    }

    return {
      openVisit,
      existingVisitsToday,
      entitlement,
      pendingCheckout,
      member,
    };
  });

  return { bundle, usedEntitlementCache };
}

/**
 * Core check-in/check-out for a member.
 * Target: cache-warm PIN path ≤ 2 DB round-trips (read bundle + write tx).
 */
export async function toggleVisit(
  memberId: number,
  closedByMethod: ToggleClosedBy,
  memberContext?: ToggleVisitMemberContext | null,
): Promise<ToggleVisitResult> {
  const clubDate = getClubDate();
  let estimatedRoundTrips = 0;

  const finish = (result: ToggleVisitResult): ToggleVisitResult => {
    emitClubVisitUpdated({
      memberId,
      action: result.action,
      clubDate,
      visitId: result.visit?.id ?? null,
    });
    logger.debug('checkInDbRoundTrips', {
      memberId,
      action: result.action,
      estimate: estimatedRoundTrips,
      clubDate,
    });
    return result;
  };

  const { bundle, usedEntitlementCache } = await loadReadBundle(memberId, memberContext);
  estimatedRoundTrips += 1;

  const { openVisit, existingVisitsToday, pendingCheckout } = bundle;
  let entitlement = bundle.entitlement;

  if (openVisit) {
    const updatedVisit = await prisma.clubVisit.update({
      where: { id: openVisit.id },
      data: { checkOutAt: new Date(), closedBy: closedByMethod },
    });
    estimatedRoundTrips += 1;
    setCachedCurrentEntitlement(memberId, entitlement);
    return finish({
      action: 'CHECK_OUT',
      visit: updatedVisit,
      warning: null,
      charged: false,
      entitlement: serializeEntitlementBrief(entitlement),
      courtesy: openVisit.isCourtesy,
      canPay: false,
      paymentInProgress: false,
    });
  }

  const isFirstVisitOfDay = existingVisitsToday === 0;
  let dailyPaymentApplied = false;
  let warning: string | null = null;
  let visit: ClubVisit;
  const paymentInProgress = Boolean(pendingCheckout);

  if (isFirstVisitOfDay) {
    const outcome = await resolveFirstVisitOfDay({
      memberId,
      clubDate,
      entitlement: entitlement
        ? {
            id: entitlement.id,
            type: entitlement.type,
            visitsRemaining: entitlement.visitsRemaining,
          }
        : null,
      trialEndsOn: bundle.member?.trialEndsOn,
      memberEmail: bundle.member?.email,
      deferWrites: true,
      memberName: bundle.member
        ? { firstName: bundle.member.firstName, lastName: bundle.member.lastName }
        : null,
    });

    if (outcome.kind === 'trial') {
      visit = await createTrialVisit(memberId, clubDate);
      estimatedRoundTrips += 1;
      setCachedCurrentEntitlement(memberId, null);
      return finish({
        action: 'CHECK_IN',
        visit,
        warning: outcome.warning,
        charged: false,
        entitlement: null,
        courtesy: false,
        canPay: outcome.canPay,
        paymentInProgress: false,
      });
    }

    if (outcome.kind === 'courtesy') {
      // Courtesy path keeps its own multi-step writes inside resolveFirstVisitOfDay.
      estimatedRoundTrips += 3;
      const courtesyVisit = await prisma.clubVisit.findUnique({ where: { id: outcome.visitId } });
      setCachedCurrentEntitlement(memberId, null);
      return finish({
        action: 'CHECK_IN',
        visit: courtesyVisit,
        warning: outcome.warning,
        charged: false,
        entitlement: null,
        courtesy: true,
        canPay: outcome.canPay,
        paymentInProgress: outcome.paymentInProgress,
      });
    }

    if (outcome.kind === 'payment_required') {
      const rejectedVisit = await recordRejectedCheckIn({
        memberId,
        clubDate,
        closedBy: closedByMethod,
        reason: outcome.warning || 'Check-in rejected',
      });
      estimatedRoundTrips += 1;
      setCachedCurrentEntitlement(memberId, entitlement);
      return finish({
        action: 'PAYMENT_REQUIRED',
        visit: rejectedVisit,
        warning: outcome.warning,
        charged: false,
        entitlement: null,
        courtesy: false,
        canPay: outcome.canPay,
        paymentInProgress: false,
      });
    }

    // covered — payment/entitlement debit + visit in one write transaction
    dailyPaymentApplied = true;
    const plan = outcome as CoveredWritePlan;
    visit = await prisma.$transaction(async (tx) => {
      await applyCoveredFirstVisitWrites(tx, memberId, plan);
      return tx.clubVisit.create({
        data: {
          memberId,
          clubDate,
          dailyPaymentApplied: true,
        },
      });
    });
    estimatedRoundTrips += 1;

    if (entitlement) {
      entitlement = applyPackDebitInMemory(entitlement, plan);
      warning = entitlement ? getExpiryWarning(entitlement) : null;
    }
    setCachedCurrentEntitlement(memberId, entitlement);
  } else {
    // Free re-entry
    visit = await prisma.clubVisit.create({
      data: {
        memberId,
        clubDate,
        dailyPaymentApplied: false,
      },
    });
    estimatedRoundTrips += 1;
    if (entitlement) {
      warning = getExpiryWarning(entitlement);
    }
    setCachedCurrentEntitlement(memberId, entitlement);
  }

  logger.debug('checkInEntitlementCache', {
    memberId,
    hit: usedEntitlementCache,
  });

  return finish({
    action: 'CHECK_IN',
    visit,
    warning,
    charged: dailyPaymentApplied,
    entitlement: serializeEntitlementBrief(entitlement),
    courtesy: false,
    canPay: false,
    paymentInProgress,
  });
}

/** Build toggle member context from a cached or freshly loaded PIN stub. */
export function memberContextFromStub(stub: MemberCheckInStub): ToggleVisitMemberContext {
  return {
    trialEndsOn: stub.trialEndsOn,
    email: stub.email,
    firstName: stub.firstName,
    lastName: stub.lastName,
  };
}
