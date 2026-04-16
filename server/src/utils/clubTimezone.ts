/**
 * Club-local calendar date (YYYY-MM-DD) for visit idempotency and daily payment rules.
 * Uses CLUB_TIMEZONE (IANA), e.g. America/New_York. Defaults to UTC.
 */
export function getClubTimezone(): string {
  const tz = process.env.CLUB_TIMEZONE?.trim();
  return tz && tz.length > 0 ? tz : 'UTC';
}

export function getClubDateString(date: Date = new Date(), timeZone?: string): string {
  const tz = timeZone ?? getClubTimezone();
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
}

/** Previous calendar day in club timezone (for end-of-day auto checkout cron). */
export function getPreviousClubDateString(now: Date = new Date(), timeZone?: string): string {
  const tz = timeZone ?? getClubTimezone();
  const prev = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return getClubDateString(prev, tz);
}
