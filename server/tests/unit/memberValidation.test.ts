import {
  getBirthDateBounds,
  isValidBirthDate,
  isValidEmailFormat,
  isValidMemberName,
  isValidPhoneNumber,
  isSuspiciousRating,
  isValidRatingInput,
} from '../../src/utils/memberValidation';

describe('memberValidation utils', () => {
  describe('isValidMemberName', () => {
    it('accepts valid names', () => {
      expect(isValidMemberName('John')).toBe(true);
      expect(isValidMemberName("O'Neil")).toBe(true);
      expect(isValidMemberName('Anne-Marie')).toBe(true);
      expect(isValidMemberName('Mary Jane')).toBe(true);
    });

    it('rejects invalid names', () => {
      expect(isValidMemberName('')).toBe(false);
      expect(isValidMemberName('A')).toBe(false);
      expect(isValidMemberName('John3')).toBe(false);
      expect(isValidMemberName('Jean_Claude')).toBe(false);
      expect(isValidMemberName('A'.repeat(51))).toBe(false);
    });
  });

  describe('getBirthDateBounds', () => {
    it('returns Jan 1 bounds for currentYear-105 and currentYear-5', () => {
      const currentYear = new Date().getUTCFullYear();
      const { minDate, maxDate } = getBirthDateBounds();

      expect(minDate.toISOString().split('T')[0]).toBe(`${currentYear - 105}-01-01`);
      expect(maxDate.toISOString().split('T')[0]).toBe(`${currentYear - 5}-01-01`);
    });
  });

  describe('isValidEmailFormat', () => {
    it('accepts valid emails', () => {
      expect(isValidEmailFormat('user@example.com')).toBe(true);
      expect(isValidEmailFormat('user.name+tag@sub.domain.org')).toBe(true);
    });

    it('rejects invalid emails', () => {
      expect(isValidEmailFormat('')).toBe(false);
      expect(isValidEmailFormat('user@domain')).toBe(false);
      expect(isValidEmailFormat('user@domain.c')).toBe(false);
      expect(isValidEmailFormat('user@@domain.com')).toBe(false);
    });
  });

  describe('isValidPhoneNumber', () => {
    it('accepts empty phone (optional)', () => {
      expect(isValidPhoneNumber('')).toBe(true);
      expect(isValidPhoneNumber('   ')).toBe(true);
    });

    it('accepts valid phone formats', () => {
      expect(isValidPhoneNumber('+1 (415) 555-2671')).toBe(true);
      expect(isValidPhoneNumber('415.555.2671')).toBe(true);
      expect(isValidPhoneNumber('14155552671')).toBe(true);
    });

    it('rejects invalid phone formats', () => {
      expect(isValidPhoneNumber('12345')).toBe(false);
      expect(isValidPhoneNumber('+1-800-FLOWERS')).toBe(false);
      expect(isValidPhoneNumber('1234567890123456')).toBe(false);
    });
  });

  describe('isValidBirthDate', () => {
    it('accepts dates within configured range', () => {
      const currentYear = new Date().getUTCFullYear();
      const minDate = new Date(Date.UTC(currentYear - 105, 0, 1));
      const maxDate = new Date(Date.UTC(currentYear - 5, 0, 1));
      const middleDate = new Date(Date.UTC(currentYear - 30, 5, 15));

      expect(isValidBirthDate(minDate)).toBe(true);
      expect(isValidBirthDate(maxDate)).toBe(true);
      expect(isValidBirthDate(middleDate)).toBe(true);
    });

    it('rejects invalid and out-of-range dates', () => {
      const currentYear = new Date().getUTCFullYear();
      const beforeMin = new Date(Date.UTC(currentYear - 106, 11, 31));
      const afterMax = new Date(Date.UTC(currentYear - 4, 0, 1));

      expect(isValidBirthDate('invalid-date')).toBe(false);
      expect(isValidBirthDate(beforeMin)).toBe(false);
      expect(isValidBirthDate(afterMax)).toBe(false);
    });
  });

  describe('isValidRatingInput', () => {
    it('accepts empty nullable inputs', () => {
      expect(isValidRatingInput(null)).toBe(true);
      expect(isValidRatingInput(undefined)).toBe(true);
      expect(isValidRatingInput('')).toBe(true);
      expect(isValidRatingInput('   ')).toBe(true);
    });

    it('accepts valid integer ratings including zero', () => {
      expect(isValidRatingInput(0)).toBe(true);
      expect(isValidRatingInput('0')).toBe(true);
      expect(isValidRatingInput(9999)).toBe(true);
      expect(isValidRatingInput('1234')).toBe(true);
    });

    it('rejects invalid ratings', () => {
      expect(isValidRatingInput(-1)).toBe(false);
      expect(isValidRatingInput(10000)).toBe(false);
      expect(isValidRatingInput(12.5)).toBe(false);
      expect(isValidRatingInput('abc')).toBe(false);
    });
  });

  describe('isSuspiciousRating', () => {
    it('returns true for ratings outside the usual 800-2100 range', () => {
      expect(isSuspiciousRating(799)).toBe(true);
      expect(isSuspiciousRating(2101)).toBe(true);
    });

    it('returns false for ratings inside the usual 800-2100 range', () => {
      expect(isSuspiciousRating(800)).toBe(false);
      expect(isSuspiciousRating(1500)).toBe(false);
      expect(isSuspiciousRating(2100)).toBe(false);
    });

    it('returns false for invalid or empty rating input', () => {
      expect(isSuspiciousRating(null)).toBe(false);
      expect(isSuspiciousRating('')).toBe(false);
      expect(isSuspiciousRating('abc')).toBe(false);
    });
  });
});
