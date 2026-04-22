import {
  looksLikePlayersCsvHeaderRow,
  playersCsvCanonicalHeadersForParse,
  playersCsvLineHasEmailLikeValue,
} from '../../src/utils/playersCsvLayout';

describe('playersCsvLayout', () => {
  it('playersCsvCanonicalHeadersForParse matches export column order', () => {
    expect(playersCsvCanonicalHeadersForParse()).toEqual([
      'firstname',
      'lastname',
      'email',
      'date of birth',
      'gender',
      'roles',
      'phone',
      'address',
      'rating',
    ]);
  });

  it('looksLikePlayersCsvHeaderRow is true for typical header line', () => {
    expect(
      looksLikePlayersCsvHeaderRow([
        'FirstName',
        'LastName',
        'Email',
        'BirthDate',
        'Gender',
        'Rating',
      ])
    ).toBe(true);
  });

  it('looksLikePlayersCsvHeaderRow is true when email and birthdate columns are omitted', () => {
    expect(
      looksLikePlayersCsvHeaderRow(['FirstName', 'LastName', 'Gender', 'Rating'])
    ).toBe(true);
  });

  it('looksLikePlayersCsvHeaderRow is false when a cell contains an email', () => {
    expect(
      looksLikePlayersCsvHeaderRow([
        'Import',
        'One',
        'import1.functional@test.local',
        '2000-01-15',
        'MALE',
        '1500',
      ])
    ).toBe(false);
  });

  it('playersCsvLineHasEmailLikeValue detects @', () => {
    expect(playersCsvLineHasEmailLikeValue(['a', 'b@test.local'])).toBe(true);
    expect(playersCsvLineHasEmailLikeValue(['email', 'lastname'])).toBe(false);
  });
});
