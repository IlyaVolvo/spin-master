import { randomInt } from 'crypto';
import { getAuthPolicyConfig } from '../services/systemConfigService';

/** Default PIN length when authPolicy is unavailable (should match systemConfig default). */
export const DEFAULT_SCORE_PIN_LENGTH = 4;

export function getScorePinLength(): number {
  try {
    return getAuthPolicyConfig().pinLength;
  } catch {
    return DEFAULT_SCORE_PIN_LENGTH;
  }
}

/** Cryptographically random digit-only PIN of the configured (or given) length. */
export function generateScorePin(length: number = getScorePinLength()): string {
  const n = Math.max(4, Math.min(12, Math.floor(length) || DEFAULT_SCORE_PIN_LENGTH));
  let pin = '';
  for (let i = 0; i < n; i++) {
    pin += String(randomInt(0, 10));
  }
  return pin;
}

export function normalizeScorePin(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Validate a user-chosen score PIN: digits only, exact club-configured length.
 * Returns an error message or null if valid.
 */
export function validateScorePinFormat(value: unknown): string | null {
  const pin = normalizeScorePin(value);
  const length = getScorePinLength();
  if (!pin) {
    return 'PIN is required';
  }
  if (!/^\d+$/.test(pin)) {
    return 'PIN must contain only digits';
  }
  if (pin.length !== length) {
    return `PIN must be exactly ${length} digits`;
  }
  return null;
}

export function scorePinsEqual(provided: unknown, expected: string | null | undefined): boolean {
  const pin = normalizeScorePin(provided);
  if (!pin || expected == null || expected === '') {
    return false;
  }
  return pin === expected;
}
