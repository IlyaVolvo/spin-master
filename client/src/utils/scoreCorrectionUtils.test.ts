import { describe, expect, it } from 'vitest';
import {
  computeActiveModificationEligibility,
  getCorrectionBannerText,
  isCorrectionClick,
  isCorrectionTargetMatch,
  isMatchCorrectable,
  scoredMatchIdsForTournament,
  shouldOpenCorrectionEditor,
  tournamentCorrectionEligibility,
  tournamentHasCorrectionTargets,
} from './scoreCorrectionUtils';

describe('scoreCorrectionUtils', () => {
  it('isMatchCorrectable respects eligibility', () => {
    expect(isMatchCorrectable(5, { allowed: true, correctableMatchIds: [5, 6] })).toBe(true);
    expect(isMatchCorrectable(7, { allowed: true, correctableMatchIds: [5, 6] })).toBe(false);
    expect(isMatchCorrectable(5, { allowed: false, correctableMatchIds: [5] })).toBe(false);
  });

  it('getCorrectionBannerText shows mode or blocked reason', () => {
    expect(getCorrectionBannerText(false, true, { allowed: true, correctableMatchIds: [1] })).toBeNull();
    expect(getCorrectionBannerText(true, false, { allowed: true, correctableMatchIds: [1] })).toBeNull();
    expect(getCorrectionBannerText(true, true, { allowed: true, correctableMatchIds: [1] }, 'ACTIVE')).toMatch(
      /modification/i,
    );
    expect(getCorrectionBannerText(true, true, { allowed: true, correctableMatchIds: [1] }, 'COMPLETED')).toMatch(
      /correction/i,
    );
    expect(
      getCorrectionBannerText(true, true, {
        allowed: false,
        reason: 'ratings changed',
        correctableMatchIds: [],
      }),
    ).toMatch(/ratings changed/);
  });

  it('isCorrectionClick requires organizer, ctrl key, and eligible match', () => {
    const eligibility = { allowed: true, correctableMatchIds: [5] };
    expect(isCorrectionClick({ ctrlKey: true }, true, 5, eligibility)).toBe(true);
    expect(isCorrectionClick({ ctrlKey: false }, true, 5, eligibility)).toBe(false);
    expect(isCorrectionClick({ ctrlKey: true }, false, 5, eligibility)).toBe(false);
    expect(isCorrectionClick({ ctrlKey: true }, true, 7, eligibility)).toBe(false);
  });

  it('shouldOpenCorrectionEditor requires correction mode and eligible match', () => {
    const eligibility = { allowed: true, correctableMatchIds: [5] };
    expect(shouldOpenCorrectionEditor(true, 5, eligibility)).toBe(true);
    expect(shouldOpenCorrectionEditor(false, 5, eligibility)).toBe(false);
    expect(shouldOpenCorrectionEditor(true, 7, eligibility)).toBe(false);
  });

  it('isCorrectionTargetMatch and tournamentHasCorrectionTargets', () => {
    const eligibility = { allowed: true, correctableMatchIds: [5, 6] };
    expect(isCorrectionTargetMatch(5, eligibility)).toBe(true);
    expect(isCorrectionTargetMatch(7, eligibility)).toBe(false);
    expect(tournamentHasCorrectionTargets(eligibility)).toBe(true);
    expect(tournamentHasCorrectionTargets({ allowed: false, correctableMatchIds: [] })).toBe(false);
  });

  it('tournamentCorrectionEligibility derives ACTIVE targets from matches, ignoring stale server block', () => {
    const tournament = {
      id: 1,
      status: 'ACTIVE' as const,
      matches: [{ id: 9, member1Id: 1, member2Id: 2, player1Sets: 3, player2Sets: 1 }],
      participants: [],
      correctionEligibility: {
        allowed: false,
        reason: 'Complete the tournament before correcting scores',
        correctableMatchIds: [],
      },
    };
    expect(tournamentCorrectionEligibility(tournament as any)).toEqual({
      allowed: true,
      correctableMatchIds: [9],
    });
    expect(scoredMatchIdsForTournament(tournament as any)).toEqual([9]);
    expect(computeActiveModificationEligibility(tournament as any).allowed).toBe(true);
  });

  it('computeActiveModificationEligibility handles empty scored matches', () => {
    const tournament = {
      id: 1,
      status: 'ACTIVE' as const,
      matches: [{ id: 1, member1Id: 1, member2Id: 2, player1Sets: 0, player2Sets: 0 }],
      participants: [],
    };
    expect(computeActiveModificationEligibility(tournament as any)).toEqual({
      allowed: false,
      reason: 'No scored matches to modify',
      correctableMatchIds: [],
    });
  });
});
