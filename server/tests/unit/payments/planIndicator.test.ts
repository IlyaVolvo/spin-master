import { computePlanIndicator } from '../../../src/payments/planIndicator';

describe('computePlanIndicator', () => {
  const reminders = { periodDaysBeforeExpiry: 14, visitPackVisitsRemaining: 2 };
  const now = new Date('2026-07-30T12:00:00.000Z');

  it('returns none when there is no current entitlement', () => {
    expect(computePlanIndicator(null, false, reminders, now)).toBe('none');
    expect(computePlanIndicator(null, true, reminders, now)).toBe('none');
  });

  it('returns none when CURRENT is already expired or exhausted', () => {
    expect(
      computePlanIndicator(
        { type: 'TIME_PERIOD', validTo: new Date('2026-07-29T12:00:00.000Z'), visitsRemaining: null },
        false,
        reminders,
        now,
      ),
    ).toBe('none');
    expect(
      computePlanIndicator(
        { type: 'VISIT_PACK', validTo: null, visitsRemaining: 0 },
        false,
        reminders,
        now,
      ),
    ).toBe('none');
  });

  it('returns active when CURRENT is healthy', () => {
    expect(
      computePlanIndicator(
        { type: 'TIME_PERIOD', validTo: new Date('2026-09-01T12:00:00.000Z'), visitsRemaining: null },
        false,
        reminders,
        now,
      ),
    ).toBe('active');
  });

  it('returns expiring_soon when near expiry and no FUTURE', () => {
    expect(
      computePlanIndicator(
        { type: 'TIME_PERIOD', validTo: new Date('2026-08-05T12:00:00.000Z'), visitsRemaining: null },
        false,
        reminders,
        now,
      ),
    ).toBe('expiring_soon');
    expect(
      computePlanIndicator(
        { type: 'VISIT_PACK', validTo: null, visitsRemaining: 2 },
        false,
        reminders,
        now,
      ),
    ).toBe('expiring_soon');
  });

  it('returns active when near expiry but FUTURE is queued', () => {
    expect(
      computePlanIndicator(
        { type: 'TIME_PERIOD', validTo: new Date('2026-08-05T12:00:00.000Z'), visitsRemaining: null },
        true,
        reminders,
        now,
      ),
    ).toBe('active');
  });
});
