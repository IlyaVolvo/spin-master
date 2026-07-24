import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  buildMatchScorePayload,
  shouldSurfaceMatchScoreError,
  validateMatchScoreData,
} from './matchScoreSubmit';
import { ScorePinAuthError } from './matchScorePayload';

vi.mock('./auth', () => ({
  getMember: () => ({ id: 1 }),
  isOrganizer: () => false,
  isKioskMode: () => true,
}));

describe('matchScoreSubmit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects equal scores and double forfeits', () => {
    expect(
      validateMatchScoreData({
        member1Id: 1,
        member2Id: 2,
        player1Sets: 3,
        player2Sets: 3,
      })
    ).toMatch(/equal/i);

    expect(
      validateMatchScoreData({
        member1Id: 1,
        member2Id: 2,
        player1Forfeit: true,
        player2Forfeit: true,
      })
    ).toMatch(/forfeit/i);

    expect(
      validateMatchScoreData({
        member1Id: 1,
        member2Id: 2,
        player1Sets: 3,
        player2Sets: 1,
      })
    ).toBeNull();
  });

  it('builds payload with sets and kiosk PINs', () => {
    const payload = buildMatchScorePayload(
      {
        member1Id: 1,
        member2Id: 2,
        player1Sets: 3,
        player2Sets: 1,
      },
      { member1Pin: '1234', member2Pin: '5678' }
    );
    expect(payload).toMatchObject({
      member1Id: 1,
      member2Id: 2,
      player1Sets: 3,
      player2Sets: 1,
      member1Pin: '1234',
      member2Pin: '5678',
    });
  });

  it('does not surface PIN auth errors as page banners', () => {
    expect(shouldSurfaceMatchScoreError(new ScorePinAuthError('bad', { member1: true, member2: false }))).toBe(
      false
    );
    expect(shouldSurfaceMatchScoreError(new Error('Incorrect PIN — please re-enter'))).toBe(false);
    expect(shouldSurfaceMatchScoreError(new Error('Network down'))).toBe(true);
  });
});
