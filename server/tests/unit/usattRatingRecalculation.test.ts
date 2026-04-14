/**
 * USATT Rating Recalculation — Unit Tests
 *
 * Focus:
 * - recalculateAllRatings() chronological recalculation flow
 * - createRatingHistoryForRoundRobinTournament() completion-time RR recalculation flow
 *
 * These tests exercise the real service functions with mocked Prisma/cache dependencies.
 */

jest.mock('../../src/index', () => ({
  prisma: {
    pointExchangeRule: {
      findMany: jest.fn(),
    },
    tournament: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    member: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    ratingHistory: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock('../../src/services/cacheService', () => ({
  getCachedPostTournamentRating: jest.fn(),
  setCachedPostTournamentRating: jest.fn(),
  invalidateTournamentCache: jest.fn(),
}));

import { prisma } from '../../src/index';
import {
  recalculateAllRatings,
  createRatingHistoryForRoundRobinTournament,
  adjustRatingsForSingleMatch,
} from '../../src/services/usattRatingService';
import {
  setCachedPostTournamentRating,
  invalidateTournamentCache,
} from '../../src/services/cacheService';

const mockPrisma = prisma as any;
const mockSetCachedPostTournamentRating = setCachedPostTournamentRating as jest.Mock;
const mockInvalidateTournamentCache = invalidateTournamentCache as jest.Mock;

const FALLBACK_RULES = [
  { minDiff: 0, maxDiff: 12, expectedPoints: 8, upsetPoints: 8 },
  { minDiff: 13, maxDiff: 37, expectedPoints: 7, upsetPoints: 10 },
  { minDiff: 38, maxDiff: 62, expectedPoints: 6, upsetPoints: 13 },
  { minDiff: 63, maxDiff: 87, expectedPoints: 5, upsetPoints: 16 },
  { minDiff: 88, maxDiff: 112, expectedPoints: 4, upsetPoints: 20 },
  { minDiff: 113, maxDiff: 137, expectedPoints: 3, upsetPoints: 25 },
  { minDiff: 138, maxDiff: 162, expectedPoints: 2, upsetPoints: 30 },
  { minDiff: 163, maxDiff: 187, expectedPoints: 2, upsetPoints: 35 },
  { minDiff: 188, maxDiff: 212, expectedPoints: 1, upsetPoints: 40 },
  { minDiff: 213, maxDiff: 237, expectedPoints: 1, upsetPoints: 45 },
  { minDiff: 238, maxDiff: 262, expectedPoints: 0, upsetPoints: 50 },
  { minDiff: 263, maxDiff: 287, expectedPoints: 0, upsetPoints: 55 },
  { minDiff: 288, maxDiff: 312, expectedPoints: 0, upsetPoints: 60 },
  { minDiff: 313, maxDiff: 337, expectedPoints: 0, upsetPoints: 65 },
  { minDiff: 338, maxDiff: 362, expectedPoints: 0, upsetPoints: 70 },
  { minDiff: 363, maxDiff: 387, expectedPoints: 0, upsetPoints: 75 },
  { minDiff: 388, maxDiff: 412, expectedPoints: 0, upsetPoints: 80 },
  { minDiff: 413, maxDiff: 437, expectedPoints: 0, upsetPoints: 85 },
  { minDiff: 438, maxDiff: 462, expectedPoints: 0, upsetPoints: 90 },
  { minDiff: 463, maxDiff: 487, expectedPoints: 0, upsetPoints: 95 },
  { minDiff: 488, maxDiff: 512, expectedPoints: 0, upsetPoints: 100 },
  { minDiff: 513, maxDiff: 99999, expectedPoints: 0, upsetPoints: 100 },
].map((rule) => ({ ...rule, effectiveFrom: new Date('2020-01-01T00:00:00.000Z') }));

function makeParticipant(memberId: number, playerRatingAtTime: number | null) {
  return {
    memberId,
    playerRatingAtTime,
    member: { id: memberId, rating: playerRatingAtTime },
  };
}

describe('usattRatingService recalculation flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.member.findUnique.mockReset();
    mockPrisma.pointExchangeRule.findMany.mockResolvedValue(FALLBACK_RULES);
    mockPrisma.member.update.mockImplementation(async ({ where, data }: any) => ({
      id: where.id,
      rating: data.rating,
    }));
  });

  describe('recalculateAllRatings', () => {
    it('does nothing when there are no completed tournaments', async () => {
      mockPrisma.tournament.findMany.mockResolvedValue([]);
      mockPrisma.member.findMany.mockResolvedValue([]);

      await recalculateAllRatings();

      expect(mockPrisma.tournament.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'COMPLETED' } })
      );
      expect(mockPrisma.member.update).not.toHaveBeenCalled();
      expect(mockSetCachedPostTournamentRating).not.toHaveBeenCalled();
      expect(mockInvalidateTournamentCache).not.toHaveBeenCalled();
    });

    it('recalculates ratings for a simple completed tournament and writes post-tournament cache', async () => {
      const tournaments = [
        {
          id: 10,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          status: 'COMPLETED',
          participants: [makeParticipant(1, 1500), makeParticipant(2, 1500)],
          matches: [
            {
              member1Id: 1,
              member2Id: 2,
              player1Sets: 3,
              player2Sets: 1,
              player1Forfeit: false,
              player2Forfeit: false,
            },
          ],
        },
      ];

      mockPrisma.tournament.findMany.mockResolvedValue(tournaments);
      mockPrisma.member.findMany.mockResolvedValue([
        { id: 1, rating: 1500 },
        { id: 2, rating: 1500 },
      ]);

      await recalculateAllRatings();

      expect(mockPrisma.member.update).toHaveBeenCalledTimes(2);
      expect(mockPrisma.member.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { rating: 1508 } });
      expect(mockPrisma.member.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { rating: 1492 } });

      expect(mockSetCachedPostTournamentRating).toHaveBeenCalledWith(10, 1, 1508);
      expect(mockSetCachedPostTournamentRating).toHaveBeenCalledWith(10, 2, 1492);
    });

    it('skips BYE, forfeit, and unplayed 0-0 matches during recalculation', async () => {
      const tournaments = [
        {
          id: 11,
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
          status: 'COMPLETED',
          participants: [makeParticipant(1, 1500), makeParticipant(2, 1500)],
          matches: [
            {
              member1Id: 1,
              member2Id: 2,
              player1Sets: 3,
              player2Sets: 0,
              player1Forfeit: false,
              player2Forfeit: false,
            },
            {
              member1Id: 1,
              member2Id: null,
              player1Sets: 3,
              player2Sets: 0,
              player1Forfeit: false,
              player2Forfeit: false,
            },
            {
              member1Id: 1,
              member2Id: 2,
              player1Sets: 0,
              player2Sets: 0,
              player1Forfeit: true,
              player2Forfeit: false,
            },
            {
              member1Id: 1,
              member2Id: 2,
              player1Sets: 0,
              player2Sets: 0,
              player1Forfeit: false,
              player2Forfeit: false,
            },
          ],
        },
      ];

      mockPrisma.tournament.findMany.mockResolvedValue(tournaments);
      mockPrisma.member.findMany.mockResolvedValue([
        { id: 1, rating: 1500 },
        { id: 2, rating: 1500 },
      ]);

      await recalculateAllRatings();

      expect(mockPrisma.member.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { rating: 1508 } });
      expect(mockPrisma.member.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { rating: 1492 } });
    });

    it('uses first tournament playerRatingAtTime as initial rating over current DB rating', async () => {
      const tournaments = [
        {
          id: 21,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          status: 'COMPLETED',
          participants: [makeParticipant(1, 1400)],
          matches: [],
        },
      ];

      mockPrisma.tournament.findMany.mockResolvedValue(tournaments);
      mockPrisma.member.findMany.mockResolvedValue([{ id: 1, rating: 1800 }]);

      await recalculateAllRatings();

      expect(mockPrisma.member.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { rating: 1400 } });
    });

    it('falls back to current DB rating when first tournament playerRatingAtTime is null', async () => {
      const tournaments = [
        {
          id: 22,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          status: 'COMPLETED',
          participants: [makeParticipant(1, null)],
          matches: [],
        },
      ];

      mockPrisma.tournament.findMany.mockResolvedValue(tournaments);
      mockPrisma.member.findMany.mockResolvedValue([{ id: 1, rating: 1666 }]);

      await recalculateAllRatings();

      expect(mockPrisma.member.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { rating: 1666 } });
    });
  });

  describe('createRatingHistoryForRoundRobinTournament', () => {
    it('returns early when tournament does not exist', async () => {
      mockPrisma.tournament.findUnique.mockResolvedValue(null);

      await createRatingHistoryForRoundRobinTournament(999);

      expect(mockPrisma.member.update).not.toHaveBeenCalled();
      expect(mockPrisma.ratingHistory.create).not.toHaveBeenCalled();
    });

    it('recalculates RR tournament ratings and creates history entries with TOURNAMENT_COMPLETED reason', async () => {
      const recordedAt = new Date('2026-02-01T12:00:00.000Z');
      const tournament = {
        id: 30,
        type: 'ROUND_ROBIN',
        createdAt: new Date('2026-01-30T12:00:00.000Z'),
        recordedAt,
        participants: [makeParticipant(1, 1500), makeParticipant(2, 1500)],
        matches: [
          {
            member1Id: 1,
            member2Id: 2,
            player1Sets: 3,
            player2Sets: 1,
            player1Forfeit: false,
            player2Forfeit: false,
          },
        ],
      };

      mockPrisma.tournament.findUnique.mockResolvedValue(tournament);
      mockPrisma.member.findMany.mockResolvedValue([
        { id: 1, rating: 1508 },
        { id: 2, rating: 1492 },
      ]);
      mockPrisma.ratingHistory.findFirst.mockResolvedValue(null);

      await createRatingHistoryForRoundRobinTournament(30);

      expect(mockPrisma.member.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { rating: 1508 } });
      expect(mockPrisma.member.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { rating: 1492 } });

      expect(mockPrisma.ratingHistory.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.ratingHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          memberId: 1,
          rating: 1508,
          ratingChange: 8,
          reason: 'TOURNAMENT_COMPLETED',
          tournamentId: 30,
          matchId: null,
          timestamp: recordedAt,
        }),
      });
      expect(mockPrisma.ratingHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          memberId: 2,
          rating: 1492,
          ratingChange: -8,
          reason: 'TOURNAMENT_COMPLETED',
          tournamentId: 30,
          matchId: null,
          timestamp: recordedAt,
        }),
      });
    });

    it('uses createdAt timestamp when recordedAt is null', async () => {
      const createdAt = new Date('2026-02-03T09:00:00.000Z');
      const tournament = {
        id: 31,
        type: 'ROUND_ROBIN',
        createdAt,
        recordedAt: null,
        participants: [makeParticipant(1, 1500), makeParticipant(2, 1500)],
        matches: [
          {
            member1Id: 1,
            member2Id: 2,
            player1Sets: 3,
            player2Sets: 0,
            player1Forfeit: false,
            player2Forfeit: false,
          },
        ],
      };

      mockPrisma.tournament.findUnique.mockResolvedValue(tournament);
      mockPrisma.member.findMany.mockResolvedValue([
        { id: 1, rating: 1508 },
        { id: 2, rating: 1492 },
      ]);
      mockPrisma.ratingHistory.findFirst.mockResolvedValue(null);

      await createRatingHistoryForRoundRobinTournament(31);

      expect(mockPrisma.ratingHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          memberId: 1,
          timestamp: createdAt,
        }),
      });
    });

    it('does not create duplicate history when an entry already exists', async () => {
      const tournament = {
        id: 32,
        type: 'ROUND_ROBIN',
        createdAt: new Date('2026-02-04T10:00:00.000Z'),
        recordedAt: new Date('2026-02-04T11:00:00.000Z'),
        participants: [makeParticipant(1, 1500), makeParticipant(2, 1500)],
        matches: [
          {
            member1Id: 1,
            member2Id: 2,
            player1Sets: 3,
            player2Sets: 1,
            player1Forfeit: false,
            player2Forfeit: false,
          },
        ],
      };

      mockPrisma.tournament.findUnique.mockResolvedValue(tournament);
      mockPrisma.member.findMany.mockResolvedValue([
        { id: 1, rating: 1508 },
        { id: 2, rating: 1492 },
      ]);
      mockPrisma.ratingHistory.findFirst
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce(null);

      await createRatingHistoryForRoundRobinTournament(32);

      expect(mockPrisma.ratingHistory.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.ratingHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ memberId: 2 }),
      });
    });

    it('does not create history entries when rating does not change', async () => {
      const tournament = {
        id: 33,
        type: 'ROUND_ROBIN',
        createdAt: new Date('2026-02-05T10:00:00.000Z'),
        recordedAt: new Date('2026-02-05T11:00:00.000Z'),
        participants: [makeParticipant(1, 1500), makeParticipant(2, 1500)],
        matches: [
          {
            member1Id: 1,
            member2Id: null,
            player1Sets: 3,
            player2Sets: 0,
            player1Forfeit: false,
            player2Forfeit: false,
          },
        ],
      };

      mockPrisma.tournament.findUnique.mockResolvedValue(tournament);
      mockPrisma.member.findMany.mockResolvedValue([
        { id: 1, rating: 1500 },
        { id: 2, rating: 1500 },
      ]);

      await createRatingHistoryForRoundRobinTournament(33);

      expect(mockPrisma.member.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { rating: 1500 } });
      expect(mockPrisma.member.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { rating: 1500 } });
      expect(mockPrisma.ratingHistory.create).not.toHaveBeenCalled();
    });

    it('recreates 5-player RR upset scenario and computes completion-time ratings', async () => {
      const tournament = {
        id: 34,
        type: 'ROUND_ROBIN',
        createdAt: new Date('2026-02-06T10:00:00.000Z'),
        recordedAt: new Date('2026-02-06T11:00:00.000Z'),
        participants: [
          makeParticipant(101, 2209), // Xin Yang
          makeParticipant(102, 1446), // Wei He
          makeParticipant(103, 1436), // Karin Svensson
          makeParticipant(104, 1192), // Nancy Hughes
          makeParticipant(105, 1182), // Jessica Butler
        ],
        matches: [
          // Xin vs all
          { member1Id: 101, member2Id: 102, player1Sets: 3, player2Sets: 1, player1Forfeit: false, player2Forfeit: false },
          { member1Id: 101, member2Id: 103, player1Sets: 3, player2Sets: 0, player1Forfeit: false, player2Forfeit: false },
          { member1Id: 101, member2Id: 104, player1Sets: 3, player2Sets: 0, player1Forfeit: false, player2Forfeit: false },
          { member1Id: 101, member2Id: 105, player1Sets: 3, player2Sets: 0, player1Forfeit: false, player2Forfeit: false },
          // Remaining matrix
          { member1Id: 102, member2Id: 103, player1Sets: 3, player2Sets: 1, player1Forfeit: false, player2Forfeit: false },
          { member1Id: 102, member2Id: 104, player1Sets: 2, player2Sets: 3, player1Forfeit: false, player2Forfeit: false },
          { member1Id: 102, member2Id: 105, player1Sets: 3, player2Sets: 1, player1Forfeit: false, player2Forfeit: false },
          { member1Id: 103, member2Id: 104, player1Sets: 1, player2Sets: 3, player1Forfeit: false, player2Forfeit: false },
          { member1Id: 103, member2Id: 105, player1Sets: 3, player2Sets: 1, player1Forfeit: false, player2Forfeit: false },
          { member1Id: 104, member2Id: 105, player1Sets: 3, player2Sets: 0, player1Forfeit: false, player2Forfeit: false },
        ],
      };

      const persistedRatings = new Map<number, number | null>([
        [101, 2209],
        [102, 1446],
        [103, 1436],
        [104, 1192],
        [105, 1182],
      ]);

      mockPrisma.member.update.mockImplementation(async ({ where, data }: any) => {
        persistedRatings.set(where.id, data.rating);
        return { id: where.id, rating: data.rating };
      });

      mockPrisma.tournament.findUnique.mockResolvedValue(tournament);
      mockPrisma.member.findMany.mockImplementation(async ({ where }: any) => {
        const ids: number[] = where?.id?.in ?? [];
        return ids.map((id) => ({ id, rating: persistedRatings.get(id) ?? null }));
      });
      mockPrisma.ratingHistory.findFirst.mockResolvedValue(null);

      await createRatingHistoryForRoundRobinTournament(34);

      const ratingUpdates = Object.fromEntries(
        mockPrisma.member.update.mock.calls.map((call: any[]) => [call[0].where.id, call[0].data.rating])
      );

      expect(ratingUpdates).toEqual({
        101: 2209,
        102: 1450,
        103: 1425,
        104: 1564,
        105: 1182,
      });

      // Nancy (1192) should gain significantly after beating stronger players.
      expect(ratingUpdates[104]).toBeGreaterThan(1192);
    });

    it('recreates 6-player RR standings scenario and computes completion-time ratings', async () => {
      const tournament = {
        id: 35,
        type: 'ROUND_ROBIN',
        createdAt: new Date('2026-02-07T10:00:00.000Z'),
        recordedAt: new Date('2026-02-07T11:00:00.000Z'),
        participants: [
          makeParticipant(201, 1678), // Anthony Allen
          makeParticipant(202, 1677), // Sergei Petrov
          makeParticipant(203, 1667), // Hua He
          makeParticipant(204, 1626), // Emily Lee
          makeParticipant(205, 1609), // Daniel Scott
          makeParticipant(206, 1602), // Elizabeth Washington
        ],
        matches: [
          // Anthony row
          { member1Id: 201, member2Id: 202, player1Sets: 0, player2Sets: 3, player1Forfeit: false, player2Forfeit: false },
          { member1Id: 201, member2Id: 203, player1Sets: 3, player2Sets: 0, player1Forfeit: false, player2Forfeit: false },
          { member1Id: 201, member2Id: 204, player1Sets: 1, player2Sets: 3, player1Forfeit: false, player2Forfeit: false },
          { member1Id: 201, member2Id: 205, player1Sets: 2, player2Sets: 3, player1Forfeit: false, player2Forfeit: false },
          { member1Id: 201, member2Id: 206, player1Sets: 3, player2Sets: 1, player1Forfeit: false, player2Forfeit: false },
          // Sergei remaining
          { member1Id: 202, member2Id: 203, player1Sets: 1, player2Sets: 3, player1Forfeit: false, player2Forfeit: false },
          { member1Id: 202, member2Id: 204, player1Sets: 2, player2Sets: 3, player1Forfeit: false, player2Forfeit: false },
          { member1Id: 202, member2Id: 205, player1Sets: 3, player2Sets: 1, player1Forfeit: false, player2Forfeit: false },
          { member1Id: 202, member2Id: 206, player1Sets: 0, player2Sets: 3, player1Forfeit: false, player2Forfeit: false },
          // Hua remaining
          { member1Id: 203, member2Id: 204, player1Sets: 2, player2Sets: 3, player1Forfeit: false, player2Forfeit: false },
          { member1Id: 203, member2Id: 205, player1Sets: 3, player2Sets: 1, player1Forfeit: false, player2Forfeit: false },
          { member1Id: 203, member2Id: 206, player1Sets: 2, player2Sets: 3, player1Forfeit: false, player2Forfeit: false },
          // Emily remaining
          { member1Id: 204, member2Id: 205, player1Sets: 3, player2Sets: 0, player1Forfeit: false, player2Forfeit: false },
          { member1Id: 204, member2Id: 206, player1Sets: 0, player2Sets: 3, player1Forfeit: false, player2Forfeit: false },
          // Daniel vs Elizabeth
          { member1Id: 205, member2Id: 206, player1Sets: 2, player2Sets: 3, player1Forfeit: false, player2Forfeit: false },
        ],
      };

      const persistedRatings = new Map<number, number | null>([
        [201, 1678],
        [202, 1677],
        [203, 1667],
        [204, 1626],
        [205, 1609],
        [206, 1602],
      ]);

      mockPrisma.member.update.mockImplementation(async ({ where, data }: any) => {
        persistedRatings.set(where.id, data.rating);
        return { id: where.id, rating: data.rating };
      });

      mockPrisma.tournament.findUnique.mockResolvedValue(tournament);
      mockPrisma.member.findMany.mockImplementation(async ({ where }: any) => {
        const ids: number[] = where?.id?.in ?? [];
        return ids.map((id) => ({ id, rating: persistedRatings.get(id) ?? null }));
      });
      mockPrisma.ratingHistory.findFirst.mockResolvedValue(null);

      await createRatingHistoryForRoundRobinTournament(35);

      const ratingUpdates = Object.fromEntries(
        mockPrisma.member.update.mock.calls.map((call: any[]) => [call[0].where.id, call[0].data.rating])
      );

      // Lowest-rated winner should gain rating in completion-time RR recalculation.
      expect(ratingUpdates[206]).toBeGreaterThan(1602);
    });
  });

  describe('adjustRatingsForSingleMatch', () => {
    it('uses MATCH_COMPLETED for non-playoff tournaments', async () => {
      const tournament = {
        id: 40,
        type: 'ROUND_ROBIN',
        participants: [
          { memberId: 1, playerRatingAtTime: 1500, member: { id: 1, rating: 1500 } },
          { memberId: 2, playerRatingAtTime: 1500, member: { id: 2, rating: 1500 } },
        ],
      };

      mockPrisma.tournament.findUnique.mockResolvedValue(tournament);

      await adjustRatingsForSingleMatch(1, 2, true, 40, 400);

      expect(mockPrisma.member.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { rating: 1508 } });
      expect(mockPrisma.member.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { rating: 1492 } });
      expect(mockPrisma.ratingHistory.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          data: expect.objectContaining({
            memberId: 1,
            reason: 'MATCH_COMPLETED',
            tournamentId: 40,
            matchId: 400,
          }),
        })
      );
    });

    it('uses MATCH_COMPLETED for playoff tournaments (same as other per-match paths)', async () => {
      const tournament = {
        id: 41,
        type: 'PLAYOFF',
        participants: [
          { memberId: 1, playerRatingAtTime: 1500, member: { id: 1, rating: 1500 } },
          { memberId: 2, playerRatingAtTime: 1500, member: { id: 2, rating: 1500 } },
        ],
      };

      mockPrisma.tournament.findUnique.mockResolvedValue(tournament);

      await adjustRatingsForSingleMatch(1, 2, true, 41, 401);

      expect(mockPrisma.ratingHistory.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          data: expect.objectContaining({ reason: 'MATCH_COMPLETED' }),
        })
      );
      expect(mockPrisma.ratingHistory.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          data: expect.objectContaining({ reason: 'MATCH_COMPLETED' }),
        })
      );
    });

    it('uses current member.rating when useCurrentMemberRatings is set (sequential playoff)', async () => {
      const tournament = {
        id: 42,
        type: 'PLAYOFF',
        participants: [
          { memberId: 1, playerRatingAtTime: 1200, member: { id: 1, rating: 1200 } },
          { memberId: 2, playerRatingAtTime: 1200, member: { id: 2, rating: 1200 } },
        ],
      };

      mockPrisma.tournament.findUnique.mockResolvedValue(tournament);
      mockPrisma.member.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === 1) return { rating: 1195 };
        if (where.id === 2) return { rating: 1200 };
        return null;
      });

      await adjustRatingsForSingleMatch(1, 2, true, 42, 402, { useCurrentMemberRatings: true });

      // Diff 1200 - 1195 = 5 → 0–12 bucket, upset (lower-rated player 1 wins) → 8 points
      expect(mockPrisma.member.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { rating: 1203 } });
      expect(mockPrisma.member.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { rating: 1192 } });
    });
  });
});
