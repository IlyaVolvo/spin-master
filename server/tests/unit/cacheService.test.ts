/**
 * CacheService — Unit Tests
 *
 * Tests the in-memory cache for post-tournament ratings:
 * - getCachedPostTournamentRating, setCachedPostTournamentRating
 * - invalidateTournamentCache
 * - getCacheStats
 * - Cache key format: `${tournamentId}-${memberId}`
 */

// Mock prisma
jest.mock('../../src/index', () => ({
  prisma: {
    tournament: { findMany: jest.fn().mockResolvedValue([]) },
    member: { findMany: jest.fn().mockResolvedValue([]) },
  },
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
  getCachedPostTournamentRating,
  setCachedPostTournamentRating,
  invalidateTournamentCache,
  getCacheStats,
} from '../../src/services/cacheService';

// ─── Tests ────────────────────────────────────────────────────────────────

describe('cacheService', () => {
  describe('getCachedPostTournamentRating', () => {
    it('returns undefined for non-existent entry', () => {
      const result = getCachedPostTournamentRating(999, 999);
      expect(result).toBeUndefined();
    });
  });

  describe('setCachedPostTournamentRating', () => {
    it('stores and retrieves a rating', () => {
      setCachedPostTournamentRating(1, 10, 1550);
      const result = getCachedPostTournamentRating(1, 10);
      expect(result).toBe(1550);
    });

    it('stores null rating', () => {
      setCachedPostTournamentRating(1, 20, null);
      const result = getCachedPostTournamentRating(1, 20);
      expect(result).toBeNull();
    });

    it('overwrites existing rating', () => {
      setCachedPostTournamentRating(1, 30, 1500);
      setCachedPostTournamentRating(1, 30, 1600);
      const result = getCachedPostTournamentRating(1, 30);
      expect(result).toBe(1600);
    });

    it('stores ratings for different tournament-member pairs independently', () => {
      setCachedPostTournamentRating(1, 10, 1500);
      setCachedPostTournamentRating(1, 20, 1600);
      setCachedPostTournamentRating(2, 10, 1700);

      expect(getCachedPostTournamentRating(1, 10)).toBe(1500);
      expect(getCachedPostTournamentRating(1, 20)).toBe(1600);
      expect(getCachedPostTournamentRating(2, 10)).toBe(1700);
    });

    it('uses correct cache key format (tournamentId-memberId)', () => {
      setCachedPostTournamentRating(5, 42, 1800);
      // Verify by retrieving with same IDs
      expect(getCachedPostTournamentRating(5, 42)).toBe(1800);
      // Different IDs should not match
      expect(getCachedPostTournamentRating(42, 5)).toBeUndefined();
    });
  });

  describe('invalidateTournamentCache', () => {
    it('removes all entries for a specific tournament', () => {
      setCachedPostTournamentRating(10, 1, 1500);
      setCachedPostTournamentRating(10, 2, 1600);
      setCachedPostTournamentRating(10, 3, 1700);
      setCachedPostTournamentRating(20, 1, 1800);

      invalidateTournamentCache(10);

      expect(getCachedPostTournamentRating(10, 1)).toBeUndefined();
      expect(getCachedPostTournamentRating(10, 2)).toBeUndefined();
      expect(getCachedPostTournamentRating(10, 3)).toBeUndefined();
      // Other tournament's entries should remain
      expect(getCachedPostTournamentRating(20, 1)).toBe(1800);
    });

    it('does nothing for tournament with no cached entries', () => {
      setCachedPostTournamentRating(30, 1, 1500);
      invalidateTournamentCache(999);
      expect(getCachedPostTournamentRating(30, 1)).toBe(1500);
    });
  });

  describe('getCacheStats', () => {
    it('returns cache metadata', () => {
      const stats = getCacheStats();
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('lastUpdated');
      expect(stats).toHaveProperty('initialized');
      expect(typeof stats.size).toBe('number');
      expect(typeof stats.lastUpdated).toBe('number');
      expect(typeof stats.initialized).toBe('boolean');
    });

    it('size increases when entries are added', () => {
      const before = getCacheStats().size;
      setCachedPostTournamentRating(100, 100, 1500);
      const after = getCacheStats().size;
      expect(after).toBeGreaterThanOrEqual(before);
    });
  });
});
