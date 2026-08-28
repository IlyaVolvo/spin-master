import {
  addMinutesToHhmm,
  daysBetweenYmd,
  eachYmdInclusive,
  formatMinutes,
  horizonEndYmd,
  isFifteenMinuteSnap,
  matchesRecurrence,
  memberAgeOnDate,
  normalizeWeekdays,
  mergeTouchingWindows,
  parseMinutes,
  priceCentsFromHourly,
  rangesOverlap,
  startOfWeekMonday,
  subtractBusyWindows,
  windowContains,
} from '../../src/utils/lessonTime';

describe('lessonTime', () => {
  it('parses, formats, and snaps 15-minute times', () => {
    expect(parseMinutes('16:30')).toBe(16 * 60 + 30);
    expect(formatMinutes(16 * 60 + 30)).toBe('16:30');
    expect(isFifteenMinuteSnap('16:30')).toBe(true);
    expect(isFifteenMinuteSnap('16:20')).toBe(false);
    expect(addMinutesToHhmm('16:45', 30)).toBe('17:15');
  });

  it('detects overlap and containment', () => {
    expect(rangesOverlap('10:00', '11:00', '11:00', '12:00', 0)).toBe(false);
    expect(rangesOverlap('10:00', '11:00', '10:30', '11:30', 0)).toBe(true);
    expect(windowContains('16:00', '18:00', '16:00', '17:00')).toBe(true);
    expect(windowContains('16:00', '18:00', '16:00', '18:15')).toBe(false);
  });

  it('subtracts buffered busy time and merges touching windows', () => {
    expect(
      subtractBusyWindows('10:00', '14:00', [{ startTime: '11:00', endTime: '12:00' }], 15),
    ).toEqual([
      { startTime: '10:00', endTime: '10:45' },
      { startTime: '12:15', endTime: '14:00' },
    ]);
    expect(
      mergeTouchingWindows([
        { startTime: '10:00', endTime: '11:00' },
        { startTime: '11:00', endTime: '12:00' },
        { startTime: '13:00', endTime: '14:00' },
      ]),
    ).toEqual([
      { startTime: '10:00', endTime: '12:00' },
      { startTime: '13:00', endTime: '14:00' },
    ]);
  });

  it('matches recurrence on weekdays and interval', () => {
    expect(
      matchesRecurrence({
        clubDate: '2026-08-24',
        startsOn: '2026-08-24',
        untilOn: null,
        weekdays: [],
        intervalWeeks: 1,
      }),
    ).toBe(true);
    expect(
      matchesRecurrence({
        clubDate: '2026-08-25',
        startsOn: '2026-08-24',
        untilOn: null,
        weekdays: [],
        intervalWeeks: 1,
      }),
    ).toBe(false);
    expect(
      matchesRecurrence({
        clubDate: '2026-08-31',
        startsOn: '2026-08-24',
        untilOn: null,
        weekdays: ['mon'],
        intervalWeeks: 1,
      }),
    ).toBe(true);
    expect(
      matchesRecurrence({
        clubDate: '2026-08-31',
        startsOn: '2026-08-24',
        untilOn: null,
        weekdays: ['mon'],
        intervalWeeks: 2,
      }),
    ).toBe(false);
  });

  it('walks dates and horizon', () => {
    expect(daysBetweenYmd('2026-08-24', '2026-08-31')).toBe(7);
    expect(eachYmdInclusive('2026-08-24', '2026-08-26')).toEqual([
      '2026-08-24',
      '2026-08-25',
      '2026-08-26',
    ]);
    expect(horizonEndYmd(3, '2026-08-22')).toBe('2026-11-22');
    expect(startOfWeekMonday('2026-08-26')).toBe('2026-08-24');
  });

  it('prices from hourly rate and computes age', () => {
    expect(priceCentsFromHourly(6000, 90)).toBe(9000);
    expect(memberAgeOnDate('2010-08-22', '2026-08-22')).toBe(16);
    expect(memberAgeOnDate('2010-08-23', '2026-08-22')).toBe(15);
    expect(normalizeWeekdays(['Mon', 'mon', 'xyz', 'sun'])).toEqual(['mon', 'sun']);
  });
});
