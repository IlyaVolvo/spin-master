/**
 * Club-local calendar date helpers (payment date filters / club day)
 */
jest.mock('../../../src/services/systemConfigService', () => ({
  getClubTimezoneConfig: jest.fn(() => 'UTC'),
}));

import { getClubTimezoneConfig } from '../../../src/services/systemConfigService';
import {
  clubLocalDayRangeUtc,
  clubLocalDayStartUtc,
  getClubDate,
  getClubTimezone,
} from '../../../src/utils/clubDate';

describe('clubDate', () => {
  const originalTz = process.env.CLUB_TIMEZONE;

  beforeEach(() => {
    (getClubTimezoneConfig as jest.Mock).mockReturnValue('UTC');
    delete process.env.CLUB_TIMEZONE;
  });

  afterEach(() => {
    if (originalTz === undefined) delete process.env.CLUB_TIMEZONE;
    else process.env.CLUB_TIMEZONE = originalTz;
  });

  describe('getClubTimezone / getClubDate', () => {
    it('uses system config timezone when available', () => {
      (getClubTimezoneConfig as jest.Mock).mockReturnValue('America/Los_Angeles');
      expect(getClubTimezone()).toBe('America/Los_Angeles');
    });

    it('falls back to CLUB_TIMEZONE / UTC when config throws', () => {
      (getClubTimezoneConfig as jest.Mock).mockImplementation(() => {
        throw new Error('not initialized');
      });
      process.env.CLUB_TIMEZONE = 'America/Chicago';
      expect(getClubTimezone()).toBe('America/Chicago');
      delete process.env.CLUB_TIMEZONE;
      expect(getClubTimezone()).toBe('UTC');
    });

    it('formats a UTC instant as club-local YYYY-MM-DD', () => {
      (getClubTimezoneConfig as jest.Mock).mockReturnValue('America/Los_Angeles');
      // 2026-08-01 02:26 UTC = 2026-07-31 evening in LA
      expect(getClubDate(new Date('2026-08-01T02:26:30.191Z'))).toBe('2026-07-31');
    });
  });

  describe('clubLocalDayStartUtc', () => {
    it('rejects invalid YMD', () => {
      expect(() => clubLocalDayStartUtc('07-31-2026', 'UTC')).toThrow(/Invalid club-local date/);
    });

    it('returns UTC midnight for UTC club days', () => {
      expect(clubLocalDayStartUtc('2026-07-31', 'UTC').toISOString()).toBe(
        '2026-07-31T00:00:00.000Z',
      );
    });

    it('returns Pacific midnight as 07:00Z during PDT', () => {
      expect(clubLocalDayStartUtc('2026-07-31', 'America/Los_Angeles').toISOString()).toBe(
        '2026-07-31T07:00:00.000Z',
      );
    });
  });

  describe('clubLocalDayRangeUtc', () => {
    it('returns empty range when both bounds omitted', () => {
      expect(clubLocalDayRangeUtc(null, null, 'UTC')).toEqual({});
    });

    it('builds inclusive club-local day bounds for payment date filters', () => {
      const range = clubLocalDayRangeUtc('2026-07-31', '2026-07-31', 'America/Los_Angeles');
      expect(range.gte?.toISOString()).toBe('2026-07-31T07:00:00.000Z');
      expect(range.lt?.toISOString()).toBe('2026-08-01T07:00:00.000Z');
    });

    it('includes a payment recorded late UTC evening in the prior LA club day', () => {
      const range = clubLocalDayRangeUtc('2026-07-31', '2026-07-31', 'America/Los_Angeles');
      const paymentAt = new Date('2026-08-01T02:26:30.191Z'); // Jul 31 7:26 PM LA
      expect(range.gte!.getTime()).toBeLessThanOrEqual(paymentAt.getTime());
      expect(range.lt!.getTime()).toBeGreaterThan(paymentAt.getTime());
    });

    it('supports from-only and to-only filters', () => {
      const fromOnly = clubLocalDayRangeUtc('2026-07-31', null, 'UTC');
      expect(fromOnly.gte?.toISOString()).toBe('2026-07-31T00:00:00.000Z');
      expect(fromOnly.lt).toBeUndefined();

      const toOnly = clubLocalDayRangeUtc(null, '2026-07-31', 'UTC');
      expect(toOnly.gte).toBeUndefined();
      expect(toOnly.lt?.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    });
  });
});
