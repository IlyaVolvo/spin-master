import { getClubTimezoneConfig } from '../services/systemConfigService';

export function getClubTimezone(): string {
  try {
    return getClubTimezoneConfig();
  } catch {
    // Config may not be initialized yet during very early bootstrap
    return process.env.CLUB_TIMEZONE?.trim() || 'UTC';
  }
}

/** Returns the club-local date string "YYYY-MM-DD" for a given instant. */
export function getClubDate(date: Date = new Date()): string {
  return date.toLocaleDateString('en-CA', { timeZone: getClubTimezone() }); // en-CA gives YYYY-MM-DD
}

/**
 * Convert a club-local calendar day (YYYY-MM-DD) to the UTC instant of that day's
 * start (00:00:00.000) in the club timezone.
 */
export function clubLocalDayStartUtc(ymd: string, timeZone: string = getClubTimezone()): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    throw new Error(`Invalid club-local date: ${ymd}`);
  }
  // Iterate a UTC guess until the club-local calendar day+time matches midnight.
  // Start from the UTC midnight of that YMD (close for most zones).
  let guess = Date.parse(`${ymd}T00:00:00.000Z`);
  for (let i = 0; i < 4; i += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(guess));
    const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
    const asYmd = `${get('year')}-${get('month')}-${get('day')}`;
    const asSec =
      Number(get('hour')) * 3600 + Number(get('minute')) * 60 + Number(get('second'));
    if (asYmd === ymd && asSec === 0) {
      return new Date(guess);
    }
    // How far is this club-local wall time from the desired YMD midnight?
    const desired = Date.parse(`${ymd}T00:00:00.000Z`);
    const observed = Date.parse(`${asYmd}T00:00:00.000Z`) + asSec * 1000;
    guess += desired - observed;
  }
  return new Date(guess);
}

/** Inclusive club-local day filter bounds as UTC instants: [start, endExclusive). */
export function clubLocalDayRangeUtc(
  fromYmd: string | null,
  toYmd: string | null,
  timeZone: string = getClubTimezone(),
): { gte?: Date; lt?: Date } {
  const range: { gte?: Date; lt?: Date } = {};
  if (fromYmd) {
    range.gte = clubLocalDayStartUtc(fromYmd, timeZone);
  }
  if (toYmd) {
    const [y, m, d] = toYmd.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    const nextYmd = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
    range.lt = clubLocalDayStartUtc(nextYmd, timeZone);
  }
  return range;
}
