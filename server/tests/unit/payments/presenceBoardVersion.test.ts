/**
 * Presence-board version + club:visitUpdated emit payload
 */
jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import {
  bumpPresenceBoardVersion,
  getPresenceBoardVersion,
  resetPresenceBoardVersion,
} from '../../../src/payments/presenceBoardVersion';
import { emitClubVisitUpdated, setIO } from '../../../src/services/socketService';

describe('presenceBoardVersion', () => {
  beforeEach(() => {
    resetPresenceBoardVersion();
  });

  it('starts at 0 and bumps monotonically', () => {
    expect(getPresenceBoardVersion()).toBe(0);
    expect(bumpPresenceBoardVersion()).toBe(1);
    expect(bumpPresenceBoardVersion()).toBe(2);
    expect(getPresenceBoardVersion()).toBe(2);
  });
});

describe('emitClubVisitUpdated', () => {
  const emit = jest.fn();

  beforeEach(() => {
    resetPresenceBoardVersion();
    emit.mockClear();
    setIO({ emit } as any);
  });

  it('bumps version and includes patch fields on the socket payload', () => {
    emitClubVisitUpdated({
      memberId: 83,
      action: 'CHECK_IN',
      clubDate: '2026-08-02',
      visitId: 42,
      present: true,
      visitedToday: true,
      lastCheckInAt: '2026-08-02T12:00:00.000Z',
    });

    expect(getPresenceBoardVersion()).toBe(1);
    expect(emit).toHaveBeenCalledWith(
      'club:visitUpdated',
      expect.objectContaining({
        memberId: 83,
        action: 'CHECK_IN',
        clubDate: '2026-08-02',
        visitId: 42,
        version: 1,
        present: true,
        visitedToday: true,
        lastCheckInAt: '2026-08-02T12:00:00.000Z',
      }),
    );
  });

  it('increments version on each emit', () => {
    emitClubVisitUpdated({ memberId: 1, action: 'CHECK_OUT', present: false });
    emitClubVisitUpdated({ memberId: 2, action: 'AUTO_CHECK_OUT', present: false });

    expect(getPresenceBoardVersion()).toBe(2);
    expect(emit.mock.calls[0][1].version).toBe(1);
    expect(emit.mock.calls[1][1].version).toBe(2);
  });
});
