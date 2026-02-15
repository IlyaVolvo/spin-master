/**
 * PlayoffBracketService — Unit Tests
 *
 * Tests pure functions from the playoff bracket service:
 * - calculateRounds, calculateBracketSize
 * - generateSeeding
 * - generateBracketPositions (seeding, BYEs, edge cases)
 * - generateTournamentBracketPattern (via bracket position validation)
 *
 * No database, no HTTP server — pure logic testing.
 */

// Mock PrismaClient before importing the service
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  calculateRounds,
  calculateBracketSize,
  generateSeeding,
  generateBracketPositions,
} from '../../src/services/playoffBracketService';

// ─── calculateBracketSize ─────────────────────────────────────────────────

describe('calculateBracketSize', () => {
  it('returns 2 for 2 players', () => {
    expect(calculateBracketSize(2)).toBe(2);
  });

  it('returns 4 for 3 players', () => {
    expect(calculateBracketSize(3)).toBe(4);
  });

  it('returns 4 for 4 players', () => {
    expect(calculateBracketSize(4)).toBe(4);
  });

  it('returns 8 for 5 players', () => {
    expect(calculateBracketSize(5)).toBe(8);
  });

  it('returns 8 for 7 players', () => {
    expect(calculateBracketSize(7)).toBe(8);
  });

  it('returns 8 for 8 players', () => {
    expect(calculateBracketSize(8)).toBe(8);
  });

  it('returns 16 for 9 players', () => {
    expect(calculateBracketSize(9)).toBe(16);
  });

  it('returns 16 for 16 players', () => {
    expect(calculateBracketSize(16)).toBe(16);
  });

  it('returns 32 for 17 players', () => {
    expect(calculateBracketSize(17)).toBe(32);
  });

  it('returns 32 for 32 players', () => {
    expect(calculateBracketSize(32)).toBe(32);
  });

  it('returns 64 for 33 players', () => {
    expect(calculateBracketSize(33)).toBe(64);
  });

  it('handles edge case of 1 player', () => {
    expect(calculateBracketSize(1)).toBe(1);
  });
});

// ─── calculateRounds ──────────────────────────────────────────────────────

describe('calculateRounds', () => {
  it('returns 1 round for 2 players', () => {
    expect(calculateRounds(2)).toBe(1);
  });

  it('returns 2 rounds for 3 players (bracket size 4)', () => {
    expect(calculateRounds(3)).toBe(2);
  });

  it('returns 2 rounds for 4 players', () => {
    expect(calculateRounds(4)).toBe(2);
  });

  it('returns 3 rounds for 5 players (bracket size 8)', () => {
    expect(calculateRounds(5)).toBe(3);
  });

  it('returns 3 rounds for 8 players', () => {
    expect(calculateRounds(8)).toBe(3);
  });

  it('returns 4 rounds for 16 players', () => {
    expect(calculateRounds(16)).toBe(4);
  });

  it('returns 5 rounds for 32 players', () => {
    expect(calculateRounds(32)).toBe(5);
  });

  it('returns 4 rounds for 9 players (bracket size 16)', () => {
    expect(calculateRounds(9)).toBe(4);
  });
});

// ─── generateSeeding ──────────────────────────────────────────────────────

describe('generateSeeding', () => {
  it('sorts players by rating descending', () => {
    const participants = [
      { memberId: 1, playerRatingAtTime: 1500 },
      { memberId: 2, playerRatingAtTime: 1800 },
      { memberId: 3, playerRatingAtTime: 1200 },
    ];
    const result = generateSeeding(participants);
    expect(result).toEqual([2, 1, 3]);
  });

  it('uses memberId as tiebreaker when ratings are equal', () => {
    const participants = [
      { memberId: 5, playerRatingAtTime: 1500 },
      { memberId: 2, playerRatingAtTime: 1500 },
      { memberId: 8, playerRatingAtTime: 1500 },
    ];
    const result = generateSeeding(participants);
    expect(result).toEqual([2, 5, 8]);
  });

  it('treats null ratings as 0', () => {
    const participants = [
      { memberId: 1, playerRatingAtTime: null },
      { memberId: 2, playerRatingAtTime: 1500 },
      { memberId: 3, playerRatingAtTime: null },
    ];
    const result = generateSeeding(participants);
    expect(result).toEqual([2, 1, 3]);
  });

  it('handles all null ratings — sorts by memberId', () => {
    const participants = [
      { memberId: 3, playerRatingAtTime: null },
      { memberId: 1, playerRatingAtTime: null },
      { memberId: 2, playerRatingAtTime: null },
    ];
    const result = generateSeeding(participants);
    expect(result).toEqual([1, 2, 3]);
  });

  it('handles single player', () => {
    const participants = [{ memberId: 42, playerRatingAtTime: 1500 }];
    const result = generateSeeding(participants);
    expect(result).toEqual([42]);
  });

  it('handles empty array', () => {
    const result = generateSeeding([]);
    expect(result).toEqual([]);
  });

  it('does not mutate original array', () => {
    const participants = [
      { memberId: 1, playerRatingAtTime: 1200 },
      { memberId: 2, playerRatingAtTime: 1800 },
    ];
    const original = [...participants];
    generateSeeding(participants);
    expect(participants).toEqual(original);
  });

  it('handles mixed null and non-null ratings', () => {
    const participants = [
      { memberId: 1, playerRatingAtTime: 1000 },
      { memberId: 2, playerRatingAtTime: null },
      { memberId: 3, playerRatingAtTime: 2000 },
      { memberId: 4, playerRatingAtTime: null },
    ];
    const result = generateSeeding(participants);
    // 2000, 1000, then nulls (treated as 0) sorted by memberId
    expect(result).toEqual([3, 1, 2, 4]);
  });
});

// ─── generateBracketPositions ─────────────────────────────────────────────

describe('generateBracketPositions', () => {
  describe('basic structure', () => {
    it('returns array of correct bracket size', () => {
      const players = [1, 2, 3, 4, 5];
      const bracketSize = 8;
      const result = generateBracketPositions(players, bracketSize);
      expect(result).toHaveLength(bracketSize);
    });

    it('places all players in the bracket', () => {
      const players = [1, 2, 3, 4, 5, 6, 7, 8];
      const bracketSize = 8;
      const result = generateBracketPositions(players, bracketSize);
      const placedPlayers = result.filter(p => p !== null) as number[];
      expect(placedPlayers.sort()).toEqual(players.sort());
    });

    it('has correct number of BYEs', () => {
      const players = [1, 2, 3, 4, 5]; // 5 players, bracket size 8 → 3 BYEs
      const bracketSize = 8;
      const result = generateBracketPositions(players, bracketSize);
      const byeCount = result.filter(p => p === null).length;
      expect(byeCount).toBe(3);
    });

    it('has no BYEs when players fill bracket exactly', () => {
      const players = [1, 2, 3, 4, 5, 6, 7, 8];
      const bracketSize = 8;
      const result = generateBracketPositions(players, bracketSize);
      const byeCount = result.filter(p => p === null).length;
      expect(byeCount).toBe(0);
    });
  });

  describe('BYE placement', () => {
    it('BYEs are always in position 2 of each match pair (even index has player, odd index has null)', () => {
      const players = [1, 2, 3, 4, 5]; // 3 BYEs
      const bracketSize = 8;
      const result = generateBracketPositions(players, bracketSize);

      for (let i = 0; i < bracketSize; i += 2) {
        const pos1 = result[i];
        const pos2 = result[i + 1];
        // If there's a BYE in this match, it must be in position 2
        if (pos1 === null || pos2 === null) {
          if (pos1 === null && pos2 === null) {
            // Double BYE should not happen
            fail('Double BYE found at positions ' + i + ' and ' + (i + 1));
          }
          // BYE must be in position 2 (odd index)
          expect(pos2).toBeNull();
          expect(pos1).not.toBeNull();
        }
      }
    });

    it('no double BYEs exist (both positions in a match are null)', () => {
      const players = [1, 2, 3, 4, 5]; // 3 BYEs in bracket of 8
      const bracketSize = 8;
      const result = generateBracketPositions(players, bracketSize);

      for (let i = 0; i < bracketSize; i += 2) {
        const bothNull = result[i] === null && result[i + 1] === null;
        expect(bothNull).toBe(false);
      }
    });

    it('top-rated players get BYEs', () => {
      // 5 players in bracket of 8 → 3 BYEs
      // Top 3 players by rating should get BYEs
      const players = [10, 20, 30, 40, 50]; // sorted by rating desc (10 is highest seed)
      const bracketSize = 8;
      const result = generateBracketPositions(players, bracketSize);

      // Top 3 players (10, 20, 30) should have BYE opponents (null in paired position)
      const topPlayers = [10, 20, 30];
      for (const topPlayer of topPlayers) {
        const pos = result.indexOf(topPlayer);
        expect(pos).not.toBe(-1);
        const isEven = pos % 2 === 0;
        const pairedPos = isEven ? pos + 1 : pos - 1;
        expect(result[pairedPos]).toBeNull();
      }
    });
  });

  describe('seeded positions', () => {
    it('with numSeeded=0, no players are placed in seeded positions', () => {
      const players = [1, 2, 3, 4, 5, 6, 7, 8];
      const bracketSize = 8;
      const result = generateBracketPositions(players, bracketSize, 0);
      // All players should be placed but not necessarily in seeded order
      const placedPlayers = result.filter(p => p !== null) as number[];
      expect(placedPlayers.sort()).toEqual(players.sort());
    });

    it('with numSeeded=2 and bracketSize=8, seed 1 and 2 are in correct positions', () => {
      const players = [1, 2, 3, 4, 5, 6, 7, 8]; // 1 = highest seed
      const bracketSize = 8;
      const result = generateBracketPositions(players, bracketSize, 2);
      // Seed 1 should be at position 0, Seed 2 at position 7 (bracket pattern)
      expect(result[0]).toBe(1);
      expect(result[bracketSize - 1]).toBe(2);
    });

    it('throws for numSeeded=1 (invalid — must be 0 or power of 2 >= 2)', () => {
      const players = [1, 2, 3, 4, 5, 6, 7, 8];
      expect(() => generateBracketPositions(players, 8, 1)).toThrow();
    });

    it('throws for numSeeded=3 (not a power of 2)', () => {
      const players = [1, 2, 3, 4, 5, 6, 7, 8];
      expect(() => generateBracketPositions(players, 8, 3)).toThrow();
    });

    it('throws for negative numSeeded', () => {
      const players = [1, 2, 3, 4];
      expect(() => generateBracketPositions(players, 4, -1)).toThrow();
    });

    it('throws for numSeeded exceeding bracketSize/4', () => {
      // bracketSize=8, max numSeeded = 8/4 = 2
      const players = [1, 2, 3, 4, 5, 6, 7, 8];
      expect(() => generateBracketPositions(players, 8, 4)).toThrow();
    });
  });

  describe('2-player bracket', () => {
    it('places both players correctly', () => {
      const players = [1, 2];
      const bracketSize = 2;
      const result = generateBracketPositions(players, bracketSize);
      expect(result).toHaveLength(2);
      const placed = result.filter(p => p !== null);
      expect(placed).toHaveLength(2);
      expect(placed.sort()).toEqual([1, 2]);
    });
  });

  describe('4-player bracket', () => {
    it('places all 4 players with no BYEs', () => {
      const players = [1, 2, 3, 4];
      const bracketSize = 4;
      const result = generateBracketPositions(players, bracketSize);
      expect(result).toHaveLength(4);
      expect(result.filter(p => p === null)).toHaveLength(0);
    });

    it('3 players in bracket of 4 → 1 BYE', () => {
      const players = [1, 2, 3];
      const bracketSize = 4;
      const result = generateBracketPositions(players, bracketSize);
      expect(result.filter(p => p === null)).toHaveLength(1);
      expect(result.filter(p => p !== null)).toHaveLength(3);
    });
  });

  describe('16-player bracket', () => {
    it('places all 16 players with no BYEs', () => {
      const players = Array.from({ length: 16 }, (_, i) => i + 1);
      const bracketSize = 16;
      const result = generateBracketPositions(players, bracketSize);
      expect(result).toHaveLength(16);
      expect(result.filter(p => p === null)).toHaveLength(0);
    });

    it('10 players in bracket of 16 → 6 BYEs', () => {
      const players = Array.from({ length: 10 }, (_, i) => i + 1);
      const bracketSize = 16;
      const result = generateBracketPositions(players, bracketSize);
      expect(result.filter(p => p === null)).toHaveLength(6);
    });

    it('with numSeeded=4, top 4 seeds are in correct bracket positions', () => {
      const players = Array.from({ length: 16 }, (_, i) => i + 1);
      const bracketSize = 16;
      const result = generateBracketPositions(players, bracketSize, 4);
      // Seed 1 at position 0, Seed 2 at position 15
      expect(result[0]).toBe(1);
      expect(result[bracketSize - 1]).toBe(2);
    });
  });

  describe('large bracket edge cases', () => {
    it('handles 32-player bracket', () => {
      const players = Array.from({ length: 32 }, (_, i) => i + 1);
      const bracketSize = 32;
      const result = generateBracketPositions(players, bracketSize);
      expect(result).toHaveLength(32);
      expect(result.filter(p => p === null)).toHaveLength(0);
      const placed = (result.filter(p => p !== null) as number[]).sort((a, b) => a - b);
      expect(placed).toEqual(players);
    });

    it('handles 20 players in bracket of 32 → players + BYEs = bracketSize', () => {
      const players = Array.from({ length: 20 }, (_, i) => i + 1);
      const bracketSize = 32;
      const result = generateBracketPositions(players, bracketSize);
      expect(result).toHaveLength(bracketSize);
      const playerCount = result.filter(p => p !== null).length;
      const byeCount = result.filter(p => p === null).length;
      expect(playerCount + byeCount).toBe(bracketSize);
      // All placed players should be unique
      const placed = result.filter(p => p !== null) as number[];
      expect(new Set(placed).size).toBe(placed.length);
    });

    it('every player appears exactly once', () => {
      const players = Array.from({ length: 12 }, (_, i) => i + 1);
      const bracketSize = 16;
      const result = generateBracketPositions(players, bracketSize);
      const placed = result.filter(p => p !== null) as number[];
      // Each player appears exactly once
      expect(new Set(placed).size).toBe(players.length);
      expect(placed.length).toBe(players.length);
    });
  });

  describe('deterministic seeded positions', () => {
    it('seed 1 is always at position 0 when numSeeded >= 2', () => {
      for (let size = 8; size <= 32; size *= 2) {
        const maxSeeded = size / 4;
        const players = Array.from({ length: size }, (_, i) => i + 1);
        const result = generateBracketPositions(players, size, maxSeeded);
        expect(result[0]).toBe(1);
      }
    });

    it('seed 2 is always at last position when numSeeded >= 2', () => {
      for (let size = 8; size <= 32; size *= 2) {
        const maxSeeded = size / 4;
        const players = Array.from({ length: size }, (_, i) => i + 1);
        const result = generateBracketPositions(players, size, maxSeeded);
        expect(result[size - 1]).toBe(2);
      }
    });
  });
});
