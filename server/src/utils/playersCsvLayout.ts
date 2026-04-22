/**
 * Column order for player CSV export and for import when no header row is detected.
 * Keep in sync with import switch cases in players routes / playerCsvUtils.
 */
export const PLAYERS_CSV_COLUMN_HEADERS = [
  'firstname',
  'lastname',
  'email',
  'date of birth',
  'gender',
  'roles',
  'phone',
  'address',
  'rating',
] as const;

/** Headers normalized the same way as parsed CSV header cells (import). */
export function playersCsvCanonicalHeadersForParse(): string[] {
  return PLAYERS_CSV_COLUMN_HEADERS.map((h) => h.toLowerCase().trim());
}

/** True if any cell looks like an email address (disambiguates header vs data). */
export function playersCsvLineHasEmailLikeValue(cells: string[]): boolean {
  return cells.some((c) => /\S+@\S+\.\S+/.test(c.trim()));
}

/**
 * Heuristic: first line is a header when it contains firstname + lastname labels
 * and no cell looks like an email address (so a data row with an email is not mistaken for headers).
 */
export function looksLikePlayersCsvHeaderRow(cells: string[]): boolean {
  if (playersCsvLineHasEmailLikeValue(cells)) return false;
  const norm = cells.map((c) => c.toLowerCase().trim());
  return norm.includes('firstname') && norm.includes('lastname');
}
