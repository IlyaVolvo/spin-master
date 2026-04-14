/**
 * PlayoffPlugin — Unit Tests
 * 
 * Tests all plugin methods in isolation using mock data.
 * No database, no HTTP server — pure logic testing.
 * 
 * Playoff tournaments use a bracket structure:
 * - BracketMatch records define the bracket (round, position, member1Id, member2Id)
 * - Match records store actual results (linked via bracketMatch.matchId)
 * - BYE matches have member1Id=0 or member2Id=0
 * - Winner advances to next round via advanceWinner()
 * - Tournament is complete when the finals match (round=1) is played
 * 
 * Key concepts:
 * - jest.mock() with dynamic imports: PlayoffPlugin uses `await import(...)` for
 *   services, so we mock those modules at the top level
 * - Mock Prisma: bracket-specific queries (bracketMatch.findUnique, findFirst, etc.)
 */

import { PlayoffPlugin } from '../../src/plugins/PlayoffPlugin';

// Mock the playoff bracket service (dynamically imported by the plugin)
jest.mock('../../src/services/playoffBracketService', () => ({
  createPlayoffBracketWithPositions: jest.fn().mockResolvedValue(undefined),
  advanceWinner: jest.fn().mockResolvedValue({ tournamentCompleted: false }),
  recordPlayoffBracketMatchResult: jest.fn(),
  getBracketStructure: jest.fn().mockResolvedValue({ bracketMatches: [] }),
  generateSeeding: jest.fn((participants: any[]) => participants),
  generateBracketPositions: jest.fn(() => []),
  calculateBracketSize: jest.fn((n: number) => {
    let size = 2;
    while (size < n) size *= 2;
    return size;
  }),
  PlayoffBracketResultError: class PlayoffBracketResultError extends Error {
    constructor(message: string, public readonly statusCode: number = 400) {
      super(message);
      this.name = 'PlayoffBracketResultError';
    }
  },
}));

// Mock the match rating service (dynamically imported by the plugin)
jest.mock('../../src/services/matchRatingService', () => ({
  processMatchRating: jest.fn().mockResolvedValue(undefined),
}));

// ─── Helper: Build mock playoff tournament objects ─────────────────────────

/**
 * Creates a bracket match object (the bracket structure, not the actual match).
 * In a real playoff:
 *   - round = highest number is first round, round=1 is the finals
 *   - position = position within that round (1-indexed)
 *   - matchId links to an actual Match record when the match has been created
 */
function makeBracketMatch(opts: {
  id?: number;
  round: number;
  position: number;
  member1Id: number | null;
  member2Id: number | null;
  matchId?: number | null;
  match?: {
    id: number;
    player1Sets: number | null;
    player2Sets: number | null;
    winnerId?: number | null;
    member1Id?: number;
    member2Id?: number;
  } | null;
  tournamentId?: number;
}) {
  return {
    id: opts.id ?? (opts.round * 100 + opts.position),
    round: opts.round,
    position: opts.position,
    member1Id: opts.member1Id,
    member2Id: opts.member2Id,
    matchId: opts.matchId ?? opts.match?.id ?? null,
    match: opts.match ?? null,
    tournamentId: opts.tournamentId ?? 1,
  };
}

/**
 * Creates a mock playoff tournament with bracket matches.
 * 
 * Example 4-player bracket:
 *   Round 2 (semifinals):  [1v4], [2v3]
 *   Round 1 (finals):      [winner of 1v4] vs [winner of 2v3]
 */
function makePlayoffTournament(opts: {
  id?: number;
  status?: string;
  participantCount: number;
  bracketMatches?: ReturnType<typeof makeBracketMatch>[];
  matches?: any[];
}) {
  const id = opts.id ?? 1;
  const participantIds = Array.from({ length: opts.participantCount }, (_, i) => i + 1);

  const participants = participantIds.map(memberId => ({
    memberId,
    playerRatingAtTime: 1500,
    member: { id: memberId, rating: 1500 },
  }));

  return {
    id,
    type: 'PLAYOFF',
    status: opts.status ?? 'ACTIVE',
    participants,
    matches: opts.matches ?? [],
    bracketMatches: opts.bracketMatches ?? [],
  };
}

/**
 * Creates a standard 4-player bracket structure.
 * Round 2: semifinal 1 (1v4), semifinal 2 (2v3)
 * Round 1: finals (TBD vs TBD)
 */
function make4PlayerBracket(opts?: {
  semifinal1Match?: any;
  semifinal2Match?: any;
  finalsMatch?: any;
}) {
  return [
    makeBracketMatch({
      id: 1, round: 2, position: 1,
      member1Id: 1, member2Id: 4,
      match: opts?.semifinal1Match ?? null,
    }),
    makeBracketMatch({
      id: 2, round: 2, position: 2,
      member1Id: 2, member2Id: 3,
      match: opts?.semifinal2Match ?? null,
    }),
    makeBracketMatch({
      id: 3, round: 1, position: 1,
      member1Id: null, member2Id: null,
      match: opts?.finalsMatch ?? null,
    }),
  ];
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('PlayoffPlugin', () => {
  let plugin: PlayoffPlugin;

  beforeEach(() => {
    plugin = new PlayoffPlugin();
    jest.clearAllMocks();
  });

  // ─── Basic Properties ──────────────────────────────────────────────────

  describe('type and isBasic', () => {
    it('should have type PLAYOFF', () => {
      expect(plugin.type).toBe('PLAYOFF');
    });

    it('should be a basic tournament (not compound)', () => {
      expect(plugin.isBasic).toBe(true);
    });
  });

  // ─── isComplete ────────────────────────────────────────────────────────

  describe('isComplete', () => {
    it('should return false when no bracket matches exist', () => {
      const t = makePlayoffTournament({ participantCount: 4, bracketMatches: [] });
      expect(plugin.isComplete(t)).toBe(false);
    });

    it('should return false when bracketMatches is undefined', () => {
      const t = { bracketMatches: undefined };
      expect(plugin.isComplete(t)).toBe(false);
    });

    it('should return false when finals match has no result', () => {
      const t = makePlayoffTournament({
        participantCount: 4,
        bracketMatches: make4PlayerBracket(),
      });
      expect(plugin.isComplete(t)).toBe(false);
    });

    it('should return false when finals match exists but scores are null', () => {
      const t = makePlayoffTournament({
        participantCount: 4,
        bracketMatches: make4PlayerBracket({
          finalsMatch: { id: 10, player1Sets: null, player2Sets: null },
        }),
      });
      expect(plugin.isComplete(t)).toBe(false);
    });

    it('should return true when finals match (round=1) has scores', () => {
      const t = makePlayoffTournament({
        participantCount: 4,
        bracketMatches: make4PlayerBracket({
          semifinal1Match: { id: 8, player1Sets: 3, player2Sets: 1 },
          semifinal2Match: { id: 9, player1Sets: 3, player2Sets: 0 },
          finalsMatch: { id: 10, player1Sets: 3, player2Sets: 2 },
        }),
      });
      expect(plugin.isComplete(t)).toBe(true);
    });

    it('should return true even if only finals match is played (edge case)', () => {
      // Theoretically shouldn't happen, but isComplete only checks finals
      const t = makePlayoffTournament({
        participantCount: 4,
        bracketMatches: make4PlayerBracket({
          finalsMatch: { id: 10, player1Sets: 3, player2Sets: 1 },
        }),
      });
      expect(plugin.isComplete(t)).toBe(true);
    });

    it('should handle 2-player bracket (only finals)', () => {
      const t = makePlayoffTournament({
        participantCount: 2,
        bracketMatches: [
          makeBracketMatch({
            round: 1, position: 1,
            member1Id: 1, member2Id: 2,
            match: { id: 1, player1Sets: 3, player2Sets: 0 },
          }),
        ],
      });
      expect(plugin.isComplete(t)).toBe(true);
    });
  });

  // ─── matchesRemaining ─────────────────────────────────────────────────

  describe('matchesRemaining', () => {
    it('should return 0 when no bracket matches exist', () => {
      const t = makePlayoffTournament({ participantCount: 4, bracketMatches: [] });
      expect(plugin.matchesRemaining(t)).toBe(0);
    });

    it('should return 0 when bracketMatches is undefined', () => {
      expect(plugin.matchesRemaining({ bracketMatches: undefined })).toBe(0);
    });

    it('should count playable matches (excluding BYEs and TBD)', () => {
      // 4-player bracket: 2 semifinals + 1 finals = 3 playable
      // But finals has null member IDs (TBD), so only 2 playable
      const t = makePlayoffTournament({
        participantCount: 4,
        bracketMatches: make4PlayerBracket(),
      });
      expect(plugin.matchesRemaining(t)).toBe(2);
    });

    it('should exclude BYE matches (member with id=0)', () => {
      const t = makePlayoffTournament({
        participantCount: 3,
        bracketMatches: [
          makeBracketMatch({ round: 2, position: 1, member1Id: 1, member2Id: 2 }),
          makeBracketMatch({ round: 2, position: 2, member1Id: 3, member2Id: 0 }), // BYE
          makeBracketMatch({ round: 1, position: 1, member1Id: null, member2Id: null }),
        ],
      });
      // Only 1v2 is playable (3v0 is BYE, finals is TBD)
      expect(plugin.matchesRemaining(t)).toBe(1);
    });

    it('should subtract completed matches', () => {
      const t = makePlayoffTournament({
        participantCount: 4,
        bracketMatches: [
          makeBracketMatch({
            round: 2, position: 1, member1Id: 1, member2Id: 4,
            match: { id: 1, player1Sets: 3, player2Sets: 0, winnerId: 1 },
          }),
          makeBracketMatch({
            round: 2, position: 2, member1Id: 2, member2Id: 3,
            match: { id: 2, player1Sets: 3, player2Sets: 1, winnerId: 2 },
          }),
          makeBracketMatch({
            round: 1, position: 1, member1Id: 1, member2Id: 2,
            // Finals not yet played
          }),
        ],
      });
      // 3 playable, 2 completed → 1 remaining
      expect(plugin.matchesRemaining(t)).toBe(1);
    });

    it('should return 0 when all matches are completed', () => {
      const t = makePlayoffTournament({
        participantCount: 4,
        bracketMatches: [
          makeBracketMatch({
            round: 2, position: 1, member1Id: 1, member2Id: 4,
            match: { id: 1, player1Sets: 3, player2Sets: 0, winnerId: 1 },
          }),
          makeBracketMatch({
            round: 2, position: 2, member1Id: 2, member2Id: 3,
            match: { id: 2, player1Sets: 3, player2Sets: 1, winnerId: 2 },
          }),
          makeBracketMatch({
            round: 1, position: 1, member1Id: 1, member2Id: 2,
            match: { id: 3, player1Sets: 3, player2Sets: 2, winnerId: 1 },
          }),
        ],
      });
      expect(plugin.matchesRemaining(t)).toBe(0);
    });

    it('should not count matches without winnerId as completed', () => {
      const t = makePlayoffTournament({
        participantCount: 4,
        bracketMatches: [
          makeBracketMatch({
            round: 2, position: 1, member1Id: 1, member2Id: 4,
            match: { id: 1, player1Sets: 0, player2Sets: 0, winnerId: null },
          }),
          makeBracketMatch({ round: 2, position: 2, member1Id: 2, member2Id: 3 }),
          makeBracketMatch({ round: 1, position: 1, member1Id: null, member2Id: null }),
        ],
      });
      // 2 playable (semis), 0 completed (match exists but no winner)
      expect(plugin.matchesRemaining(t)).toBe(2);
    });
  });

  // ─── canCancel ─────────────────────────────────────────────────────────

  describe('canCancel', () => {
    it('should always allow cancellation', () => {
      expect(plugin.canCancel(makePlayoffTournament({ participantCount: 4 }))).toBe(true);
    });
  });

  // ─── shouldRecalculateRatings ──────────────────────────────────────────

  describe('shouldRecalculateRatings', () => {
    it('should always return true (playoff calculates ratings per match)', () => {
      expect(plugin.shouldRecalculateRatings({})).toBe(true);
    });
  });

  // ─── updateMatch ───────────────────────────────────────────────────────

  describe('updateMatch', () => {
    const mockPrisma: {
      match?: { findFirst: jest.Mock; update: jest.Mock };
      bracketMatch?: { findFirst: jest.Mock; findUnique: jest.Mock };
    } = {};

    beforeEach(() => {
      const { recordPlayoffBracketMatchResult } = require('../../src/services/playoffBracketService');
      (recordPlayoffBracketMatchResult as jest.Mock).mockReset();
      mockPrisma.match = {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({
          id: 200,
          member1Id: 1,
          member2Id: 2,
          tournament: { id: 1 },
        }),
      };
      mockPrisma.bracketMatch = {
        findFirst: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
      };
    });

    it('delegates to recordPlayoffBracketMatchResult with bracketMatchId as matchId when no Match row exists', async () => {
      const { recordPlayoffBracketMatchResult } = require('../../src/services/playoffBracketService');
      (recordPlayoffBracketMatchResult as jest.Mock).mockResolvedValue({
        match: { id: 100, member1Id: 1, member2Id: 2 },
        tournamentCompleted: false,
      });

      const result = await plugin.updateMatch({
        matchId: 5,
        tournamentId: 1,
        player1Sets: 3,
        player2Sets: 1,
        player1Forfeit: false,
        player2Forfeit: false,
        prisma: mockPrisma,
      });

      expect(recordPlayoffBracketMatchResult).toHaveBeenCalledWith(mockPrisma, {
        tournamentId: 1,
        bracketMatchId: 5,
        player1Sets: 3,
        player2Sets: 1,
        player1Forfeit: false,
        player2Forfeit: false,
      });
      expect(result.match.id).toBe(100);
      expect(result.tournamentStateChange).toBeUndefined();
      expect(mockPrisma.bracketMatch!.findUnique).toHaveBeenCalledWith({
        where: { id: 5 },
        include: { match: true },
      });
    });

    it('records first-time bracket result when BracketMatch id collides with an unrelated Match id', async () => {
      const { recordPlayoffBracketMatchResult } = require('../../src/services/playoffBracketService');
      mockPrisma.bracketMatch!.findUnique.mockResolvedValue({
        id: 5,
        tournamentId: 1,
        match: null,
      });
      mockPrisma.match!.findFirst.mockResolvedValue({
        id: 5,
        tournamentId: 1,
        member1Id: 9,
        member2Id: 10,
      });
      (recordPlayoffBracketMatchResult as jest.Mock).mockResolvedValue({
        match: { id: 100, member1Id: 1, member2Id: 2 },
        tournamentCompleted: false,
      });

      const result = await plugin.updateMatch({
        matchId: 5,
        tournamentId: 1,
        player1Sets: 3,
        player2Sets: 1,
        player1Forfeit: false,
        player2Forfeit: false,
        prisma: mockPrisma,
      });

      expect(recordPlayoffBracketMatchResult).toHaveBeenCalledWith(mockPrisma, {
        tournamentId: 1,
        bracketMatchId: 5,
        player1Sets: 3,
        player2Sets: 1,
        player1Forfeit: false,
        player2Forfeit: false,
      });
      expect(mockPrisma.match!.update).not.toHaveBeenCalled();
      expect(result.match.id).toBe(100);
    });

    it('updates an existing Match when matchId refers to a Match in this tournament (edit path)', async () => {
      const { recordPlayoffBracketMatchResult } = require('../../src/services/playoffBracketService');
      mockPrisma.match!.findFirst.mockResolvedValue({
        id: 42,
        tournamentId: 1,
        member1Id: 1,
        member2Id: 2,
      });
      mockPrisma.bracketMatch!.findFirst.mockResolvedValue({ id: 5, matchId: 42 });

      const result = await plugin.updateMatch({
        matchId: 42,
        tournamentId: 1,
        player1Sets: 3,
        player2Sets: 2,
        player1Forfeit: false,
        player2Forfeit: false,
        prisma: mockPrisma,
      });

      expect(recordPlayoffBracketMatchResult).not.toHaveBeenCalled();
      expect(mockPrisma.match!.update).toHaveBeenCalledWith({
        where: { id: 42 },
        data: {
          player1Sets: 3,
          player2Sets: 2,
          player1Forfeit: false,
          player2Forfeit: false,
        },
        include: { tournament: true },
      });
      expect(result.match.id).toBe(200);
    });

    it('returns shouldMarkComplete when recordPlayoffBracketMatchResult reports tournament completed', async () => {
      const { recordPlayoffBracketMatchResult } = require('../../src/services/playoffBracketService');
      (recordPlayoffBracketMatchResult as jest.Mock).mockResolvedValue({
        match: { id: 100 },
        tournamentCompleted: true,
      });

      const result = await plugin.updateMatch({
        matchId: 5,
        tournamentId: 1,
        player1Sets: 3,
        player2Sets: 0,
        player1Forfeit: false,
        player2Forfeit: false,
        prisma: mockPrisma,
      });

      expect(result.tournamentStateChange?.shouldMarkComplete).toBe(true);
    });

    it('re-throws PlayoffBracketResultError from recordPlayoffBracketMatchResult', async () => {
      const { recordPlayoffBracketMatchResult, PlayoffBracketResultError } = require('../../src/services/playoffBracketService');
      (recordPlayoffBracketMatchResult as jest.Mock).mockRejectedValue(
        new PlayoffBracketResultError('Bracket match not found', 404)
      );

      await expect(
        plugin.updateMatch({
          matchId: 999,
          tournamentId: 1,
          player1Sets: 3,
          player2Sets: 0,
          player1Forfeit: false,
          player2Forfeit: false,
          prisma: mockPrisma,
        })
      ).rejects.toThrow('Bracket match not found');
    });
  });

  // ─── resolveMatchId ────────────────────────────────────────────────────

  describe('resolveMatchId', () => {
    it('should return null when bracketMatch not found', async () => {
      const mockPrisma = {
        bracketMatch: { findUnique: jest.fn().mockResolvedValue(null) },
      };

      const result = await plugin.resolveMatchId({
        matchId: 999,
        tournamentId: 1,
        prisma: mockPrisma,
      });

      expect(result).toBeNull();
    });

    it('should return null when bracketMatch belongs to different tournament', async () => {
      const mockPrisma = {
        bracketMatch: {
          findUnique: jest.fn().mockResolvedValue({
            id: 5, tournamentId: 99, member1Id: 1, member2Id: 2, match: null,
          }),
        },
      };

      const result = await plugin.resolveMatchId({
        matchId: 5,
        tournamentId: 1,
        prisma: mockPrisma,
      });

      expect(result).toBeNull();
    });

    it('should throw for BYE matches', async () => {
      const mockPrisma = {
        bracketMatch: {
          findUnique: jest.fn().mockResolvedValue({
            id: 5, tournamentId: 1, member1Id: 1, member2Id: 0, match: null,
          }),
        },
      };

      await expect(plugin.resolveMatchId({
        matchId: 5,
        tournamentId: 1,
        prisma: mockPrisma,
      })).rejects.toThrow('Cannot create or update match for BYE');
    });

    it('should return existing match when bracketMatch has linked match', async () => {
      const existingMatch = { id: 10, member1Id: 1, member2Id: 2, player1Sets: 3, player2Sets: 1 };
      const mockPrisma = {
        bracketMatch: {
          findUnique: jest.fn().mockResolvedValue({
            id: 5, tournamentId: 1, member1Id: 1, member2Id: 2, match: existingMatch,
          }),
        },
      };

      const result = await plugin.resolveMatchId({
        matchId: 5,
        tournamentId: 1,
        prisma: mockPrisma,
      });

      expect(result).not.toBeNull();
      expect(result!.match).toEqual(existingMatch);
      expect(result!.isBracketMatchId).toBe(true);
      expect(result!.bracketMatchId).toBe(5);
    });

    it('should return temporary match structure when no linked match exists', async () => {
      const mockPrisma = {
        bracketMatch: {
          findUnique: jest.fn().mockResolvedValue({
            id: 5, tournamentId: 1, member1Id: 1, member2Id: 2, match: null,
          }),
        },
        tournament: {
          findUnique: jest.fn().mockResolvedValue({ id: 1, status: 'ACTIVE' }),
        },
      };

      const result = await plugin.resolveMatchId({
        matchId: 5,
        tournamentId: 1,
        prisma: mockPrisma,
      });

      expect(result).not.toBeNull();
      expect(result!.match.member1Id).toBe(1);
      expect(result!.match.member2Id).toBe(2);
      expect(result!.isBracketMatchId).toBe(true);
    });
  });

  // ─── handlePluginRequest ───────────────────────────────────────────────

  describe('handlePluginRequest', () => {
    it('should throw for unknown resource', async () => {
      await expect(plugin.handlePluginRequest({
        method: 'GET',
        resource: 'unknown',
        tournamentId: 1,
        prisma: {},
      })).rejects.toThrow('Unknown resource');
    });

    it('should call getBracketStructure for GET bracket', async () => {
      const { getBracketStructure } = require('../../src/services/playoffBracketService');

      await plugin.handlePluginRequest({
        method: 'GET',
        resource: 'bracket',
        tournamentId: 1,
        prisma: {},
      });

      expect(getBracketStructure).toHaveBeenCalledWith(1);
    });
  });

  // ─── calculateMatchRatings ─────────────────────────────────────────────

  describe('calculateMatchRatings', () => {
    it('should call processMatchRating with correct parameters', async () => {
      const { processMatchRating } = require('../../src/services/matchRatingService');

      await plugin.calculateMatchRatings({
        tournament: { id: 1 },
        match: { id: 5, member1Id: 10, member2Id: 20, player1Sets: 3, player2Sets: 1 },
        prisma: {},
      });

      expect(processMatchRating).toHaveBeenCalledWith(
        10,    // member1Id
        20,    // member2Id
        true,  // player1Won (3 > 1)
        1,     // tournamentId
        5,     // matchId
        false, // not a forfeit
        true   // use incremental rating
      );
    });

    it('should pass player1Won=false when player 2 wins', async () => {
      const { processMatchRating } = require('../../src/services/matchRatingService');

      await plugin.calculateMatchRatings({
        tournament: { id: 1 },
        match: { id: 5, member1Id: 10, member2Id: 20, player1Sets: 1, player2Sets: 3 },
        prisma: {},
      });

      expect(processMatchRating).toHaveBeenCalledWith(
        10, 20, false, 1, 5, false, true
      );
    });
  });

  // ─── getSchedule / getPrintableView ────────────────────────────────────

  describe('getSchedule', () => {
    it('should return tournament matches', async () => {
      const matches = [{ id: 1 }, { id: 2 }];
      const result = await plugin.getSchedule({ tournament: { matches }, prisma: {} });
      expect(result.matches).toEqual(matches);
    });

    it('should return empty array when no matches', async () => {
      const result = await plugin.getSchedule({ tournament: {}, prisma: {} });
      expect(result.matches).toEqual([]);
    });
  });

  describe('getPrintableView', () => {
    it('should return bracket matches', async () => {
      const bracketMatches = [{ id: 1, round: 1 }];
      const result = await plugin.getPrintableView({
        tournament: { bracketMatches },
        prisma: {},
      });
      expect(result.bracket).toEqual(bracketMatches);
    });

    it('should return empty array when no bracket matches', async () => {
      const result = await plugin.getPrintableView({ tournament: {}, prisma: {} });
      expect(result.bracket).toEqual([]);
    });
  });
});
