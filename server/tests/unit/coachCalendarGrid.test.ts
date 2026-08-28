import {
  buildDayCells,
  buildTimeAxis,
  isEditSessionActive,
  isValidDurationStart,
  reminderIsDue,
} from '../../src/services/coachCalendarGrid';
import { startOfWeekMonday, untilOnForWeeklyCount } from '../../src/utils/lessonTime';

describe('coachCalendarGrid', () => {
  it('treats edit session as active only before expiry', () => {
    const now = new Date('2026-08-26T20:00:00.000Z');
    expect(isEditSessionActive(new Date('2026-08-26T20:01:00.000Z'), now)).toBe(true);
    expect(isEditSessionActive(new Date('2026-08-26T19:59:00.000Z'), now)).toBe(false);
    expect(isEditSessionActive(null, now)).toBe(false);
  });

  it('builds a 15-minute axis from club hours', () => {
    const axis = buildTimeAxis([
      { closed: true },
      { closed: false, open: '10:00', close: '22:00' },
      { closed: false, open: '16:00', close: '18:00' },
    ]);
    expect(axis).toEqual({ start: '10:00', end: '22:00' });
  });

  it('marks closed, unavailable, available, and reserved cells', () => {
    const cells = buildDayCells({
      hours: { closed: false, open: '16:00', close: '18:00' },
      axisStart: '16:00',
      axisEnd: '18:00',
      availability: [{ startTime: '16:00', endTime: '17:30' }],
      reserved: [{ startTime: '16:30', endTime: '17:00', lessonId: 9, mine: true }],
    });
    const byStart = Object.fromEntries(cells.map((c) => [c.startTime, c]));
    expect(byStart['16:00'].state).toBe('available');
    expect(byStart['16:30'].state).toBe('reserved');
    expect(byStart['16:30'].mine).toBe(true);
    expect(byStart['16:30'].lessonId).toBe(9);
    expect(byStart['17:00'].state).toBe('available');
    expect(byStart['17:30'].state).toBe('unavailable');
  });

  it('requires a full available span for a duration start', () => {
    const cells = buildDayCells({
      hours: { closed: false, open: '16:00', close: '18:00' },
      axisStart: '16:00',
      axisEnd: '18:00',
      availability: [{ startTime: '16:00', endTime: '17:00' }],
      reserved: [],
    });
    expect(isValidDurationStart(cells, '16:00', 60)).toBe(true);
    expect(isValidDurationStart(cells, '16:15', 60)).toBe(false);
    expect(isValidDurationStart(cells, '16:00', 90)).toBe(false);
  });

  it('sends reminders in the lead window and not after start', () => {
    const start = new Date('2026-08-26T23:00:00.000Z');
    expect(
      reminderIsDue({
        clubStart: start,
        reminderHours: 2,
        reminderSentAt: null,
        now: new Date('2026-08-26T21:00:00.000Z'),
      }),
    ).toBe(true);
    expect(
      reminderIsDue({
        clubStart: start,
        reminderHours: 2,
        reminderSentAt: null,
        now: new Date('2026-08-26T20:59:00.000Z'),
      }),
    ).toBe(false);
    expect(
      reminderIsDue({
        clubStart: start,
        reminderHours: 0,
        reminderSentAt: null,
        now: new Date('2026-08-26T22:00:00.000Z'),
      }),
    ).toBe(false);
    expect(
      reminderIsDue({
        clubStart: start,
        reminderHours: 2,
        reminderSentAt: null,
        now: new Date('2026-08-26T23:00:00.000Z'),
      }),
    ).toBe(false);
  });

  it('computes week start and until date for 1/2/4-week repeats', () => {
    expect(startOfWeekMonday('2026-08-26')).toBe('2026-08-24');
    expect(untilOnForWeeklyCount('2026-08-26', 1)).toBe('2026-08-26');
    expect(untilOnForWeeklyCount('2026-08-26', 2)).toBe('2026-09-02');
    expect(untilOnForWeeklyCount('2026-08-26', 4)).toBe('2026-09-16');
  });
});
