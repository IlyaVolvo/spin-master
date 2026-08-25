import {
  isHostNoShowDue,
  isHostReminderDue,
  visitCountsAsHostArrival,
} from '../../../src/payments/hostEmailMath';

describe('hostEmailMath', () => {
  const startAtMs = Date.parse('2026-08-25T18:00:00.000Z');

  it('opens the host reminder window minutes before start and closes at start', () => {
    expect(
      isHostReminderDue({
        nowMs: Date.parse('2026-08-25T16:59:59.000Z'),
        startAtMs,
        minutesBefore: 60,
        alreadySent: false,
      }),
    ).toBe(false);
    expect(
      isHostReminderDue({
        nowMs: Date.parse('2026-08-25T17:00:00.000Z'),
        startAtMs,
        minutesBefore: 60,
        alreadySent: false,
      }),
    ).toBe(true);
    expect(
      isHostReminderDue({
        nowMs: Date.parse('2026-08-25T18:00:00.000Z'),
        startAtMs,
        minutesBefore: 60,
        alreadySent: false,
      }),
    ).toBe(false);
    expect(
      isHostReminderDue({
        nowMs: Date.parse('2026-08-25T17:30:00.000Z'),
        startAtMs,
        minutesBefore: 60,
        alreadySent: true,
      }),
    ).toBe(false);
  });

  it('treats 0 minutes before as a one-minute window before start', () => {
    expect(
      isHostReminderDue({
        nowMs: Date.parse('2026-08-25T17:58:59.000Z'),
        startAtMs,
        minutesBefore: 0,
        alreadySent: false,
      }),
    ).toBe(false);
    expect(
      isHostReminderDue({
        nowMs: Date.parse('2026-08-25T17:59:00.000Z'),
        startAtMs,
        minutesBefore: 0,
        alreadySent: false,
      }),
    ).toBe(true);
  });

  it('sends no-show after start plus minutes unless they arrived', () => {
    expect(
      isHostNoShowDue({
        nowMs: Date.parse('2026-08-25T18:14:59.000Z'),
        startAtMs,
        minutesAfter: 15,
        alreadySent: false,
        arrived: false,
      }),
    ).toBe(false);
    expect(
      isHostNoShowDue({
        nowMs: Date.parse('2026-08-25T18:15:00.000Z'),
        startAtMs,
        minutesAfter: 15,
        alreadySent: false,
        arrived: false,
      }),
    ).toBe(true);
    expect(
      isHostNoShowDue({
        nowMs: Date.parse('2026-08-25T18:15:00.000Z'),
        startAtMs,
        minutesAfter: 15,
        alreadySent: false,
        arrived: true,
      }),
    ).toBe(false);
  });

  it('counts a visit as arrival if they are in at slot start or check in during the slot', () => {
    expect(
      visitCountsAsHostArrival({
        checkInAtMs: Date.parse('2026-08-25T17:00:00.000Z'),
        checkOutAtMs: Date.parse('2026-08-25T17:30:00.000Z'),
        slotStartMs: startAtMs,
      }),
    ).toBe(false);
    expect(
      visitCountsAsHostArrival({
        checkInAtMs: Date.parse('2026-08-25T17:00:00.000Z'),
        checkOutAtMs: null,
        slotStartMs: startAtMs,
      }),
    ).toBe(true);
    expect(
      visitCountsAsHostArrival({
        checkInAtMs: Date.parse('2026-08-25T18:05:00.000Z'),
        checkOutAtMs: null,
        slotStartMs: startAtMs,
      }),
    ).toBe(true);
  });
});
