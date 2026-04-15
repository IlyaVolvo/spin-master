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
 * Heuristic: first line is a header when it contains the required column labels
 * (firstname, lastname, email, and birthdate or date of birth) and no cell looks
 * like an email address.
 */
export function looksLikePlayersCsvHeaderRow(cells: string[]): boolean {
  if (playersCsvLineHasEmailLikeValue(cells)) return false;
  const norm = cells.map((c) => c.toLowerCase().trim());
  if (!norm.includes('firstname') || !norm.includes('lastname') || !norm.includes('email')) {
    return false;
  }
  if (!norm.includes('birthdate') && !norm.includes('date of birth')) {
    return false;
  }
  return true;
}
