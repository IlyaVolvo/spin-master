import { describe, expect, it } from 'vitest';
import {
  applyClubVisitUpdatedPatch,
  type CheckinStatusMap,
} from './CheckinKioskUI';

describe('applyClubVisitUpdatedPatch', () => {
  const clubDate = '2026-08-02';

  it('patches present and visitedToday for check-in', () => {
    const map: CheckinStatusMap = {};
    const next = applyClubVisitUpdatedPatch(
      map,
      {
        memberId: 10,
        action: 'CHECK_IN',
        clubDate,
        present: true,
        visitedToday: true,
        lastCheckInAt: '2026-08-02T15:00:00.000Z',
      },
      clubDate,
    );
    expect(next).toEqual({
      10: {
        present: true,
        visitedToday: true,
        lastCheckInAt: '2026-08-02T15:00:00.000Z',
      },
    });
  });

  it('clears present on checkout without clearing visitedToday', () => {
    const map: CheckinStatusMap = {
      10: {
        present: true,
        visitedToday: true,
        lastCheckInAt: '2026-08-02T15:00:00.000Z',
      },
    };
    const next = applyClubVisitUpdatedPatch(
      map,
      { memberId: 10, action: 'CHECK_OUT', clubDate, present: false },
      clubDate,
    );
    expect(next).toEqual({
      10: {
        present: false,
        visitedToday: true,
        lastCheckInAt: '2026-08-02T15:00:00.000Z',
      },
    });
  });

  it('returns null when event clubDate differs (force full refresh)', () => {
    const map: CheckinStatusMap = {
      10: { present: true, visitedToday: true, lastCheckInAt: null },
    };
    const next = applyClubVisitUpdatedPatch(
      map,
      { memberId: 10, clubDate: '2026-08-03', present: false },
      clubDate,
    );
    expect(next).toBeNull();
  });

  it('drops a member with no remaining presence signal', () => {
    const map: CheckinStatusMap = {
      10: { present: true, visitedToday: false, lastCheckInAt: null },
      11: { present: false, visitedToday: true, lastCheckInAt: null },
    };
    const next = applyClubVisitUpdatedPatch(
      map,
      { memberId: 10, present: false },
      clubDate,
    );
    expect(next).toEqual({
      11: { present: false, visitedToday: true, lastCheckInAt: null },
    });
  });

  it('ignores invalid memberId', () => {
    const map: CheckinStatusMap = {
      10: { present: true, visitedToday: true, lastCheckInAt: null },
    };
    expect(applyClubVisitUpdatedPatch(map, { memberId: 0, present: false }, clubDate)).toBe(map);
  });
});
