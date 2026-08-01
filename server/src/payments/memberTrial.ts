import { sendMail } from '../services/mailService';
import { logger } from '../utils/logger';
import { prisma } from '../index';
import { getClubDate } from '../utils/clubDate';
import { getPaymentsConfig } from '../services/systemConfigService';

/** YYYY-MM-DD from a date-only trialEndsOn (stored as UTC noon). */
export function trialEndsOnToYmd(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

/** Parse admin input: null/'' clears; YYYY-MM-DD sets; invalid throws. */
export function parseTrialEndsOnInput(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    throw new Error('trialEndsOn must be YYYY-MM-DD or null');
  }
  const [y, m, d] = value.trim().split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

/** True while clubDate is on or before the inclusive trial end day. */
export function isMemberInTrialPeriod(
  trialEndsOn: Date | null | undefined,
  clubDateYmd: string,
): boolean {
  const end = trialEndsOnToYmd(trialEndsOn);
  return end != null && clubDateYmd <= end;
}

/** Add calendar days to a YYYY-MM-DD string. */
export function addDaysToYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

/**
 * Inclusive trial end for a member joining on `startYmd`, or null when trials are off.
 * `trialDays` counts the join day itself, so 1 day means "today only".
 */
export function newMemberTrialEndsOn(startYmd: string, trialDays: number): Date | null {
  const days = Math.floor(trialDays);
  if (!Number.isFinite(days) || days < 1) return null;
  return parseTrialEndsOnInput(addDaysToYmd(startYmd, days - 1));
}

/** Trial end to store on a member created right now, per configured trial length. */
export function resolveNewMemberTrialEndsOn(): Date | null {
  return newMemberTrialEndsOn(getClubDate(), getPaymentsConfig().newMemberTrialDays);
}

/** First club day after an inclusive trial end date. */
export function trialPlanStartYmd(trialEndsOn: Date | null | undefined): string | null {
  const end = trialEndsOnToYmd(trialEndsOn);
  if (!end) return null;
  return addDaysToYmd(end, 1);
}

export async function sendTrialEndedEmail(opts: {
  to: string;
  memberName: string;
  trialEndsOnYmd: string;
}): Promise<void> {
  const subject = 'Your club trial has ended';
  const text = [
    `Hi ${opts.memberName},`,
    '',
    `Your free trial period ended on ${opts.trialEndsOnYmd}.`,
    'Please purchase a club plan to continue visiting.',
    '',
    'Thank you.',
  ].join('\n');
  const html = `
    <p>Hi ${escapeHtml(opts.memberName)},</p>
    <p>Your free trial period ended on <strong>${escapeHtml(opts.trialEndsOnYmd)}</strong>.</p>
    <p>Please purchase a club plan to continue visiting.</p>
    <p>Thank you.</p>
  `;
  await sendMail({ to: opts.to, subject, text, html });
}

/**
 * Notify members whose trial end day is strictly before clubDate and not yet notified.
 */
export async function notifyCompletedTrials(clubDateYmd: string): Promise<{
  considered: number;
  emailed: number;
  marked: number;
}> {
  const candidates = await prisma.member.findMany({
    where: {
      trialEndsOn: { not: null },
      trialExpiryNotifiedAt: null,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      trialEndsOn: true,
    },
  });

  let emailed = 0;
  let marked = 0;
  const now = new Date();

  for (const member of candidates) {
    const endYmd = trialEndsOnToYmd(member.trialEndsOn);
    if (!endYmd || endYmd >= clubDateYmd) continue;

    const email = member.email?.trim();
    if (email) {
      try {
        await sendTrialEndedEmail({
          to: email,
          memberName: `${member.firstName} ${member.lastName}`.trim() || 'Member',
          trialEndsOnYmd: endYmd,
        });
        emailed += 1;
      } catch (err) {
        logger.warn('Trial-ended email failed', {
          memberId: member.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await prisma.member.update({
      where: { id: member.id },
      data: { trialExpiryNotifiedAt: now },
    });
    marked += 1;
  }

  return { considered: candidates.length, emailed, marked };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
