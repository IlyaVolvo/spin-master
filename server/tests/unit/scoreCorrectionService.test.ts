/**
 * Score correction — unit tests for drift detection helpers.
 */

import { findRatingDriftReason, matchHasResult } from '../../src/utils/scoreCorrectionMatchUtils';
import {
  buildBasicCorrectionEligibility,
  getCompoundPreliminaryCorrectionBlockReason,
  scoredMatchIds,
} from '../../src/plugins/scoreCorrectionHelpers';
import { attachCorrectionEligibility } from '../../src/services/scoreCorrectionService';

jest.mock('../../src/services/usattRatingService', () => ({
  createRatingHistoryForRoundRobinTournament: jest.fn(),
  adjustRatingsForSingleMatch: jest.fn(),
}));

describe('matchHasResult', () => {
  it('detects scored and forfeit matches', () => {
    expect(matchHasResult({ player1Sets: 3, player2Sets: 1 })).toBe(true);
    expect(matchHasResult({ player1Forfeit: true, player1Sets: 0, player2Sets: 0 })).toBe(true);
    expect(matchHasResult({ player1Sets: 0, player2Sets: 0 })).toBe(false);
  });
});

describe('findRatingDriftReason', () => {
  it('blocks cancelled tournaments', async () => {
    const reason = await findRatingDriftReason({} as any, {
      cancelled: true,
      status: 'COMPLETED',
      participants: [{ memberId: 1 }],
    });
    expect(reason).toMatch(/cancelled/i);
  });

  it('blocks when a participant has rating history after completion watermark', async () => {
    const completionTime = new Date('2026-01-01T12:00:00Z');
    const prisma = {
      ratingHistory: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({ timestamp: completionTime, id: 10 })
          .mockResolvedValueOnce({
            reason: 'MATCH_COMPLETED',
            tournamentId: 99,
            memberId: 1,
          }),
      },
      tournament: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Later Event' }),
      },
      member: {
        findUnique: jest.fn().mockResolvedValue({ firstName: 'Alex', lastName: 'Kim' }),
      },
    };

    const reason = await findRatingDriftReason(prisma, {
      id: 1,
      cancelled: false,
      status: 'COMPLETED',
      recordedAt: completionTime,
      participants: [{ memberId: 1 }],
    });

    expect(reason).toMatch(/Alex Kim's rating changed after completion/i);
    expect(reason).toMatch(/Later Event/);
    expect(reason).not.toMatch(/^Correction unavailable/);
  });

  it('allows when no drift exists', async () => {
    const completionTime = new Date('2026-01-01T12:00:00Z');
    const prisma = {
      ratingHistory: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ timestamp: completionTime, id: 10 })
          .mockResolvedValueOnce(null),
      },
    };

    const reason = await findRatingDriftReason(prisma, {
      id: 1,
      cancelled: false,
      status: 'COMPLETED',
      recordedAt: completionTime,
      participants: [{ memberId: 1 }],
    });

    expect(reason).toBeNull();
  });
});

describe('buildBasicCorrectionEligibility', () => {
  it('returns allowed with match ids when drift check passes', async () => {
    const completionTime = new Date('2026-01-01T12:00:00Z');
    const prisma = {
      ratingHistory: {
        findFirst: jest.fn().mockResolvedValueOnce({ timestamp: completionTime, id: 1 }).mockResolvedValueOnce(null),
      },
    };
    const tournament = {
      id: 1,
      status: 'COMPLETED',
      recordedAt: completionTime,
      participants: [{ memberId: 1 }],
      matches: [{ id: 5, player1Sets: 3, player2Sets: 1 }],
    };

    const result = await buildBasicCorrectionEligibility(prisma, tournament, scoredMatchIds(tournament));
    expect(result.allowed).toBe(true);
    expect(result.correctableMatchIds).toEqual([5]);
  });
});

describe('getCompoundPreliminaryCorrectionBlockReason', () => {
  it('allows multi-RR groups independently when siblings are still active', async () => {
    const prisma = {
      tournament: {
        findMany: jest.fn().mockResolvedValue([
          { id: 10, type: 'ROUND_ROBIN', groupNumber: 1, matches: [] },
          { id: 11, type: 'ROUND_ROBIN', groupNumber: 2, status: 'ACTIVE', matches: [] },
        ]),
        findUnique: jest.fn().mockResolvedValue({ type: 'MULTI_ROUND_ROBINS' }),
      },
    };

    const reason = await getCompoundPreliminaryCorrectionBlockReason(prisma, {
      parentTournamentId: 1,
      type: 'ROUND_ROBIN',
      groupNumber: 1,
    });

    expect(reason).toBeNull();
  });

  it('blocks preliminary RR correction once the final phase has started', async () => {
    const prisma = {
      tournament: {
        findMany: jest.fn().mockResolvedValue([
          { id: 10, type: 'ROUND_ROBIN', groupNumber: 1, matches: [] },
          { id: 20, type: 'PLAYOFF', matches: [{ player1Sets: 3, player2Sets: 1 }] },
        ]),
        findUnique: jest.fn().mockResolvedValue({ type: 'PRELIMINARY_WITH_FINAL_PLAYOFF' }),
      },
    };

    const reason = await getCompoundPreliminaryCorrectionBlockReason(prisma, {
      parentTournamentId: 1,
      type: 'ROUND_ROBIN',
      groupNumber: 1,
    });

    expect(reason).toMatch(/final phase has already started/i);
  });

  it('does not block final-phase child tournaments', async () => {
    const prisma = {
      tournament: {
        findUnique: jest.fn().mockResolvedValue({ type: 'PRELIMINARY_WITH_FINAL_PLAYOFF' }),
      },
    };

    const reason = await getCompoundPreliminaryCorrectionBlockReason(prisma, {
      parentTournamentId: 1,
      type: 'PLAYOFF',
      groupNumber: null,
    });

    expect(reason).toBeNull();
  });
});

describe('attachCorrectionEligibility', () => {
  it('enriches completed child tournaments even when parent is active', async () => {
    const completionTime = new Date('2026-01-01T12:00:00Z');
    const prisma = {
      ratingHistory: {
        findFirst: jest.fn(async (args: any) => {
          if (args?.where?.tournamentId && args?.orderBy) {
            return { timestamp: completionTime, id: 10 };
          }
          return null;
        }),
      },
      tournament: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const parent = {
      id: 1,
      type: 'MULTI_ROUND_ROBINS',
      status: 'ACTIVE',
      cancelled: false,
      childTournaments: [
        {
          id: 2,
          status: 'COMPLETED',
          cancelled: false,
          type: 'ROUND_ROBIN',
          parentTournamentId: 1,
          recordedAt: completionTime,
          participants: [{ memberId: 1 }, { memberId: 2 }],
          matches: [{ id: 42, member1Id: 1, member2Id: 2, player1Sets: 3, player2Sets: 1 }],
        },
      ],
    };

    const enriched = await attachCorrectionEligibility(parent, prisma);
    expect(enriched.correctionEligibility).toEqual({
      allowed: false,
      reason: 'Correct scores on individual group or final child tournaments',
      correctableMatchIds: [],
    });
    expect(enriched.childTournaments[0].correctionEligibility).toEqual({
      allowed: true,
      correctableMatchIds: [42],
    });
  });
});
