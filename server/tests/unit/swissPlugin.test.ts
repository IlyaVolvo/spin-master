/**
 * SwissPlugin — Unit Tests
 *
 * Swiss tournaments work in rounds:
 * - Each round pairs players with similar scores who haven't played each other
 * - After all rounds complete, the tournament is marked complete
 * - Ratings are calculated per-match (not at tournament end like Round Robin)
 *
 * Key methods:
 * - isComplete: checks swissData.isCompleted
 * - matchesRemaining: current round unplayed + future rounds × matchesPerRound
 * - calculateStandings (private): points from wins, sorted by points then rating
 * - generatePairings (private): Swiss pairing algorithm
 * - isCurrentRoundComplete (private): all matches in current round have scores
 * - updateMatch: updates match, checks round completion, auto-generates next round
 *
 * Private methods are tested indirectly through public methods (generateNextRound, updateMatch).
 */

import { SwissPlugin } from '../../src/plugins/SwissPlugin';

// Mock the logger to suppress output during tests
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock the rating service
jest.mock('../../src/services/usattRatingService', () => ({
  adjustRatingsForSingleMatch: jest.fn().mockResolvedValue(undefined),
}));

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeSwissTournament(opts: {
  id?: number;
  status?: string;
  participantCount: number;
  numberOfRounds?: number;
  currentRound?: number;
  isCompleted?: boolean;
  matches?: any[];
  participantRatings?: number[];
}) {
  const id = opts.id ?? 1;
  const participantIds = Array.from({ length: opts.participantCount }, (_, i) => i + 1);
  const ratings = opts.participantRatings ?? participantIds.map(() => 1500);

  const participants = participantIds.map((memberId, idx) => ({
    memberId,
    playerRatingAtTime: ratings[idx],
    member: { id: memberId, rating: ratings[idx] },
  }));

  return {
    id,
    type: 'SWISS',
    status: opts.status ?? 'ACTIVE',
    participants,
    matches: opts.matches ?? [],
    swissData: {
      tournamentId: id,
      numberOfRounds: opts.numberOfRounds ?? 3,
      currentRound: opts.currentRound ?? 0,
      isCompleted: opts.isCompleted ?? false,
    },
  };
}

function makeMatch(opts: {
  id?: number;
  member1Id: number;
  member2Id: number;
  player1Sets?: number;
  player2Sets?: number;
  player1Forfeit?: boolean;
  player2Forfeit?: boolean;
  round?: number;
  winnerId?: number | null;
  tournamentId?: number;
}) {
  return {
    id: opts.id ?? Math.floor(Math.random() * 10000),
    member1Id: opts.member1Id,
    member2Id: opts.member2Id,
    player1Sets: opts.player1Sets ?? 0,
    player2Sets: opts.player2Sets ?? 0,
    player1Forfeit: opts.player1Forfeit ?? false,
    player2Forfeit: opts.player2Forfeit ?? false,
    round: opts.round ?? 1,
    winnerId: opts.winnerId ?? null,
    tournamentId: opts.tournamentId ?? 1,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('SwissPlugin', () => {
  let plugin: SwissPlugin;

  beforeEach(() => {
    plugin = new SwissPlugin();
    jest.clearAllMocks();
  });

  // ─── Basic Properties ──────────────────────────────────────────────────

  describe('type and isBasic', () => {
    it('should have type SWISS', () => {
      expect(plugin.type).toBe('SWISS');
    });

    it('should be a basic tournament (not compound)', () => {
      expect(plugin.isBasic).toBe(true);
    });
  });

  // ─── isComplete ────────────────────────────────────────────────────────

  describe('isComplete', () => {
    it('should return false when swissData.isCompleted is false', () => {
      const t = makeSwissTournament({ participantCount: 4, isCompleted: false });
      expect(plugin.isComplete(t)).toBe(false);
    });

    it('should return true when swissData.isCompleted is true', () => {
      const t = makeSwissTournament({ participantCount: 4, isCompleted: true });
      expect(plugin.isComplete(t)).toBe(true);
    });

    it('should return false when swissData is undefined', () => {
      expect(plugin.isComplete({ swissData: undefined })).toBe(false);
    });

    it('should return false when swissData is null', () => {
      expect(plugin.isComplete({ swissData: null })).toBe(false);
    });
  });

  // ─── shouldRecalculateRatings ──────────────────────────────────────────

  describe('shouldRecalculateRatings', () => {
    it('should return false (Swiss does not recalculate per-match ratings)', () => {
      expect(plugin.shouldRecalculateRatings({})).toBe(false);
    });
  });

  // ─── canCancel ─────────────────────────────────────────────────────────

  describe('canCancel', () => {
    it('should always allow cancellation', () => {
      expect(plugin.canCancel(makeSwissTournament({ participantCount: 4 }))).toBe(true);
    });
  });

  // ─── matchesRemaining ─────────────────────────────────────────────────

  describe('matchesRemaining', () => {
    it('should return 0 when tournament is completed', () => {
      const t = makeSwissTournament({
        participantCount: 4,
        isCompleted: true,
        currentRound: 3,
        numberOfRounds: 3,
      });
      expect(plugin.matchesRemaining(t)).toBe(0);
    });

    it('should count future rounds correctly (no matches yet, round 0)', () => {
      // 4 players, 3 rounds, currentRound=0 → 3 future rounds × 2 matches/round = 6
      const t = makeSwissTournament({
        participantCount: 4,
        numberOfRounds: 3,
        currentRound: 0,
      });
      expect(plugin.matchesRemaining(t)).toBe(6);
    });

    it('should count unplayed matches in current round + future rounds', () => {
      // 4 players, 3 rounds, currentRound=1, 2 matches in round 1 (both unplayed)
      // Future rounds: 3-1 = 2 rounds × 2 matches = 4
      // Current unplayed: 2
      // Total: 6
      const t = makeSwissTournament({
        participantCount: 4,
        numberOfRounds: 3,
        currentRound: 1,
        matches: [
          makeMatch({ member1Id: 1, member2Id: 2, round: 1 }),
          makeMatch({ member1Id: 3, member2Id: 4, round: 1 }),
        ],
      });
      expect(plugin.matchesRemaining(t)).toBe(6);
    });

    it('should subtract played matches in current round', () => {
      // 4 players, 3 rounds, currentRound=1
      // 1 match played (has score), 1 unplayed
      // Future: 2 rounds × 2 = 4
      // Current unplayed: 1
      // Total: 5
      const t = makeSwissTournament({
        participantCount: 4,
        numberOfRounds: 3,
        currentRound: 1,
        matches: [
          makeMatch({ member1Id: 1, member2Id: 2, round: 1, player1Sets: 3, player2Sets: 1 }),
          makeMatch({ member1Id: 3, member2Id: 4, round: 1 }),
        ],
      });
      expect(plugin.matchesRemaining(t)).toBe(5);
    });

    it('should count forfeits as played', () => {
      const t = makeSwissTournament({
        participantCount: 4,
        numberOfRounds: 3,
        currentRound: 1,
        matches: [
          makeMatch({ member1Id: 1, member2Id: 2, round: 1, player1Forfeit: true }),
          makeMatch({ member1Id: 3, member2Id: 4, round: 1, player1Sets: 3, player2Sets: 0 }),
        ],
      });
      // Both played, future: 2 × 2 = 4
      expect(plugin.matchesRemaining(t)).toBe(4);
    });

    it('should return 0 on last round with all matches played', () => {
      const t = makeSwissTournament({
        participantCount: 4,
        numberOfRounds: 3,
        currentRound: 3,
        matches: [
          makeMatch({ member1Id: 1, member2Id: 2, round: 3, player1Sets: 3, player2Sets: 1 }),
          makeMatch({ member1Id: 3, member2Id: 4, round: 3, player1Sets: 3, player2Sets: 0 }),
        ],
      });
      // Future: 3-3 = 0, unplayed: 0
      expect(plugin.matchesRemaining(t)).toBe(0);
    });

    it('should handle odd number of players (floor division for matches per round)', () => {
      // 5 players → 2 matches per round (one player gets bye)
      const t = makeSwissTournament({
        participantCount: 5,
        numberOfRounds: 3,
        currentRound: 0,
      });
      // 3 future rounds × 2 matches = 6
      expect(plugin.matchesRemaining(t)).toBe(6);
    });

    it('should handle missing swissData gracefully', () => {
      const t = { swissData: undefined, participants: [], matches: [] };
      expect(plugin.matchesRemaining(t)).toBe(0);
    });
  });

  // ─── updateMatch ───────────────────────────────────────────────────────

  describe('updateMatch', () => {
    function makeMockPrisma(opts: {
      existingMatch?: any;
      tournament?: any;
    } = {}) {
      const tournament = opts.tournament ?? makeSwissTournament({
        participantCount: 4,
        numberOfRounds: 3,
        currentRound: 1,
        matches: [
          makeMatch({ id: 10, member1Id: 1, member2Id: 2, round: 1 }),
          makeMatch({ id: 11, member1Id: 3, member2Id: 4, round: 1 }),
        ],
      });

      return {
        match: {
          findUnique: jest.fn().mockResolvedValue('existingMatch' in opts ? opts.existingMatch : {
            id: 10,
            member1Id: 1,
            member2Id: 2,
            tournamentId: 1,
            round: 1,
          }),
          update: jest.fn().mockImplementation(async (args: any) => ({
            id: args.where.id,
            ...args.data,
            tournament: { id: 1 },
          })),
          create: jest.fn().mockImplementation(async (args: any) => ({
            id: 100,
            ...args.data,
          })),
        },
        tournament: {
          findUnique: jest.fn().mockResolvedValue(tournament),
        },
        swissTournamentData: {
          update: jest.fn().mockResolvedValue({}),
        },
        ratingHistory: {
          deleteMany: jest.fn().mockResolvedValue({}),
        },
      };
    }

    it('should throw when match not found', async () => {
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

    it('should throw when match belongs to different tournament', async () => {
      const mockPrisma = makeMockPrisma({
        existingMatch: { id: 10, member1Id: 1, member2Id: 2, tournamentId: 99 },
      });

      await expect(plugin.updateMatch({
        matchId: 10,
        tournamentId: 1,
        player1Sets: 3,
        player2Sets: 0,
        player1Forfeit: false,
        player2Forfeit: false,
        prisma: mockPrisma,
      })).rejects.toThrow('Match does not belong to this tournament');
    });

    it('should update match with correct data', async () => {
      const mockPrisma = makeMockPrisma();

      await plugin.updateMatch({
        matchId: 10,
        tournamentId: 1,
        player1Sets: 3,
        player2Sets: 1,
        player1Forfeit: false,
        player2Forfeit: false,
        prisma: mockPrisma,
      });

      expect(mockPrisma.match.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: {
          player1Sets: 3,
          player2Sets: 1,
          player1Forfeit: false,
          player2Forfeit: false,
        },
        include: { tournament: true },
      });
    });

    it('should determine winner correctly (player 1 wins)', async () => {
      const mockPrisma = makeMockPrisma();

      const result = await plugin.updateMatch({
        matchId: 10,
        tournamentId: 1,
        player1Sets: 3,
        player2Sets: 1,
        player1Forfeit: false,
        player2Forfeit: false,
        prisma: mockPrisma,
      });

      expect(result.match.winnerId).toBe(1); // member1Id
    });

    it('should determine winner correctly (player 2 wins)', async () => {
      const mockPrisma = makeMockPrisma();

      const result = await plugin.updateMatch({
        matchId: 10,
        tournamentId: 1,
        player1Sets: 1,
        player2Sets: 3,
        player1Forfeit: false,
        player2Forfeit: false,
        prisma: mockPrisma,
      });

      expect(result.match.winnerId).toBe(2); // member2Id
    });

    it('should determine winner on forfeit (player 1 forfeits)', async () => {
      const mockPrisma = makeMockPrisma();

      const result = await plugin.updateMatch({
        matchId: 10,
        tournamentId: 1,
        player1Sets: 0,
        player2Sets: 0,
        player1Forfeit: true,
        player2Forfeit: false,
        prisma: mockPrisma,
      });

      expect(result.match.winnerId).toBe(2); // member2Id wins
    });

    it('should signal tournament completion when last round last match is played', async () => {
      // Tournament on round 3 of 3, both matches in round 3 now complete
      const tournament = makeSwissTournament({
        participantCount: 4,
        numberOfRounds: 3,
        currentRound: 3,
        matches: [
          makeMatch({ id: 10, member1Id: 1, member2Id: 2, round: 3, player1Sets: 3, player2Sets: 1 }),
          makeMatch({ id: 11, member1Id: 3, member2Id: 4, round: 3, player1Sets: 3, player2Sets: 0 }),
        ],
      });
      const mockPrisma = makeMockPrisma({ tournament });

      const result = await plugin.updateMatch({
        matchId: 10,
        tournamentId: 1,
        player1Sets: 3,
        player2Sets: 1,
        player1Forfeit: false,
        player2Forfeit: false,
        prisma: mockPrisma,
      });

      expect(result.tournamentStateChange?.shouldMarkComplete).toBe(true);
      expect(mockPrisma.swissTournamentData.update).toHaveBeenCalledWith({
        where: { tournamentId: 1 },
        data: { isCompleted: true },
      });
    });

    it('should not signal completion when matches remain in current round', async () => {
      // Round 1, only 1 of 2 matches played
      const tournament = makeSwissTournament({
        participantCount: 4,
        numberOfRounds: 3,
        currentRound: 1,
        matches: [
          makeMatch({ id: 10, member1Id: 1, member2Id: 2, round: 1, player1Sets: 3, player2Sets: 1 }),
          makeMatch({ id: 11, member1Id: 3, member2Id: 4, round: 1 }), // unplayed
        ],
      });
      const mockPrisma = makeMockPrisma({ tournament });

      const result = await plugin.updateMatch({
        matchId: 10,
        tournamentId: 1,
        player1Sets: 3,
        player2Sets: 1,
        player1Forfeit: false,
        player2Forfeit: false,
        prisma: mockPrisma,
      });

      expect(result.tournamentStateChange).toBeUndefined();
    });
  });

  // ─── generateNextRound ─────────────────────────────────────────────────

  describe('generateNextRound', () => {
    it('should throw when tournament not found', async () => {
      const mockPrisma = {
        tournament: { findUnique: jest.fn().mockResolvedValue(null) },
      };

      await expect(plugin.generateNextRound(999, mockPrisma))
        .rejects.toThrow('Tournament or Swiss config not found');
    });

    it('should throw when all rounds have been completed', async () => {
      const tournament = makeSwissTournament({
        participantCount: 4,
        numberOfRounds: 3,
        currentRound: 3,
      });
      const mockPrisma = {
        tournament: { findUnique: jest.fn().mockResolvedValue(tournament) },
      };

      await expect(plugin.generateNextRound(1, mockPrisma))
        .rejects.toThrow('All rounds have been completed');
    });

    it('should create matches for round 1 with initial pairings', async () => {
      // 4 players, ratings: [2000, 1800, 1600, 1400]
      // Round 1 (no prior matches): standings sorted by rating
      // Pairing: highest vs lowest in same group → 1v4, 2v3
      const tournament = makeSwissTournament({
        participantCount: 4,
        numberOfRounds: 3,
        currentRound: 0,
        participantRatings: [2000, 1800, 1600, 1400],
      });

      const createdMatches: any[] = [];
      const mockPrisma = {
        tournament: {
          findUnique: jest.fn().mockResolvedValue(tournament),
        },
        match: {
          create: jest.fn().mockImplementation(async (args: any) => {
            const m = { id: createdMatches.length + 1, ...args.data };
            createdMatches.push(m);
            return m;
          }),
        },
        swissTournamentData: {
          update: jest.fn().mockResolvedValue({}),
        },
      };

      await plugin.generateNextRound(1, mockPrisma);

      // Should create 2 matches (4 players / 2)
      expect(mockPrisma.match.create).toHaveBeenCalledTimes(2);

      // Verify round number is 1
      const calls = mockPrisma.match.create.mock.calls;
      expect(calls[0][0].data.round).toBe(1);
      expect(calls[1][0].data.round).toBe(1);

      // Should update currentRound to 1
      expect(mockPrisma.swissTournamentData.update).toHaveBeenCalledWith({
        where: { tournamentId: 1 },
        data: { currentRound: 1 },
      });
    });

    it('should pair players who havent played each other in subsequent rounds', async () => {
      // 4 players, round 1 complete: 1v4 (1 won), 2v3 (2 won)
      // Standings: player 1 (1pt, 2000), player 2 (1pt, 1800), player 3 (0pt, 1600), player 4 (0pt, 1400)
      // Round 2 pairing: 1 vs 2 (same group, haven't played), 3 vs 4 (same group, haven't played)
      const tournament = makeSwissTournament({
        participantCount: 4,
        numberOfRounds: 3,
        currentRound: 1,
        participantRatings: [2000, 1800, 1600, 1400],
        matches: [
          makeMatch({ id: 1, member1Id: 1, member2Id: 4, round: 1, player1Sets: 3, player2Sets: 0 }),
          makeMatch({ id: 2, member1Id: 2, member2Id: 3, round: 1, player1Sets: 3, player2Sets: 1 }),
        ],
      });

      const createdMatches: any[] = [];
      const mockPrisma = {
        tournament: {
          findUnique: jest.fn().mockResolvedValue(tournament),
        },
        match: {
          create: jest.fn().mockImplementation(async (args: any) => {
            createdMatches.push(args.data);
            return { id: 100 + createdMatches.length, ...args.data };
          }),
        },
        swissTournamentData: {
          update: jest.fn().mockResolvedValue({}),
        },
      };

      await plugin.generateNextRound(1, mockPrisma);

      expect(mockPrisma.match.create).toHaveBeenCalledTimes(2);

      // Verify pairings avoid rematches
      const pairings = createdMatches.map(m => [m.member1Id, m.member2Id]);
      // Player 1 should NOT be paired with player 4 again
      // Player 2 should NOT be paired with player 3 again
      for (const [a, b] of pairings) {
        expect([a, b].sort()).not.toEqual([1, 4]);
        expect([a, b].sort()).not.toEqual([2, 3]);
      }

      // All 4 players should be paired
      const allPlayers = pairings.flat().sort();
      expect(allPlayers).toEqual([1, 2, 3, 4]);
    });
  });

  // ─── onMatchRatingCalculation ──────────────────────────────────────────

  describe('onMatchRatingCalculation', () => {
    it('should call adjustRatingsForSingleMatch for non-forfeit match', async () => {
      const { adjustRatingsForSingleMatch } = require('../../src/services/usattRatingService');

      const mockPrisma = {
        ratingHistory: { deleteMany: jest.fn().mockResolvedValue({}) },
      };

      await plugin.onMatchRatingCalculation!({
        tournament: { id: 1 },
        match: {
          id: 5,
          member1Id: 10,
          member2Id: 20,
          player1Sets: 3,
          player2Sets: 1,
          player1Forfeit: false,
          player2Forfeit: false,
          winnerId: 10,
          tournamentId: 1,
        },
        winnerId: 10,
        prisma: mockPrisma,
      });

      expect(mockPrisma.ratingHistory.deleteMany).toHaveBeenCalledWith({
        where: { matchId: 5 },
      });
      expect(adjustRatingsForSingleMatch).toHaveBeenCalledWith(10, 20, true, 1, 5);
    });

    it('should skip rating calculation for forfeit matches', async () => {
      const { adjustRatingsForSingleMatch } = require('../../src/services/usattRatingService');

      const mockPrisma = {
        ratingHistory: { deleteMany: jest.fn() },
      };

      await plugin.onMatchRatingCalculation!({
        tournament: { id: 1 },
        match: {
          id: 5,
          member1Id: 10,
          member2Id: 20,
          player1Sets: 0,
          player2Sets: 0,
          player1Forfeit: true,
          player2Forfeit: false,
          winnerId: 20,
          tournamentId: 1,
        },
        winnerId: 20,
        prisma: mockPrisma,
      });

      expect(adjustRatingsForSingleMatch).not.toHaveBeenCalled();
      expect(mockPrisma.ratingHistory.deleteMany).not.toHaveBeenCalled();
    });

    it('should skip when member2Id is missing (bye)', async () => {
      const { adjustRatingsForSingleMatch } = require('../../src/services/usattRatingService');

      const mockPrisma = {
        ratingHistory: { deleteMany: jest.fn() },
      };

      await plugin.onMatchRatingCalculation!({
        tournament: { id: 1 },
        match: {
          id: 5,
          member1Id: 10,
          member2Id: null,
          player1Sets: 0,
          player2Sets: 0,
          player1Forfeit: false,
          player2Forfeit: false,
          winnerId: 10,
          tournamentId: 1,
        },
        winnerId: 10,
        prisma: mockPrisma,
      });

      expect(adjustRatingsForSingleMatch).not.toHaveBeenCalled();
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
    it('should return empty standings array', async () => {
      const result = await plugin.getPrintableView({ tournament: {}, prisma: {} });
      expect(result.standings).toEqual([]);
    });
  });

  // ─── Swiss Pairing Logic (tested indirectly via generateNextRound) ─────

  describe('Swiss pairing algorithm', () => {
    it('should handle 6 players across multiple rounds without rematches', async () => {
      // 6 players, round 1 complete
      // After round 1: 1,2,3 have 1 point; 4,5,6 have 0 points
      const tournament = makeSwissTournament({
        participantCount: 6,
        numberOfRounds: 3,
        currentRound: 1,
        participantRatings: [2000, 1900, 1800, 1700, 1600, 1500],
        matches: [
          makeMatch({ id: 1, member1Id: 1, member2Id: 6, round: 1, player1Sets: 3, player2Sets: 0 }),
          makeMatch({ id: 2, member1Id: 2, member2Id: 5, round: 1, player1Sets: 3, player2Sets: 1 }),
          makeMatch({ id: 3, member1Id: 3, member2Id: 4, round: 1, player1Sets: 3, player2Sets: 2 }),
        ],
      });

      const createdMatches: any[] = [];
      const mockPrisma = {
        tournament: { findUnique: jest.fn().mockResolvedValue(tournament) },
        match: {
          create: jest.fn().mockImplementation(async (args: any) => {
            createdMatches.push(args.data);
            return { id: 100 + createdMatches.length, ...args.data };
          }),
        },
        swissTournamentData: { update: jest.fn().mockResolvedValue({}) },
      };

      await plugin.generateNextRound(1, mockPrisma);

      // Should create 3 matches
      expect(mockPrisma.match.create).toHaveBeenCalledTimes(3);

      // Verify no rematches from round 1
      for (const m of createdMatches) {
        const pair = [m.member1Id, m.member2Id].sort();
        expect(pair).not.toEqual([1, 6]);
        expect(pair).not.toEqual([2, 5]);
        expect(pair).not.toEqual([3, 4]);
      }

      // All 6 players should be paired
      const allPlayers = createdMatches.flatMap(m => [m.member1Id, m.member2Id]).sort();
      expect(allPlayers).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should pair by points first, then by rating within same group', async () => {
      // After round 1: players 1,2 have 1 point; players 3,4 have 0 points
      // Round 2 should pair within point groups: 1v2 and 3v4
      const tournament = makeSwissTournament({
        participantCount: 4,
        numberOfRounds: 3,
        currentRound: 1,
        participantRatings: [2000, 1800, 1600, 1400],
        matches: [
          makeMatch({ id: 1, member1Id: 1, member2Id: 3, round: 1, player1Sets: 3, player2Sets: 0 }),
          makeMatch({ id: 2, member1Id: 2, member2Id: 4, round: 1, player1Sets: 3, player2Sets: 1 }),
        ],
      });

      const createdMatches: any[] = [];
      const mockPrisma = {
        tournament: { findUnique: jest.fn().mockResolvedValue(tournament) },
        match: {
          create: jest.fn().mockImplementation(async (args: any) => {
            createdMatches.push(args.data);
            return { id: 100, ...args.data };
          }),
        },
        swissTournamentData: { update: jest.fn().mockResolvedValue({}) },
      };

      await plugin.generateNextRound(1, mockPrisma);

      const pairings = createdMatches.map(m => [m.member1Id, m.member2Id].sort());
      // 1 and 2 should be paired (both 1 point)
      expect(pairings).toContainEqual([1, 2]);
      // 3 and 4 should be paired (both 0 points)
      expect(pairings).toContainEqual([3, 4]);
    });
  });

  // ─── createTournament ──────────────────────────────────────────────────

  describe('createTournament', () => {
    it('should create tournament with swissData config', async () => {
      const createdTournament = {
        id: 1,
        type: 'SWISS',
        status: 'ACTIVE',
        participants: [
          { memberId: 1, playerRatingAtTime: 1500, member: { id: 1, rating: 1500 } },
          { memberId: 2, playerRatingAtTime: 1400, member: { id: 2, rating: 1400 } },
        ],
        matches: [],
        swissData: { tournamentId: 1, numberOfRounds: 3, currentRound: 0, isCompleted: false },
      };

      const mockPrisma = {
        tournament: {
          create: jest.fn().mockResolvedValue(createdTournament),
          findUnique: jest.fn().mockResolvedValue({
            ...createdTournament,
            matches: [{ id: 1, member1Id: 1, member2Id: 2, round: 1 }],
            swissData: { ...createdTournament.swissData, currentRound: 1 },
          }),
        },
        match: {
          create: jest.fn().mockResolvedValue({ id: 1 }),
        },
        swissTournamentData: {
          update: jest.fn().mockResolvedValue({}),
        },
      };

      const result = await plugin.createTournament({
        name: 'Test Swiss',
        participantIds: [1, 2],
        players: [
          { id: 1, rating: 1500 },
          { id: 2, rating: 1400 },
        ],
        prisma: mockPrisma,
        additionalData: { numberOfRounds: 3 },
      });

      // Should create tournament with swissData
      const createCall = mockPrisma.tournament.create.mock.calls[0][0];
      expect(createCall.data.type).toBe('SWISS');
      expect(createCall.data.swissData.create.numberOfRounds).toBe(3);
      expect(createCall.data.swissData.create.currentRound).toBe(0);
      expect(createCall.data.swissData.create.isCompleted).toBe(false);

      // Should generate round 1 pairings
      expect(mockPrisma.match.create).toHaveBeenCalled();
    });

    it('should default to 3 rounds when numberOfRounds not specified', async () => {
      const createdTournament = {
        id: 1, type: 'SWISS', status: 'ACTIVE',
        participants: [
          { memberId: 1, playerRatingAtTime: 1500, member: { id: 1 } },
          { memberId: 2, playerRatingAtTime: 1400, member: { id: 2 } },
        ],
        matches: [],
        swissData: { tournamentId: 1, numberOfRounds: 3, currentRound: 0, isCompleted: false },
      };

      const mockPrisma = {
        tournament: {
          create: jest.fn().mockResolvedValue(createdTournament),
          findUnique: jest.fn().mockResolvedValue(createdTournament),
        },
        match: { create: jest.fn().mockResolvedValue({ id: 1 }) },
        swissTournamentData: { update: jest.fn().mockResolvedValue({}) },
      };

      await plugin.createTournament({
        name: 'Test Swiss',
        participantIds: [1, 2],
        players: [{ id: 1, rating: 1500 }, { id: 2, rating: 1400 }],
        prisma: mockPrisma,
      });

      const createCall = mockPrisma.tournament.create.mock.calls[0][0];
      expect(createCall.data.swissData.create.numberOfRounds).toBe(3);
    });
  });
});
