export function getClubTimezone(): string {
  return process.env.CLUB_TIMEZONE || 'UTC';
}

/** Returns the club-local date string "YYYY-MM-DD" for a given instant. */
export function getClubDate(date: Date = new Date()): string {
  return date.toLocaleDateString('en-CA', { timeZone: getClubTimezone() }); // en-CA gives YYYY-MM-DD
}
