import { getSystemConfig } from './systemConfig';

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Club-configured IANA timezone, or undefined to fall back to the browser zone. */
export function getClubTimeZone(): string | undefined {
  try {
    return getSystemConfig().branding.clubTimezone || undefined;
  } catch {
    return undefined;
  }
}

function formatInClubZone(d: Date, options: Intl.DateTimeFormatOptions): string {
  const timeZone = getClubTimeZone();
  try {
    return d.toLocaleString(undefined, { timeZone, ...options });
  } catch {
    return d.toLocaleString(undefined, options);
  }
}

/**
 * Format an instant in the club's configured timezone (not UTC/GMT unless the club is set to UTC).
 */
export function formatClubDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatInClubZone(d, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Format the club-local calendar day of an instant, without the time. */
export function formatClubDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatInClubZone(d, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** The club-local calendar day ("YYYY-MM-DD") an instant falls on. */
export function clubYmd(value: string | number | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const timeZone = getClubTimeZone();
  try {
    // en-CA renders as YYYY-MM-DD
    const ymd = d.toLocaleDateString('en-CA', { timeZone });
    if (YMD_RE.test(ymd)) return ymd;
  } catch {
    // fall through to the parts-based path
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * The calendar day a date-picker value stands for, read from the Date's own
 * year/month/day fields so the day the user clicked is never shifted.
 */
export function pickedDayYmd(date: Date): string {
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Accept either a plain "YYYY-MM-DD" day or an instant, and return a club-local day. */
export function normalizeDayYmd(value: string): string {
  return YMD_RE.test(value) ? value : clubYmd(value);
}

/** Today's calendar day ("YYYY-MM-DD") in the club timezone. */
export function clubTodayYmd(): string {
  return clubYmd(new Date());
}

/** Shift a "YYYY-MM-DD" calendar day by whole days (timezone independent). */
export function addDaysToYmd(ymd: string, deltaDays: number): string {
  if (!YMD_RE.test(ymd)) return ymd;
  const [y, m, d] = ymd.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return shifted.toISOString().slice(0, 10);
}

/** Shift a "YYYY-MM-DD" calendar day by whole months (day overflow rolls forward). */
export function addMonthsToYmd(ymd: string, deltaMonths: number): string {
  if (!YMD_RE.test(ymd)) return ymd;
  const [y, m, d] = ymd.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1 + deltaMonths, d));
  return shifted.toISOString().slice(0, 10);
}

/** First calendar day of the month containing `ymd`. */
export function startOfMonthYmd(ymd: string): string {
  return YMD_RE.test(ymd) ? `${ymd.slice(0, 7)}-01` : ymd;
}

/** Last calendar day of the month containing `ymd`. */
export function endOfMonthYmd(ymd: string): string {
  if (!YMD_RE.test(ymd)) return ymd;
  const [y, m] = ymd.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ymd.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`;
}

/**
 * Display a calendar day that is already stored as "YYYY-MM-DD" (no timezone shifting).
 */
export function formatYmd(ymd: string | null | undefined): string | null {
  if (!ymd) return null;
  if (!YMD_RE.test(ymd)) return ymd;
  const [y, m, d] = ymd.split('-').map(Number);
  const asUtc = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(asUtc.getTime())) return ymd;
  return asUtc.toLocaleDateString(undefined, {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
