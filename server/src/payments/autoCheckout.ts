import { prisma } from '../index';
import { logger } from '../utils/logger';
import { getClubDate } from '../utils/clubDate';
import { clubCloseInstant } from '../utils/clubHours';
import { emitClubVisitUpdated } from '../services/socketService';

export type AutoCheckoutResult = {
  /** Club-local "today" used for the default (all stale) path. */
  beforeClubDate?: string;
  /** Single-day targeted run when `options.clubDate` was provided. */
  clubDate?: string;
  closedCount: number;
};

/**
 * Close open club visits (`checkOutAt: null`) as AUTO.
 *
 * Default: all visits whose `clubDate` is strictly before today's club-local date.
 * Optional `clubDate` closes open visits for that day only.
 *
 * `checkOutAt` is stamped at that day's configured club close time (club timezone),
 * not at the moment the job runs.
 */
export async function runAutoCheckout(options?: {
  clubDate?: string;
}): Promise<AutoCheckoutResult> {
  const now = new Date();
  const targeted = options?.clubDate?.trim() || undefined;
  const today = getClubDate(now);

  const openVisits = await prisma.clubVisit.findMany({
    where: targeted
      ? { clubDate: targeted, checkOutAt: null, rejectedAt: null }
      : { clubDate: { lt: today }, checkOutAt: null, rejectedAt: null },
    select: { id: true, memberId: true, clubDate: true },
  });

  const byDate = new Map<string, { id: number; memberId: number }[]>();
  for (const visit of openVisits) {
    const list = byDate.get(visit.clubDate) ?? [];
    list.push({ id: visit.id, memberId: visit.memberId });
    byDate.set(visit.clubDate, list);
  }

  let closedCount = 0;
  for (const [clubDate, visits] of byDate) {
    const checkOutAt = clubCloseInstant(clubDate);
    const ids = visits.map((v) => v.id);
    const result = await prisma.clubVisit.updateMany({
      where: { id: { in: ids }, checkOutAt: null, rejectedAt: null },
      data: {
        checkOutAt,
        closedBy: 'AUTO',
      },
    });
    closedCount += result.count;
    for (const visit of visits) {
      emitClubVisitUpdated({
        memberId: visit.memberId,
        action: 'AUTO_CHECK_OUT',
        clubDate,
        visitId: visit.id,
        present: false,
      });
    }
  }

  const summary: AutoCheckoutResult = targeted
    ? { clubDate: targeted, closedCount }
    : { beforeClubDate: today, closedCount };

  logger.info('Auto-checkout completed', summary);
  return summary;
}

/**
 * Close all currently open visits (admin "close club").
 * `checkOutAt` defaults to now; optional ISO override allowed before/after scheduled close.
 */
export async function runCloseClub(options?: {
  checkOutAt?: Date;
}): Promise<{ closedCount: number; checkOutAt: string }> {
  const checkOutAt = options?.checkOutAt ?? new Date();
  if (Number.isNaN(checkOutAt.getTime())) {
    throw new Error('Invalid checkOutAt');
  }

  const openVisits = await prisma.clubVisit.findMany({
    where: { checkOutAt: null, rejectedAt: null },
    select: { id: true, memberId: true, clubDate: true },
  });

  if (openVisits.length === 0) {
    return { closedCount: 0, checkOutAt: checkOutAt.toISOString() };
  }

  const result = await prisma.clubVisit.updateMany({
    where: {
      id: { in: openVisits.map((v) => v.id) },
      checkOutAt: null,
      rejectedAt: null,
    },
    data: {
      checkOutAt,
      closedBy: 'AUTO',
    },
  });

  for (const visit of openVisits) {
    emitClubVisitUpdated({
      memberId: visit.memberId,
      action: 'AUTO_CHECK_OUT',
      clubDate: visit.clubDate,
      visitId: visit.id,
      present: false,
    });
  }

  logger.info('Close club completed', { closedCount: result.count, checkOutAt: checkOutAt.toISOString() });
  return { closedCount: result.count, checkOutAt: checkOutAt.toISOString() };
}
