/**
 * RoundRobinPlugin — Unit Tests
 * 
 * Tests all plugin methods in isolation using mock data.
 * No database, no HTTP server — pure logic testing.
 * 
 * Key concepts demonstrated:
 * - Jest describe/it blocks for organizing tests
 * - expect() assertions for verifying behavior
 * - Mock objects to simulate Prisma and tournament data
 * - Edge case coverage (empty tournaments, forfeits, etc.)
 */

import { RoundRobinPlugin } from '../../src/plugins/RoundRobinPlugin';

// We need to mock the usattRatingService since it imports prisma from index
jest.mock('../../src/services/usattRatingService', () => ({
  createRatingHistoryForRoundRobinTournament: jest.fn().mockResolvedValue(undefined),
}));

// ─── Helper: Build mock tournament objects ─────────────────────────────────

/**
 * Creates a mock tournament object with the given number of participants and matches.
 * This is the shape that the plugin methods expect to receive.
 */
function makeTournament(opts: {
  id?: number;
  status?: string;
  participantCount: number;
  matches?: Array<{
    id?: number;
    member1Id: number;
    member2Id: number;
    player1Sets: number | null;
    player2Sets: number | null;
    player1Forfeit?: boolean;
    player2Forfeit?: boolean;
    tournamentId?: number;
  }>;
  participants?: Array<{
    memberId: number;
    playerRatingAtTime?: number | null;
    member?: { id: number; rating: number | null };
  }>;
}) {
  const id = opts.id ?? 1;
  const participantIds = Array.from({ length: opts.participantCount }, (_, i) => i + 1);

  const participants = opts.participants ?? participantIds.map(memberId => ({
    memberId,
    playerRatingAtTime: 1500,
    member: { id: memberId, rating: 1500 },
  }));

  const matches = (opts.matches ?? []).map((m, idx) => ({
    id: m.id ?? idx + 1,
    tournamentId: m.tournamentId ?? id,
    member1Id: m.member1Id,
    member2Id: m.member2Id,
    player1Sets: m.player1Sets,
    player2Sets: m.player2Sets,
    player1Forfeit: m.player1Forfeit ?? false,
    player2Forfeit: m.player2Forfeit ?? false,
  }));

  return {
    id,
    type: 'ROUND_ROBIN',
    status: opts.status ?? 'ACTIVE',
    participants,
    matches,
  };
}

/**
 * Generates all match pairings for N players (round robin).
 * Returns completed matches where player with lower index always wins 3-1.
 */
function generateAllMatches(playerCount: number) {
  const matches: Array<{
    member1Id: number;
    member2Id: number;
    player1Sets: number;
    player2Sets: number;
  }> = [];
  for (let i = 1; i <= playerCount; i++) {
    for (let j = i + 1; j <= playerCount; j++) {
      matches.push({
        member1Id: i,
        member2Id: j,
        player1Sets: 3,
        player2Sets: 1,
      });
    }
  }
  return matches;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('RoundRobinPlugin', () => {
  let plugin: RoundRobinPlugin;

  beforeEach(() => {
    plugin = new RoundRobinPlugin();
  });

  // ─── Basic Properties ──────────────────────────────────────────────────

  describe('type and isBasic', () => {
    it('should have type ROUND_ROBIN', () => {
      expect(plugin.type).toBe('ROUND_ROBIN');
    });

    it('should be a basic tournament (not compound)', () => {
      expect(plugin.isBasic).toBe(true);
    });
  });

  // ─── isComplete ────────────────────────────────────────────────────────

  describe('isComplete', () => {
    it('should return false for a tournament with no participants', () => {
      const t = makeTournament({ participantCount: 0 });
      expect(plugin.isComplete(t)).toBe(false);
    });

    it('should return false for a tournament with 1 participant', () => {
      const t = makeTournament({ participantCount: 1 });
      expect(plugin.isComplete(t)).toBe(false);
    });

    it('should return false for a tournament with 0 matches played (2 players)', () => {
      const t = makeTournament({ participantCount: 2, matches: [] });
      // 2 players → 1 expected match, 0 played
      expect(plugin.isComplete(t)).toBe(false);
    });

    it('should return true when all matches are played (2 players, 1 match)', () => {
      const t = makeTournament({
        participantCount: 2,
        matches: [{ member1Id: 1, member2Id: 2, player1Sets: 3, player2Sets: 1 }],
      });
      expect(plugin.isComplete(t)).toBe(true);
    });

    it('should return false when only some matches are played (3 players)', () => {
      // 3 players → 3 expected matches
      const t = makeTournament({
        participantCount: 3,
        matches: [
          { member1Id: 1, member2Id: 2, player1Sets: 3, player2Sets: 0 },
          // Missing: 1v3, 2v3
        ],
      });
      expect(plugin.isComplete(t)).toBe(false);
    });

    it('should return true when all matches are played (3 players, 3 matches)', () => {
      const t = makeTournament({
        participantCount: 3,
        matches: [
          { member1Id: 1, member2Id: 2, player1Sets: 3, player2Sets: 0 },
          { member1Id: 1, member2Id: 3, player1Sets: 3, player2Sets: 1 },
          { member1Id: 2, member2Id: 3, player1Sets: 3, player2Sets: 2 },
        ],
      });
      expect(plugin.isComplete(t)).toBe(true);
    });

    it('should return true when all matches are played (4 players, 6 matches)', () => {
      const t = makeTournament({
        participantCount: 4,
        matches: generateAllMatches(4),
      });
      expect(plugin.isComplete(t)).toBe(true);
    });

    it('should return false when 5 of 6 matches are played (4 players)', () => {
      const allMatches = generateAllMatches(4);
      const t = makeTournament({
        participantCount: 4,
        matches: allMatches.slice(0, 5), // Only 5 of 6
      });
      expect(plugin.isComplete(t)).toBe(false);
    });

    it('should not count matches with null scores as played', () => {
      const t = makeTournament({
        participantCount: 2,
        matches: [{ member1Id: 1, member2Id: 2, player1Sets: null, player2Sets: null }],
      });
      expect(plugin.isComplete(t)).toBe(false);
    });

    it('should handle undefined matches array gracefully', () => {
      const t = { participants: [{ memberId: 1 }, { memberId: 2 }] };
      expect(plugin.isComplete(t)).toBe(false);
    });

    it('should handle large tournament (8 players = 28 matches)', () => {
      const t = makeTournament({
        participantCount: 8,
        matches: generateAllMatches(8),
      });
      // 8 players → 8*7/2 = 28 matches
      expect(t.matches).toHaveLength(28);
      expect(plugin.isComplete(t)).toBe(true);
    });
  });

  // ─── matchesRemaining ─────────────────────────────────────────────────

  describe('matchesRemaining', () => {
    it('should return 0 for tournament with fewer than 2 participants', () => {
      expect(plugin.matchesRemaining(makeTournament({ participantCount: 0 }))).toBe(0);
      expect(plugin.matchesRemaining(makeTournament({ participantCount: 1 }))).toBe(0);
    });

    it('should return 1 for 2 players with no matches', () => {
      const t = makeTournament({ participantCount: 2, matches: [] });
      expect(plugin.matchesRemaining(t)).toBe(1);
    });

    it('should return 0 for 2 players with 1 completed match', () => {
      const t = makeTournament({
        participantCount: 2,
        matches: [{ member1Id: 1, member2Id: 2, player1Sets: 3, player2Sets: 1 }],
      });
      expect(plugin.matchesRemaining(t)).toBe(0);
    });

    it('should return 6 for 4 players with no matches', () => {
      const t = makeTournament({ participantCount: 4, matches: [] });
      expect(plugin.matchesRemaining(t)).toBe(6);
    });

    it('should return 3 for 4 players with 3 matches played', () => {
      const allMatches = generateAllMatches(4);
      const t = makeTournament({
        participantCount: 4,
        matches: allMatches.slice(0, 3),
      });
      expect(plugin.matchesRemaining(t)).toBe(3);
    });

    it('should return 0 for fully completed tournament', () => {
      const t = makeTournament({
        participantCount: 4,
        matches: generateAllMatches(4),
      });
      expect(plugin.matchesRemaining(t)).toBe(0);
    });

    it('should count forfeit matches as played', () => {
      const t = makeTournament({
        participantCount: 2,
        matches: [{
          member1Id: 1,
          member2Id: 2,
          player1Sets: 0,
          player2Sets: 0,
          player1Forfeit: true,
        }],
      });
      expect(plugin.matchesRemaining(t)).toBe(0);
    });

    it('should not count 0-0 non-forfeit matches as played', () => {
      // A match with 0-0 and no forfeit flags is not a real result
      const t = makeTournament({
        participantCount: 2,
        matches: [{
          member1Id: 1,
          member2Id: 2,
          player1Sets: 0,
          player2Sets: 0,
          player1Forfeit: false,
          player2Forfeit: false,
        }],
      });
      expect(plugin.matchesRemaining(t)).toBe(1);
    });

    it('should calculate correctly for 5 players (10 matches)', () => {
      const t = makeTournament({ participantCount: 5, matches: [] });
      // 5 players → 5*4/2 = 10
      expect(plugin.matchesRemaining(t)).toBe(10);
    });
  });

  // ─── canDelete ─────────────────────────────────────────────────────────

  describe('canDelete', () => {
    it('should allow deletion when no matches exist', () => {
      const t = makeTournament({ participantCount: 4, matches: [] });
      expect(plugin.canDelete(t)).toBe(true);
    });

    it('should prevent deletion when matches exist', () => {
      const t = makeTournament({
        participantCount: 4,
        matches: [{ member1Id: 1, member2Id: 2, player1Sets: 3, player2Sets: 0 }],
      });
      expect(plugin.canDelete(t)).toBe(false);
    });

    it('should prevent deletion even with unplayed matches (null scores)', () => {
      const t = makeTournament({
        participantCount: 2,
        matches: [{ member1Id: 1, member2Id: 2, player1Sets: null, player2Sets: null }],
      });
      expect(plugin.canDelete(t)).toBe(false);
    });
  });

  // ─── canCancel ─────────────────────────────────────────────────────────

  describe('canCancel', () => {
    it('should always allow cancellation', () => {
      expect(plugin.canCancel(makeTournament({ participantCount: 4, matches: [] }))).toBe(true);
      expect(plugin.canCancel(makeTournament({
        participantCount: 4,
        matches: generateAllMatches(4),
      }))).toBe(true);
    });
  });

  // ─── shouldRecalculateRatings ──────────────────────────────────────────

  describe('shouldRecalculateRatings', () => {
    it('should return false when tournament is not complete', () => {
      const t = makeTournament({ participantCount: 4, matches: [] });
      expect(plugin.shouldRecalculateRatings(t)).toBe(false);
    });

    it('should return true when tournament is complete but not yet marked COMPLETED', () => {
      const t = makeTournament({
        participantCount: 4,
        status: 'ACTIVE',
        matches: generateAllMatches(4),
      });
      expect(plugin.shouldRecalculateRatings(t)).toBe(true);
    });

    it('should return false when tournament is already marked COMPLETED', () => {
      const t = makeTournament({
        participantCount: 4,
        status: 'COMPLETED',
        matches: generateAllMatches(4),
      });
      expect(plugin.shouldRecalculateRatings(t)).toBe(false);
    });
  });

  // ─── enrichActiveTournament ────────────────────────────────────────────

  describe('enrichActiveTournament', () => {
    it('should add empty bracketMatches array', async () => {
      const t = makeTournament({ participantCount: 4, matches: [] });
      const enriched = await plugin.enrichActiveTournament({ tournament: t } as any);
      expect(enriched.bracketMatches).toEqual([]);
    });

    it('should preserve all original tournament data', async () => {
      const t = makeTournament({ participantCount: 3, matches: [] });
      const enriched = await plugin.enrichActiveTournament({ tournament: t } as any);
      expect(enriched.id).toBe(t.id);
      expect(enriched.participants).toEqual(t.participants);
      expect(enriched.matches).toEqual(t.matches);
    });
  });

  // ─── enrichCompletedTournament ─────────────────────────────────────────

  describe('enrichCompletedTournament', () => {
    it('should add postRatingAtTime from postRatingMap', async () => {
      const t = makeTournament({
        id: 10,
        participantCount: 2,
        participants: [
          { memberId: 1, playerRatingAtTime: 1500, member: { id: 1, rating: 1500 } },
          { memberId: 2, playerRatingAtTime: 1400, member: { id: 2, rating: 1400 } },
        ],
        matches: generateAllMatches(2),
      });

      const postRatingMap = new Map<string, number>();
      postRatingMap.set('10-1', 1520); // Player 1 gained 20
      postRatingMap.set('10-2', 1380); // Player 2 lost 20

      const enriched = await plugin.enrichCompletedTournament({
        tournament: t,
        postRatingMap,
      } as any);

      expect((enriched.participants[0] as any).postRatingAtTime).toBe(1520);
      expect((enriched.participants[1] as any).postRatingAtTime).toBe(1380);
    });

    it('should fall back to member.rating when postRatingMap has no entry', async () => {
      const t = makeTournament({
        id: 10,
        participantCount: 2,
        participants: [
          { memberId: 1, playerRatingAtTime: 1500, member: { id: 1, rating: 1550 } },
          { memberId: 2, playerRatingAtTime: 1400, member: { id: 2, rating: 1420 } },
        ],
        matches: generateAllMatches(2),
      });

      const enriched = await plugin.enrichCompletedTournament({
        tournament: t,
        postRatingMap: new Map(), // Empty map
      } as any);

      expect((enriched.participants[0] as any).postRatingAtTime).toBe(1550); // Falls back to member.rating
      expect((enriched.participants[1] as any).postRatingAtTime).toBe(1420);
    });

    it('should handle undefined postRatingMap', async () => {
      const t = makeTournament({
        id: 10,
        participantCount: 2,
        participants: [
          { memberId: 1, playerRatingAtTime: 1500, member: { id: 1, rating: 1500 } },
        ],
        matches: [],
      });

      const enriched = await plugin.enrichCompletedTournament({
        tournament: t,
        postRatingMap: undefined,
      } as any);

      expect((enriched.participants[0] as any).postRatingAtTime).toBe(1500);
    });

    it('should add empty bracketMatches array', async () => {
      const t = makeTournament({ participantCount: 2, matches: [] });
      const enriched = await plugin.enrichCompletedTournament({
        tournament: t,
        postRatingMap: new Map(),
      } as any);
      expect(enriched.bracketMatches).toEqual([]);
    });
  });

  // ─── onMatchCompleted ──────────────────────────────────────────────────

  describe('onMatchCompleted', () => {
    it('should return shouldMarkComplete:true when tournament is now complete', async () => {
      const t = makeTournament({
        participantCount: 2,
        matches: [{ member1Id: 1, member2Id: 2, player1Sets: 3, player2Sets: 1 }],
      });

      const result = await plugin.onMatchCompleted({ tournament: t, prisma: {} });
      expect(result.shouldMarkComplete).toBe(true);
    });

    it('should return empty object when tournament is not yet complete', async () => {
      const t = makeTournament({
        participantCount: 3,
        matches: [{ member1Id: 1, member2Id: 2, player1Sets: 3, player2Sets: 1 }],
        // Missing 2 more matches for 3-player RR
      });

      const result = await plugin.onMatchCompleted({ tournament: t, prisma: {} });
      expect(result.shouldMarkComplete).toBeUndefined();
    });
  });

  // ─── updateMatch ───────────────────────────────────────────────────────

  describe('updateMatch', () => {
    // Mock Prisma client for updateMatch tests
    function makeMockPrisma(opts: {
      existingMatch?: any;
      tournamentAfterUpdate?: any;
    } = {}) {
      return {
        match: {
          findUnique: jest.fn().mockResolvedValue(opts.existingMatch ?? null),
          create: jest.fn().mockImplementation(async (args: any) => ({
            id: 100,
            ...args.data,
            tournamentId: args.data.tournament?.connect?.id,
          })),
          update: jest.fn().mockImplementation(async (args: any) => ({
            ...opts.existingMatch,
            ...args.data,
          })),
        },
        tournament: {
          findUnique: jest.fn().mockResolvedValue(opts.tournamentAfterUpdate ?? null),
        },
      };
    }

    it('should create a new match when matchId is 0', async () => {
      const tournamentAfter = makeTournament({
        participantCount: 4,
        matches: [{ member1Id: 1, member2Id: 2, player1Sets: 3, player2Sets: 1 }],
      });
      const mockPrisma = makeMockPrisma({ tournamentAfterUpdate: tournamentAfter });

      const result = await plugin.updateMatch({
        matchId: 0,
        tournamentId: 1,
        member1Id: 1,
        member2Id: 2,
        player1Sets: 3,
        player2Sets: 1,
        player1Forfeit: false,
        player2Forfeit: false,
        prisma: mockPrisma,
      });

      expect(mockPrisma.match.create).toHaveBeenCalled();
      expect(mockPrisma.match.findUnique).not.toHaveBeenCalled();
      expect(result.match).toBeDefined();
      expect(result.match.winnerId).toBe(1); // Player 1 won 3-1
    });

    it('should update an existing match when matchId > 0', async () => {
      const existingMatch = {
        id: 5,
        tournamentId: 1,
        member1Id: 1,
        member2Id: 2,
        player1Sets: 0,
        player2Sets: 0,
      };
      const tournamentAfter = makeTournament({
        participantCount: 4,
        matches: [{ member1Id: 1, member2Id: 2, player1Sets: 3, player2Sets: 2 }],
      });
      const mockPrisma = makeMockPrisma({ existingMatch, tournamentAfterUpdate: tournamentAfter });

      const result = await plugin.updateMatch({
        matchId: 5,
        tournamentId: 1,
        player1Sets: 3,
        player2Sets: 2,
        player1Forfeit: false,
        player2Forfeit: false,
        prisma: mockPrisma,
      });

      expect(mockPrisma.match.update).toHaveBeenCalled();
      expect(result.match.winnerId).toBe(1); // Player 1 won 3-2
    });

    it('should throw when updating a non-existent match', async () => {
      const mockPrisma = makeMockPrisma({ existingMatch: null });

      await expect(plugin.updateMatch({
        matchId: 999,
        tournamentId: 1,
        player1Sets: 3,
        player2Sets: 0,
        player1Forfeit: false,
        player2Forfeit: false,
        prisma: mockPrisma,
      })).rejects.toThrow('Match not found');
    });

    it('should throw when match belongs to a different tournament', async () => {
      const existingMatch = {
        id: 5,
        tournamentId: 99, // Different tournament!
        member1Id: 1,
        member2Id: 2,
      };
      const mockPrisma = makeMockPrisma({ existingMatch });

      await expect(plugin.updateMatch({
        matchId: 5,
        tournamentId: 1, // Requesting tournament 1
        player1Sets: 3,
        player2Sets: 0,
        player1Forfeit: false,
        player2Forfeit: false,
        prisma: mockPrisma,
      })).rejects.toThrow('Match does not belong to this tournament');
    });

    it('should throw when creating match without member IDs', async () => {
      const mockPrisma = makeMockPrisma();

      await expect(plugin.updateMatch({
        matchId: 0,
        tournamentId: 1,
        // No member1Id or member2Id!
        player1Sets: 3,
        player2Sets: 0,
        player1Forfeit: false,
        player2Forfeit: false,
        prisma: mockPrisma,
      })).rejects.toThrow('member1Id and member2Id are required');
    });

    // ─── Winner Determination ──────────────────────────────────────────

    describe('winner determination', () => {
      async function getWinner(p1Sets: number, p2Sets: number, p1Forfeit = false, p2Forfeit = false) {
        const tournamentAfter = makeTournament({ participantCount: 4, matches: [] });
        const mockPrisma = makeMockPrisma({ tournamentAfterUpdate: tournamentAfter });

        const result = await plugin.updateMatch({
          matchId: 0,
          tournamentId: 1,
          member1Id: 10,
          member2Id: 20,
          player1Sets: p1Sets,
          player2Sets: p2Sets,
          player1Forfeit: p1Forfeit,
          player2Forfeit: p2Forfeit,
          prisma: mockPrisma,
        });
        return result.match.winnerId;
      }

      it('should declare player 1 winner when p1Sets > p2Sets', async () => {
        expect(await getWinner(3, 1)).toBe(10);
      });

      it('should declare player 2 winner when p2Sets > p1Sets', async () => {
        expect(await getWinner(1, 3)).toBe(20);
      });

      it('should declare player 2 winner when player 1 forfeits', async () => {
        expect(await getWinner(0, 0, true, false)).toBe(20);
      });

      it('should declare player 1 winner when player 2 forfeits', async () => {
        expect(await getWinner(0, 0, false, true)).toBe(10);
      });

      it('should declare player 2 winner on equal sets (no forfeit)', async () => {
        // When sets are equal and no forfeit, player2 wins (p1Sets > p2Sets is false)
        expect(await getWinner(2, 2)).toBe(20);
      });

      it('should prioritize player1 forfeit over player2 forfeit', async () => {
        // If both forfeit, player1Forfeit is checked first → player 2 wins
        expect(await getWinner(0, 0, true, true)).toBe(20);
      });
    });

    // ─── Tournament Completion Trigger ─────────────────────────────────

    describe('tournament completion trigger', () => {
      it('should signal completion when last match makes tournament complete', async () => {
        // 2-player tournament, this is the only match needed
        const tournamentAfter = makeTournament({
          participantCount: 2,
          matches: [{ member1Id: 1, member2Id: 2, player1Sets: 3, player2Sets: 0 }],
        });
        const mockPrisma = makeMockPrisma({ tournamentAfterUpdate: tournamentAfter });

        const result = await plugin.updateMatch({
          matchId: 0,
          tournamentId: 1,
          member1Id: 1,
          member2Id: 2,
          player1Sets: 3,
          player2Sets: 0,
          player1Forfeit: false,
          player2Forfeit: false,
          prisma: mockPrisma,
        });

        expect(result.tournamentStateChange).toBeDefined();
        expect(result.tournamentStateChange?.shouldMarkComplete).toBe(true);
        expect(result.tournamentStateChange?.message).toBe('All matches completed');
      });

      it('should not signal completion when matches remain', async () => {
        // 3-player tournament, only 1 of 3 matches played
        const tournamentAfter = makeTournament({
          participantCount: 3,
          matches: [{ member1Id: 1, member2Id: 2, player1Sets: 3, player2Sets: 0 }],
        });
        const mockPrisma = makeMockPrisma({ tournamentAfterUpdate: tournamentAfter });

        const result = await plugin.updateMatch({
          matchId: 0,
          tournamentId: 1,
          member1Id: 1,
          member2Id: 2,
          player1Sets: 3,
          player2Sets: 0,
          player1Forfeit: false,
          player2Forfeit: false,
          prisma: mockPrisma,
        });

        expect(result.tournamentStateChange).toBeUndefined();
      });
    });
  });

  // ─── createTournament ──────────────────────────────────────────────────

  describe('createTournament', () => {
    it('should call prisma.tournament.create with correct structure', async () => {
      const mockCreate = jest.fn().mockResolvedValue({
        id: 1,
        type: 'ROUND_ROBIN',
        status: 'ACTIVE',
        participants: [],
        matches: [],
      });

      const mockPrisma = { tournament: { create: mockCreate } };

      const players = [
        { id: 1, rating: 1800 },
        { id: 2, rating: 1600 },
        { id: 3, rating: 1400 },
      ];

      await plugin.createTournament({
        name: 'Test Tournament',
        participantIds: [1, 2, 3],
        players,
        prisma: mockPrisma,
      } as any);

      expect(mockCreate).toHaveBeenCalledTimes(1);

      const createArg = mockCreate.mock.calls[0][0];
      expect(createArg.data.name).toBe('Test Tournament');
      expect(createArg.data.type).toBe('ROUND_ROBIN');
      expect(createArg.data.status).toBe('ACTIVE');
      expect(createArg.data.participants.create).toHaveLength(3);
    });

    it('should snapshot player ratings at tournament creation time', async () => {
      const mockCreate = jest.fn().mockResolvedValue({ id: 1 });
      const mockPrisma = { tournament: { create: mockCreate } };

      const players = [
        { id: 1, rating: 1800 },
        { id: 2, rating: 1600 },
      ];

      await plugin.createTournament({
        name: 'Rating Snapshot Test',
        participantIds: [1, 2],
        players,
        prisma: mockPrisma,
      } as any);

      const participants = mockCreate.mock.calls[0][0].data.participants.create;
      expect(participants[0]).toEqual({ memberId: 1, playerRatingAtTime: 1800 });
      expect(participants[1]).toEqual({ memberId: 2, playerRatingAtTime: 1600 });
    });

    it('should handle players with null rating', async () => {
      const mockCreate = jest.fn().mockResolvedValue({ id: 1 });
      const mockPrisma = { tournament: { create: mockCreate } };

      const players = [
        { id: 1, rating: null },
        { id: 2, rating: 1600 },
      ];

      await plugin.createTournament({
        name: 'Null Rating Test',
        participantIds: [1, 2],
        players,
        prisma: mockPrisma,
      } as any);

      const participants = mockCreate.mock.calls[0][0].data.participants.create;
      expect(participants[0].playerRatingAtTime).toBeNull();
      expect(participants[1].playerRatingAtTime).toBe(1600);
    });

    it('should handle player not found in players array', async () => {
      const mockCreate = jest.fn().mockResolvedValue({ id: 1 });
      const mockPrisma = { tournament: { create: mockCreate } };

      // participantId 3 is not in the players array
      await plugin.createTournament({
        name: 'Missing Player Test',
        participantIds: [1, 3],
        players: [{ id: 1, rating: 1500 }],
        prisma: mockPrisma,
      } as any);

      const participants = mockCreate.mock.calls[0][0].data.participants.create;
      expect(participants[1].playerRatingAtTime).toBeNull(); // player not found → null
    });
  });

  // ─── calculateMatchRatings ─────────────────────────────────────────────

  describe('calculateMatchRatings', () => {
    it('should be a no-op (RR calculates ratings on tournament completion)', async () => {
      // Just verify it doesn't throw
      await expect(plugin.calculateMatchRatings({})).resolves.toBeUndefined();
    });
  });

  // ─── onTournamentCompletionRatingCalculation ───────────────────────────

  describe('onTournamentCompletionRatingCalculation', () => {
    it('should call createRatingHistoryForRoundRobinTournament with tournament id', async () => {
      const { createRatingHistoryForRoundRobinTournament } = require('../../src/services/usattRatingService');

      await plugin.onTournamentCompletionRatingCalculation({
        tournament: { id: 42 },
        prisma: {},
      });

      expect(createRatingHistoryForRoundRobinTournament).toHaveBeenCalledWith(42);
    });
  });

  // ─── getSchedule ───────────────────────────────────────────────────────

  describe('getSchedule', () => {
    it('should return tournament matches', async () => {
      const matches = [
        { id: 1, member1Id: 1, member2Id: 2 },
        { id: 2, member1Id: 1, member2Id: 3 },
      ];
      const result = await plugin.getSchedule({
        tournament: { matches },
        prisma: {},
      });
      expect(result.matches).toEqual(matches);
    });

    it('should return empty array when no matches', async () => {
      const result = await plugin.getSchedule({
        tournament: {},
        prisma: {},
      });
      expect(result.matches).toEqual([]);
    });
  });

  // ─── Edge Cases & Math Verification ────────────────────────────────────

  describe('round robin math', () => {
    // Verify the formula: n*(n-1)/2 matches for n players
    const cases = [
      { players: 2, expected: 1 },
      { players: 3, expected: 3 },
      { players: 4, expected: 6 },
      { players: 5, expected: 10 },
      { players: 6, expected: 15 },
      { players: 7, expected: 21 },
      { players: 8, expected: 28 },
    ];

    cases.forEach(({ players, expected }) => {
      it(`should expect ${expected} matches for ${players} players`, () => {
        const t = makeTournament({ participantCount: players, matches: [] });
        expect(plugin.matchesRemaining(t)).toBe(expected);
      });
    });
  });
});
