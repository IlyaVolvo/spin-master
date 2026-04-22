import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  calcAllowBirthDateInput,
  getEditBirthDateFieldError,
} from './playerEditBirthDateRules';

describe('calcAllowBirthDateInput', () => {
  it('allows admins editing another member', () => {
    expect(calcAllowBirthDateInput(true, false, Date.now())).toBe(true);
  });

  it('allows self-edit regardless of baseline DOB', () => {
    expect(calcAllowBirthDateInput(false, true, null)).toBe(true);
    expect(calcAllowBirthDateInput(false, true, 1_700_000_000_000)).toBe(true);
  });

  it('blocks non-admin when not editing self', () => {
    expect(calcAllowBirthDateInput(false, false, null)).toBe(false);
  });
});

describe('getEditBirthDateFieldError', () => {
  const rangeMsg = () => 'out of range';

  it('allows empty / not specified in all cases', () => {
    expect(getEditBirthDateFieldError(null, null, rangeMsg)).toBe('');
    expect(getEditBirthDateFieldError(1_700_000_000_000, null, rangeMsg)).toBe('');
  });

  it('accepts valid dates', () => {
    expect(getEditBirthDateFieldError(null, new Date('2001-06-15'), rangeMsg)).toBe('');
  });

  it('returns range message only when an invalid date is entered', () => {
    expect(getEditBirthDateFieldError(null, new Date('1850-01-01'), rangeMsg)).toBe('out of range');
  });
});

function BirthDateInputStub({ allow }: { allow: boolean }) {
  return <input type="text" data-testid="birth-input" aria-label="Birth date" disabled={!allow} />;
}

describe('RTL: birth date control', () => {
  it('enables input for non-admin self', () => {
    const allow = calcAllowBirthDateInput(false, true, null);
    render(<BirthDateInputStub allow={allow} />);
    expect(screen.getByTestId('birth-input')).not.toBeDisabled();
  });

  it('disables input for non-admin when editing someone else', () => {
    const allow = calcAllowBirthDateInput(false, false, null);
    render(<BirthDateInputStub allow={allow} />);
    expect(screen.getByTestId('birth-input')).toBeDisabled();
  });
});
