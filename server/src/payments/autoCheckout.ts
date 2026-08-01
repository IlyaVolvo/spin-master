import { prisma } from '../index';
import { logger } from '../utils/logger';
import { getClubDate } from '../utils/clubDate';

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
 * SHELVED: not invoked on startup or via cron until re-enabled
 * (see server/src/index.ts and POST /api/club/cron/auto-checkout).
 *
 * Default: all visits whose `clubDate` is strictly before today's club-local date
 * (not only "yesterday"). Optional `clubDate` closes open visits for that day only.
 */
export async function runAutoCheckout(options?: {
  clubDate?: string;
}): Promise<AutoCheckoutResult> {
  const now = new Date();
  const targeted = options?.clubDate?.trim() || undefined;

  const result = await prisma.clubVisit.updateMany({
    where: targeted
      ? { clubDate: targeted, checkOutAt: null, rejectedAt: null }
      : { clubDate: { lt: getClubDate(now) }, checkOutAt: null, rejectedAt: null },
    data: {
      checkOutAt: now,
      closedBy: 'AUTO',
    },
  });

  const summary: AutoCheckoutResult = targeted
    ? { clubDate: targeted, closedCount: result.count }
    : { beforeClubDate: getClubDate(now), closedCount: result.count };

  logger.info('Auto-checkout completed', summary);
  return summary;
}
