/**
 * Club hours resolution and close-instant stamping
 */
jest.mock('../../../src/services/systemConfigService', () => ({
  CLUB_WEEKDAYS: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  getSystemConfig: jest.fn(),
}));

import { getSystemConfig } from '../../../src/services/systemConfigService';
import {
  clubCloseInstant,
  resolveHoursForClubDate,
  weekdayForYmd,
} from '../../../src/utils/clubHours';

const open = { closed: false as const, open: '10:00', close: '22:00' };
const closed = { closed: true as const };

describe('weekdayForYmd', () => {
  it('maps calendar days to weekday keys', () => {
    // 2026-07-31 is Friday
    expect(weekdayForYmd('2026-07-31')).toBe('fri');
    expect(weekdayForYmd('2026-08-01')).toBe('sat');
    expect(weekdayForYmd('2026-08-02')).toBe('sun');
  });
});

describe('resolveHoursForClubDate', () => {
  beforeEach(() => {
    (getSystemConfig as jest.Mock).mockReturnValue({
      branding: {
        weeklyHours: {
          mon: open,
          tue: open,
          wed: open,
          thu: open,
          fri: open,
          sat: closed,
          sun: closed,
        },
        hourOverrides: [
          {
            date: '2026-07-31',
            hours: { closed: false, open: '12:00', close: '18:00' },
            comment: 'Early close',
          },
        ],
      },
    });
  });

  it('uses weekday default when no override', () => {
    const r = resolveHoursForClubDate('2026-07-30');
    expect(r).toEqual({ hours: open, comment: null, source: 'weekly' });
  });

  it('uses override when present', () => {
    const r = resolveHoursForClubDate('2026-07-31');
    expect(r.source).toBe('override');
    expect(r.comment).toBe('Early close');
    expect(r.hours).toEqual({ closed: false, open: '12:00', close: '18:00' });
  });
});

describe('clubCloseInstant', () => {
  it('returns close wall-clock in club timezone', () => {
    const instant = clubCloseInstant('2026-07-31', {
      weeklyHours: {
        mon: open,
        tue: open,
        wed: open,
        thu: open,
        fri: { closed: false, open: '10:00', close: '22:00' },
        sat: closed,
        sun: closed,
      },
      hourOverrides: [],
      timeZone: 'UTC',
    });
    expect(instant.toISOString()).toBe('2026-07-31T22:00:00.000Z');
  });

  it('falls back to next day start when closed', () => {
    const instant = clubCloseInstant('2026-08-01', {
      weeklyHours: {
        mon: open,
        tue: open,
        wed: open,
        thu: open,
        fri: open,
        sat: closed,
        sun: closed,
      },
      hourOverrides: [],
      timeZone: 'UTC',
    });
    expect(instant.toISOString()).toBe('2026-08-02T00:00:00.000Z');
  });
});
