import { parseBirthDateFromCsvValue } from '../../src/utils/memberValidation';

describe('parseBirthDateFromCsvValue', () => {
  it('rejects impossible month/day in YYYY-MM-DD', () => {
    expect(parseBirthDateFromCsvValue('1999-13-24')).toBeNull();
    expect(parseBirthDateFromCsvValue('1999-02-30')).toBeNull();
  });

  it('accepts valid YYYY-MM-DD', () => {
    const d = parseBirthDateFromCsvValue('1999-12-24');
    expect(d).not.toBeNull();
    expect(d!.toISOString().startsWith('1999-12-24')).toBe(true);
  });
});
