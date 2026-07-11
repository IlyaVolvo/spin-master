import { describe, expect, it } from 'vitest';
import {
  clampNumeric,
  commitNumericDraft,
  formatNumericRangeHint,
  isAcceptableNumericDraft,
  isOutOfRangeNumericDraft,
  sanitizeNumericDraft,
  valueToNumericDraft,
} from './boundedNumericInput';

describe('boundedNumericInput helpers', () => {
  it('formats range hints for min, max, or both', () => {
    expect(formatNumericRangeHint(2, 12)).toBe('Min: 2, Max: 12');
    expect(formatNumericRangeHint(2, undefined)).toBe('Min: 2');
    expect(formatNumericRangeHint(undefined, 10)).toBe('Max: 10');
    expect(formatNumericRangeHint()).toBeNull();
  });

  it('treats nullish values as empty draft', () => {
    expect(valueToNumericDraft(null)).toBe('');
    expect(valueToNumericDraft(undefined)).toBe('');
    expect(valueToNumericDraft(7)).toBe('7');
  });

  it('sanitizes to digits and strips leading zeros', () => {
    expect(sanitizeNumericDraft('12a3')).toBe('123');
    expect(sanitizeNumericDraft('007')).toBe('7');
    expect(sanitizeNumericDraft('0')).toBe('0');
    expect(sanitizeNumericDraft('')).toBe('');
  });

  it('allows below-min prefixes and same-digit over-max while typing', () => {
    expect(isAcceptableNumericDraft('', { min: 5, max: 32 })).toBe(true);
    expect(isAcceptableNumericDraft('1', { min: 5, max: 32 })).toBe(true);
    expect(isAcceptableNumericDraft('16', { min: 5, max: 32 })).toBe(true);
    expect(isAcceptableNumericDraft('13', { min: 5, max: 12 })).toBe(true);
    expect(isAcceptableNumericDraft('130', { min: 5, max: 12 })).toBe(false);
  });

  it('flags out-of-range drafts for red feedback', () => {
    expect(isOutOfRangeNumericDraft('', { min: 5, max: 32 })).toBe(false);
    expect(isOutOfRangeNumericDraft('1', { min: 5, max: 32 })).toBe(true);
    expect(isOutOfRangeNumericDraft('16', { min: 5, max: 32 })).toBe(false);
    expect(isOutOfRangeNumericDraft('13', { min: 5, max: 12 })).toBe(true);
    expect(isOutOfRangeNumericDraft('5', { min: 5, max: 12 })).toBe(false);
  });

  it('commits empty to null when allowed, otherwise clamps fallback', () => {
    expect(commitNumericDraft('', { allowEmpty: true })).toBeNull();
    expect(commitNumericDraft('', { allowEmpty: false, min: 3, fallback: 0 })).toBe(3);
    expect(commitNumericDraft('15', { min: 3, max: 12 })).toBe(12);
    expect(commitNumericDraft('1', { min: 3, max: 12 })).toBe(3);
  });

  it('clamps numeric values', () => {
    expect(clampNumeric(5, 3, 10)).toBe(5);
    expect(clampNumeric(1, 3, 10)).toBe(3);
    expect(clampNumeric(99, 3, 10)).toBe(10);
  });
});
