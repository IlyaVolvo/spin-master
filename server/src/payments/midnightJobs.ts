import { prisma } from '../index';
import { logger } from '../utils/logger';
import {
  endEntitlement,
  getCurrentEntitlement,
  getFutureEntitlement,
  refreshCurrentEntitlement,
} from './entitlementQueue';
import { runMemberCheckout } from './runCheckout';
import { memberCanPayOnline } from './getActivePaymentProvider';
import { notifyCompletedTrials } from './memberTrial';
import { getClubDate } from '../utils/clubDate';
import { invalidateCurrentEntitlement } from './checkInStateCache';

function addClubDays(clubDate: string, deltaDays: number): string {
  // Interpret clubDate as noon UTC then shift — good enough for YYYY-MM-DD arithmetic
  const [y, m, d] = clubDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

function clubDateOfInstant(instant: Date): string {
  return getClubDate(instant);
}

/**
 * Club-midnight jobs: end exhausted CURRENT, promote FUTURE → CURRENT, auto-renew.
 */
export async function runClubMidnightJobs(options?: {
  clubDate?: string;
}): Promise<{
  clubDate: string;
  previousClubDate: string;
  endedCurrent: number;
  promoted: number;
  autoRenewStarted: number;
  autoRenewErrors: number;
  trialEndedEmailed: number;
  trialEndedMarked: number;
}> {
  const clubDate = options?.clubDate || getClubDate();
  const previousClubDate = addClubDays(clubDate, -1);
  const now = new Date();

  let endedCurrent = 0;
  let promoted = 0;
  let autoRenewStarted = 0;
  let autoRenewErrors = 0;

  // 1) End expired/exhausted CURRENT entitlements
  const currents = await prisma.clubEntitlement.findMany({
    where: { status: 'CURRENT', active: true },
  });
  for (const ent of currents) {
    let shouldEnd = false;
    if (ent.validTo && ent.validTo <= now) shouldEnd = true;
    if (
      ent.type === 'VISIT_PACK' &&
      ent.visitsRemaining !== null &&
      ent.visitsRemaining <= 0
    ) {
      shouldEnd = true;
    }
    if (shouldEnd) {
      await endEntitlement(ent.id);
      endedCurrent += 1;
    }
  }

  // 2) Promote FUTURE → CURRENT when eligible
  const futures = await prisma.clubEntitlement.findMany({
    where: { status: 'FUTURE', active: true },
    orderBy: { createdAt: 'asc' },
  });

  for (const future of futures) {
    const current = await getCurrentEntitlement(future.memberId);
    if (current) {
      // VISIT future waits until no current; TIME waits until validFrom
      if (future.type === 'VISIT_PACK') continue;
      if (future.validFrom > now) continue;
      // TIME future whose start has arrived while CURRENT still exists shouldn't happen
      // if validFrom = current.validTo; if CURRENT still active, skip
      continue;
    }

    if (future.type !== 'VISIT_PACK' && future.validFrom > now) {
      continue;
    }

    await prisma.clubEntitlement.update({
      where: { id: future.id },
      data: {
        status: 'CURRENT',
        active: true,
        // For VISIT packs waiting, validFrom becomes now when promoted
        ...(future.type === 'VISIT_PACK' ? { validFrom: now } : {}),
      },
    });
    invalidateCurrentEntitlement(future.memberId);
    promoted += 1;
  }

  // 3) Auto-renew: members with flag, expired previous club day, no current, no future
  const renewMembers = await prisma.member.findMany({
    where: {
      autoRenewEnabled: true,
      autoRenewFamilyKey: { not: null },
      isActive: true,
    },
    select: {
      id: true,
      autoRenewFamilyKey: true,
      email: true,
      onlinePayConsent: true,
      paymentProviderId: true,
    },
  });

  for (const member of renewMembers) {
    const familyKey = member.autoRenewFamilyKey?.trim();
    if (!familyKey) continue;

    await refreshCurrentEntitlement(member.id);
    const current = await getCurrentEntitlement(member.id);
    if (current) continue;
    const future = await getFutureEntitlement(member.id);
    if (future) continue;

    const lastEnded = await prisma.clubEntitlement.findFirst({
      where: {
        memberId: member.id,
        status: 'ENDED',
      },
      orderBy: [{ validTo: 'desc' }, { updatedAt: 'desc' }],
    });
    if (!lastEnded) continue;

    let expiredPrevDay = false;
    if (lastEnded.validTo) {
      expiredPrevDay = clubDateOfInstant(lastEnded.validTo) === previousClubDate;
    } else {
      // VISIT packs: use updatedAt when marked ENDED
      expiredPrevDay = clubDateOfInstant(lastEnded.updatedAt) === previousClubDate;
    }
    if (!expiredPrevDay) continue;

    if (!memberCanPayOnline(member)) {
      logger.warn('Auto-renew skipped: online payment not fully enabled', {
        memberId: member.id,
        hasEmail: Boolean(member.email?.trim()),
        onlinePayConsent: member.onlinePayConsent === true,
        paymentProviderId: member.paymentProviderId ?? null,
      });
      autoRenewErrors += 1;
      continue;
    }

    try {
      await runMemberCheckout({
        memberId: member.id,
        kind: 'plan',
        familyKey,
        autoRenew: true,
        initiatedBy: 'ADMIN',
        method: 'online',
        // Auto-renew after expiry: current already ended
        skipFutureGuard: false,
      });
      autoRenewStarted += 1;
    } catch (err) {
      autoRenewErrors += 1;
      logger.error('Auto-renew checkout failed', {
        memberId: member.id,
        familyKey,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 4) Trial period completed → email (if address exists) once
  const trialNotify = await notifyCompletedTrials(clubDate);

  // 5) Expire unpaid event PENDING registrations past deadline
  const { expirePendingEventRegistrations } = await import('./eventPayment');
  const expiredEventPending = await expirePendingEventRegistrations(now);

  logger.info('Club midnight jobs completed', {
    clubDate,
    previousClubDate,
    endedCurrent,
    promoted,
    autoRenewStarted,
    autoRenewErrors,
    trialEndedEmailed: trialNotify.emailed,
    trialEndedMarked: trialNotify.marked,
    expiredEventPending,
  });

  return {
    clubDate,
    previousClubDate,
    endedCurrent,
    promoted,
    autoRenewStarted,
    autoRenewErrors,
    trialEndedEmailed: trialNotify.emailed,
    trialEndedMarked: trialNotify.marked,
  };
}
