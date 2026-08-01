import type { ClubDayHours, ClubHourOverride, ClubWeekday, SystemConfig } from './systemConfig';
import { clubTodayYmd, clubYmd } from './clubDateTime';

const WEEKDAY_FROM_UTC_DAY: ClubWeekday[] = [
  'sun',
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
];

export function weekdayForYmd(ymd: string): ClubWeekday {
  const [y, m, d] = ymd.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
  return WEEKDAY_FROM_UTC_DAY[dow];
}

export function resolveHoursForClubDate(
  ymd: string,
  branding: SystemConfig['branding'],
): { hours: ClubDayHours; comment: string | null } {
  const override = (branding.hourOverrides ?? []).find((o: ClubHourOverride) => o.date === ymd);
  if (override) {
    return { hours: override.hours, comment: override.comment };
  }
  const weekly = branding.weeklyHours;
  if (!weekly) {
    return { hours: { closed: true }, comment: null };
  }
  return { hours: weekly[weekdayForYmd(ymd)], comment: null };
}

/** Compact display e.g. "10:00a–10:00p" or "Closed". */
export function formatDayHoursCompact(hours: ClubDayHours): string {
  if (hours.closed) return 'Closed';
  return `${formatHmCompact(hours.open)}–${formatHmCompact(hours.close)}`;
}

function formatHmCompact(hm: string): string {
  const [hStr, mStr] = hm.split(':');
  let h = Number(hStr);
  const m = Number(mStr);
  const suffix = h >= 12 ? 'p' : 'a';
  h = h % 12;
  if (h === 0) h = 12;
  return m === 0 ? `${h}:00${suffix}` : `${h}:${String(m).padStart(2, '0')}${suffix}`;
}

/** Today's effective hours label for the app header. */
export function todayHoursHeaderLabel(branding: SystemConfig['branding']): {
  label: string;
  comment: string | null;
} {
  const ymd = clubTodayYmd() || clubYmd(new Date());
  const resolved = resolveHoursForClubDate(ymd, branding);
  return {
    label: formatDayHoursCompact(resolved.hours),
    comment: resolved.comment,
  };
}
