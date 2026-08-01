import {
  CLUB_WEEKDAYS,
  type ClubDayHours,
  type ClubHourOverride,
  type ClubWeekday,
  getSystemConfig,
} from '../services/systemConfigService';
import { addDaysToYmd, clubLocalDateTimeUtc, clubLocalDayStartUtc, getClubTimezone } from './clubDate';

const WEEKDAY_FROM_UTC_DAY: ClubWeekday[] = [
  'sun',
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
];

/** Weekday key for a club-local YYYY-MM-DD (timezone-independent calendar math). */
export function weekdayForYmd(ymd: string): ClubWeekday {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    throw new Error(`Invalid club-local date: ${ymd}`);
  }
  const [y, m, d] = ymd.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
  return WEEKDAY_FROM_UTC_DAY[dow];
}

export type ResolvedClubHours = {
  hours: ClubDayHours;
  comment: string | null;
  source: 'override' | 'weekly';
};

/**
 * Effective hours for a club calendar day: date override wins over weekday default.
 */
export function resolveHoursForClubDate(
  ymd: string,
  opts?: {
    weeklyHours?: Record<ClubWeekday, ClubDayHours>;
    hourOverrides?: ClubHourOverride[];
  },
): ResolvedClubHours {
  const branding = opts?.weeklyHours
    ? {
        weeklyHours: opts.weeklyHours,
        hourOverrides: opts.hourOverrides ?? [],
      }
    : getSystemConfig().branding;

  const override = branding.hourOverrides.find((o) => o.date === ymd);
  if (override) {
    return { hours: override.hours, comment: override.comment, source: 'override' };
  }
  const weekday = weekdayForYmd(ymd);
  return {
    hours: branding.weeklyHours[weekday],
    comment: null,
    source: 'weekly',
  };
}

/**
 * UTC instant used as auto-checkout stamp for visits on `ymd`:
 * configured close wall-clock, or start of the next club day if closed/missing.
 */
export function clubCloseInstant(
  ymd: string,
  opts?: {
    weeklyHours?: Record<ClubWeekday, ClubDayHours>;
    hourOverrides?: ClubHourOverride[];
    timeZone?: string;
  },
): Date {
  const timeZone = opts?.timeZone ?? getClubTimezone();
  const { hours } = resolveHoursForClubDate(ymd, opts);
  if (!hours.closed && hours.close) {
    return clubLocalDateTimeUtc(ymd, hours.close, timeZone);
  }
  return clubLocalDayStartUtc(addDaysToYmd(ymd, 1), timeZone);
}

export { CLUB_WEEKDAYS };
