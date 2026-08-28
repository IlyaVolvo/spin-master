import { addDaysToYmd, getClubDate } from './clubDate';
import { resolveHoursForClubDate, weekdayForYmd } from './clubHours';
import { CLUB_WEEKDAYS, type ClubWeekday } from '../services/systemConfigService';

export { CLUB_WEEKDAYS };
export type { ClubWeekday };

const WEEKDAY_SET = new Set<string>(CLUB_WEEKDAYS);

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidHhmm(value: string): boolean {
  return HHMM.test(value);
}

export function parseMinutes(hhmm: string): number {
  if (!isValidHhmm(hhmm)) {
    throw new Error(`Invalid time: ${hhmm}`);
  }
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function formatMinutes(total: number): string {
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function isClubWeekday(value: string): value is ClubWeekday {
  return WEEKDAY_SET.has(value);
}

export function normalizeWeekdays(values: unknown): ClubWeekday[] {
  if (!Array.isArray(values)) return [];
  const unique: ClubWeekday[] = [];
  for (const raw of values) {
    const v = String(raw).toLowerCase();
    if (isClubWeekday(v) && !unique.includes(v)) unique.push(v);
  }
  return unique;
}
export function isFifteenMinuteSnap(hhmm: string): boolean {
  return isValidHhmm(hhmm) && parseMinutes(hhmm) % 15 === 0;
}

export function addMinutesToHhmm(hhmm: string, delta: number): string {
  return formatMinutes(parseMinutes(hhmm) + delta);
}

export function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
  bufferMinutes = 0,
): boolean {
  const a0 = parseMinutes(aStart) - bufferMinutes;
  const a1 = parseMinutes(aEnd) + bufferMinutes;
  const b0 = parseMinutes(bStart) - bufferMinutes;
  const b1 = parseMinutes(bEnd) + bufferMinutes;
  return a0 < b1 && b0 < a1;
}

export function windowContains(
  windowStart: string,
  windowEnd: string,
  start: string,
  end: string,
): boolean {
  return parseMinutes(start) >= parseMinutes(windowStart) && parseMinutes(end) <= parseMinutes(windowEnd);
}

/** Subtract busy intervals (optional buffer, no wrap past midnight) from a free window. */
export function subtractBusyWindows(
  startTime: string,
  endTime: string,
  busy: Array<{ startTime: string; endTime: string }>,
  bufferMinutes = 0,
): Array<{ startTime: string; endTime: string }> {
  const start = parseMinutes(startTime);
  const end = parseMinutes(endTime);
  if (end <= start) return [];
  const buffer = Math.max(0, Math.floor(bufferMinutes));
  const holes = busy
    .map((row) => ({
      start: Math.max(0, parseMinutes(row.startTime) - buffer),
      end: Math.min(24 * 60, parseMinutes(row.endTime) + buffer),
    }))
    .filter((row) => row.end > start && row.start < end)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const out: Array<{ startTime: string; endTime: string }> = [];
  let cursor = start;
  for (const hole of holes) {
    const holeStart = Math.max(hole.start, start);
    const holeEnd = Math.min(hole.end, end);
    if (holeStart > cursor) {
      out.push({ startTime: formatMinutes(cursor), endTime: formatMinutes(holeStart) });
    }
    cursor = Math.max(cursor, holeEnd);
    if (cursor >= end) break;
  }
  if (cursor < end) {
    out.push({ startTime: formatMinutes(cursor), endTime: formatMinutes(end) });
  }
  return out.filter((row) => parseMinutes(row.endTime) - parseMinutes(row.startTime) >= 15);
}

export function mergeTouchingWindows(
  windows: Array<{ startTime: string; endTime: string }>,
): Array<{ startTime: string; endTime: string }> {
  const sorted = [...windows].sort(
    (a, b) => parseMinutes(a.startTime) - parseMinutes(b.startTime) || parseMinutes(a.endTime) - parseMinutes(b.endTime),
  );
  const out: Array<{ startTime: string; endTime: string }> = [];
  for (const window of sorted) {
    const last = out[out.length - 1];
    if (last && parseMinutes(last.endTime) >= parseMinutes(window.startTime)) {
      if (parseMinutes(window.endTime) > parseMinutes(last.endTime)) last.endTime = window.endTime;
    } else {
      out.push({ startTime: window.startTime, endTime: window.endTime });
    }
  }
  return out;
}

export function daysBetweenYmd(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const a = Date.UTC(fy, fm - 1, fd);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.round((b - a) / 86400000);
}

export function matchesRecurrence(opts: {
  clubDate: string;
  startsOn: string;
  untilOn: string | null;
  weekdays: string[];
  intervalWeeks: number;
}): boolean {
  const { clubDate, startsOn, untilOn, weekdays, intervalWeeks } = opts;
  if (clubDate < startsOn) return false;
  if (untilOn && clubDate > untilOn) return false;
  if (!weekdays.length) {
    return clubDate === startsOn;
  }
  const weekday = weekdayForYmd(clubDate);
  if (!weekdays.includes(weekday)) return false;
  const days = daysBetweenYmd(startsOn, clubDate);
  const weeks = Math.floor(days / 7);
  const interval = Math.max(1, intervalWeeks);
  return weeks % interval === 0;
}

export function eachYmdInclusive(from: string, to: string): string[] {
  const out: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    out.push(cursor);
    cursor = addDaysToYmd(cursor, 1);
  }
  return out;
}

export function horizonEndYmd(monthsAhead: number, from: string = getClubDate()): string {
  const months = Math.max(1, monthsAhead);
  const [y, m, d] = from.split('-').map(Number);
  const end = new Date(Date.UTC(y, m - 1 + months, d));
  return `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, '0')}-${String(end.getUTCDate()).padStart(2, '0')}`;
}

/** Monday of the week containing `ymd` (UTC calendar math, YYYY-MM-DD). */
export function startOfWeekMonday(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  const back = dow === 0 ? 6 : dow - 1;
  return addDaysToYmd(ymd, -back);
}

export function untilOnForWeeklyCount(startsOn: string, weeks: number): string {
  const count = Math.max(1, Math.floor(weeks));
  return addDaysToYmd(startsOn, 7 * (count - 1));
}

export function clubHoursContainRange(clubDate: string, startTime: string, endTime: string): boolean {
  const { hours } = resolveHoursForClubDate(clubDate);
  if (hours.closed) return false;
  return windowContains(hours.open, hours.close, startTime, endTime);
}

export function priceCentsFromHourly(hourlyRateCents: number, durationMinutes: number): number {
  const hourly = Math.max(0, Math.floor(hourlyRateCents));
  const minutes = Math.max(0, Math.floor(durationMinutes));
  return Math.round((hourly * minutes) / 60);
}

export function memberAgeOnDate(birthDate: Date | string | null | undefined, clubDate: string): number | null {
  if (!birthDate) return null;
  const birth = typeof birthDate === 'string' ? new Date(birthDate) : birthDate;
  if (Number.isNaN(birth.getTime())) return null;
  const [y, m, d] = clubDate.split('-').map(Number);
  let age = y - birth.getUTCFullYear();
  const month = birth.getUTCMonth() + 1;
  const day = birth.getUTCDate();
  if (m < month || (m === month && d < day)) age -= 1;
  return age;
}
