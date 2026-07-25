/**
 * Helpers for bounded numeric text entry (settings / setup — not match scores).
 * Empty draft is allowed while typing; first digit becomes the visible value.
 * Intermediate values below min (or briefly above max) are allowed so multi-digit
 * entry works; out-of-range drafts are flagged for UI feedback and clamped on commit.
 */

export function formatNumericRangeHint(min?: number, max?: number): string | null {
  const hasMin = min !== undefined && min !== null && Number.isFinite(min);
  const hasMax = max !== undefined && max !== null && Number.isFinite(max);
  if (hasMin && hasMax) return `Min: ${min}, Max: ${max}`;
  if (hasMin) return `Min: ${min}`;
  if (hasMax) return `Max: ${max}`;
  return null;
}

export function valueToNumericDraft(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return String(value);
}

/** Keep only digits (optional leading minus for future signed fields). */
export function sanitizeNumericDraft(raw: string, { allowNegative = false } = {}): string {
  if (raw === '') return '';
  if (allowNegative && raw === '-') return '-';
  const cleaned = allowNegative
    ? raw.replace(/[^\d-]/g, '').replace(/(?!^)-/g, '')
    : raw.replace(/\D/g, '');
  // Strip leading zeros except a single "0"
  if (cleaned === '' || cleaned === '-') return cleaned;
  const negative = cleaned.startsWith('-');
  const digits = (negative ? cleaned.slice(1) : cleaned).replace(/^0+(?=\d)/, '');
  return negative ? `-${digits}` : digits;
}

function maxAllowedDigitCount(min?: number, max?: number): number {
  const lengths: number[] = [1];
  if (min !== undefined && Number.isFinite(min)) {
    lengths.push(String(Math.trunc(Math.abs(min))).length);
  }
  if (max !== undefined && Number.isFinite(max)) {
    lengths.push(String(Math.trunc(Math.abs(max))).length);
  }
  return Math.max(...lengths);
}

/**
 * Whether a draft is acceptable while typing.
 * Values below min or above max are allowed mid-edit (so "1" then "6" works when min is 5),
 * but digit length is capped to the wider of min/max so entry cannot grow forever.
 */
export function isAcceptableNumericDraft(
  draft: string,
  { min, max, allowEmpty = true }: { min?: number; max?: number; allowEmpty?: boolean } = {},
): boolean {
  if (draft === '' || draft === '-') return allowEmpty;
  const n = Number(draft);
  if (!Number.isFinite(n)) return false;
  const digits = draft.replace(/^-/, '');
  if (digits.length > maxAllowedDigitCount(min, max)) return false;
  return true;
}

/** True when the draft parses to a number outside [min, max]. Empty is not out of range. */
export function isOutOfRangeNumericDraft(
  draft: string,
  { min, max }: { min?: number; max?: number } = {},
): boolean {
  if (draft === '' || draft === '-') return false;
  const n = Number(draft);
  if (!Number.isFinite(n)) return false;
  if (min !== undefined && Number.isFinite(min) && n < min) return true;
  if (max !== undefined && Number.isFinite(max) && n > max) return true;
  return false;
}

export function commitNumericDraft(
  draft: string,
  {
    min,
    max,
    allowEmpty = false,
    fallback = 0,
  }: {
    min?: number;
    max?: number;
    allowEmpty?: boolean;
    fallback?: number;
  } = {},
): number | null {
  if (draft.trim() === '' || draft === '-') {
    return allowEmpty ? null : clampNumeric(fallback, min, max);
  }
  const n = Number(draft);
  if (!Number.isFinite(n)) {
    return allowEmpty ? null : clampNumeric(fallback, min, max);
  }
  return clampNumeric(n, min, max);
}

export function clampNumeric(value: number, min?: number, max?: number): number {
  let next = value;
  if (min !== undefined && Number.isFinite(min)) next = Math.max(min, next);
  if (max !== undefined && Number.isFinite(max)) next = Math.min(max, next);
  return next;
}
