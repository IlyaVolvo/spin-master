/**
 * Monotonic presence-board version for check-in kiosk sync.
 * Bumped together with club:visitUpdated emits (single Node process).
 */

let presenceBoardVersion = 0;

export function getPresenceBoardVersion(): number {
  return presenceBoardVersion;
}

/** Increment and return the new version. */
export function bumpPresenceBoardVersion(): number {
  presenceBoardVersion += 1;
  return presenceBoardVersion;
}

/** Test helper */
export function resetPresenceBoardVersion(): void {
  presenceBoardVersion = 0;
}
