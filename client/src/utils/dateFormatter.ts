/**
 * Utility functions for formatting dates in tournaments
 */

/**
 * Compares two dates by year, month, and day (ignoring time)
 * Normalizes dates to UTC to avoid timezone issues
 */
export function areDatesEqual(date1: Date, date2: Date): boolean {
  // Normalize to UTC date strings (YYYY-MM-DD) for reliable comparison
  const date1Str = `${date1.getUTCFullYear()}-${String(date1.getUTCMonth() + 1).padStart(2, '0')}-${String(date1.getUTCDate()).padStart(2, '0')}`;
  const date2Str = `${date2.getUTCFullYear()}-${String(date2.getUTCMonth() + 1).padStart(2, '0')}-${String(date2.getUTCDate()).padStart(2, '0')}`;
  return date1Str === date2Str;
}

/**
 * Formats tournament dates, showing both created and recorded dates if different
 * @param createdAt - Tournament creation date
 * @param recordedAt - Tournament recorded date (optional)
 * @returns Formatted date string
 */
export function formatTournamentDates(
  createdAt: string,
  recordedAt?: string | null
): string {
  // If no recordedAt, just show creation date
  if (!recordedAt) {
    const createdDate = new Date(createdAt);
    return createdDate.toLocaleDateString().replace(/\n/g, ' ').trim();
  }

  // If recordedAt is the same as createdAt (same string), show only one
  if (recordedAt === createdAt) {
    const createdDate = new Date(createdAt);
    return createdDate.toLocaleDateString().replace(/\n/g, ' ').trim();
  }

  const createdDate = new Date(createdAt);
  const recordedDate = new Date(recordedAt);
  const createdDateStr = createdDate.toLocaleDateString().replace(/\n/g, ' ').trim();
  const recordedDateStr = recordedDate.toLocaleDateString().replace(/\n/g, ' ').trim();

  // If dates are the same (ignoring time), show only one
  if (areDatesEqual(createdDate, recordedDate)) {
    return createdDateStr;
  }

  // If different, show both on the same line separated by ' - '
  return `${createdDateStr} - ${recordedDateStr}`;
}

/**
 * Checks if a date falls within a date range (inclusive)
 * @param date - Date to check
 * @param startDate - Start of range (optional)
 * @param endDate - End of range (optional)
 * @returns True if date is within range
 */
export function isDateInRange(
  date: Date,
  startDate?: string | null,
  endDate?: string | null
): boolean {
  const dateStr = date.toISOString().split('T')[0];

  if (startDate && endDate) {
    return dateStr >= startDate && dateStr <= endDate;
  } else if (startDate) {
    return dateStr >= startDate;
  } else if (endDate) {
    return dateStr <= endDate;
  }

  return true; // No filters, include all
}

