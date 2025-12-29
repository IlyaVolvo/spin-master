/**
 * Utility functions for formatting and displaying ratings
 */

/**
 * Determines if a value is likely a ranking (1-100) vs a rating (typically 1000+)
 */
export function isLikelyRanking(value: number | null | undefined): boolean {
  return value !== null && value !== undefined && value <= 100;
}

/**
 * Gets the display rating for a player, handling legacy ranking values
 * @param storedRating - Rating stored at tournament time (may be legacy ranking)
 * @param currentRating - Player's current rating
 * @returns Rating to display, or null if unrated
 */
export function getDisplayRating(
  storedRating: number | null | undefined,
  currentRating: number | null | undefined
): number | null {
  // If stored rating looks like a ranking (1-100), use current rating instead
  if (isLikelyRanking(storedRating)) {
    return currentRating ?? null;
  }
  return storedRating ?? null;
}

/**
 * Formats rating display for completed tournaments (shows pre/post with diff)
 * @param preRating - Rating before tournament
 * @param postRating - Rating after tournament
 * @returns Formatted rating string or null
 */
export function formatCompletedTournamentRating(
  preRating: number | null | undefined,
  postRating: number | null | undefined
): string | null {
  // Handle old tournaments that might have ranking stored
  let pre = preRating;
  if (isLikelyRanking(pre)) {
    // Likely a ranking, skip showing pre-rating for old tournaments
    pre = null;
  }

  if (pre !== null && pre !== undefined && postRating !== null && postRating !== undefined) {
    const diff = postRating - pre;
    const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
    return `${pre} / ${postRating} (${diffStr})`;
  } else if (postRating !== null && postRating !== undefined) {
    return `${postRating}`;
  }

  return null;
}

/**
 * Formats rating display for active tournaments (shows pre-tournament rating)
 * @param storedRating - Rating stored at tournament time
 * @param currentRating - Player's current rating
 * @returns Formatted rating string or null
 */
export function formatActiveTournamentRating(
  storedRating: number | null | undefined,
  currentRating: number | null | undefined
): string | null {
  const rating = getDisplayRating(storedRating, currentRating);
  return rating !== null ? `${rating}` : null;
}

