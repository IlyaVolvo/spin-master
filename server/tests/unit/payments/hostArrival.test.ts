import { hostHasArrivedForSlot } from '../../../src/payments/hostArrival';
import { isHostSlotActive } from '../../../src/payments/hostWindowMath';

describe('isHostSlotActive', () => {
  const base = {
    clubDate: '2026-08-25',
    todayYmd: '2026-08-25',
    startAtMs: Date.parse('2026-08-25T10:00:00.000Z'),
    endAtMs: Date.parse('2026-08-25T14:00:00.000Z'),
  };

  it('is true during the slot window on the club day', () => {
    expect(
      isHostSlotActive({ ...base, nowMs: Date.parse('2026-08-25T12:00:00.000Z') }),
    ).toBe(true);
  });

  it('is false before start and after end', () => {
    expect(
      isHostSlotActive({ ...base, nowMs: Date.parse('2026-08-25T09:59:59.000Z') }),
    ).toBe(false);
    expect(
      isHostSlotActive({ ...base, nowMs: Date.parse('2026-08-25T14:00:01.000Z') }),
    ).toBe(false);
  });

  it('is false on a different club day', () => {
    expect(
      isHostSlotActive({
        ...base,
        todayYmd: '2026-08-26',
        nowMs: Date.parse('2026-08-25T12:00:00.000Z'),
      }),
    ).toBe(false);
  });
});

describe('hostHasArrivedForSlot', () => {
  const startAtMs = Date.parse('2026-08-25T10:00:00.000Z');

  it('is true when the shift was claimed', () => {
    expect(
      hostHasArrivedForSlot(
        {
          claimedAt: new Date('2026-08-25T09:50:00.000Z'),
          memberId: 1,
          clubDate: '2026-08-25',
          startAtMs,
        },
        [],
      ),
    ).toBe(true);
  });

  it('is true when the host checked in at or after slot start', () => {
    expect(
      hostHasArrivedForSlot(
        { claimedAt: null, memberId: 1, clubDate: '2026-08-25', startAtMs },
        [
          {
            memberId: 1,
            clubDate: '2026-08-25',
            checkInAt: new Date('2026-08-25T10:05:00.000Z'),
            checkOutAt: null,
          },
        ],
      ),
    ).toBe(true);
  });

  it('is true when an early check-in visit is still open at slot start', () => {
    expect(
      hostHasArrivedForSlot(
        { claimedAt: null, memberId: 1, clubDate: '2026-08-25', startAtMs },
        [
          {
            memberId: 1,
            clubDate: '2026-08-25',
            checkInAt: new Date('2026-08-25T09:00:00.000Z'),
            checkOutAt: null,
          },
        ],
      ),
    ).toBe(true);
  });

  it('is false when no one is assigned', () => {
    expect(
      hostHasArrivedForSlot(
        { claimedAt: null, memberId: null, clubDate: '2026-08-25', startAtMs },
        [],
      ),
    ).toBe(false);
  });

  it('is false when the assigned host has not checked in', () => {
    expect(
      hostHasArrivedForSlot(
        { claimedAt: null, memberId: 1, clubDate: '2026-08-25', startAtMs },
        [],
      ),
    ).toBe(false);
  });
});
