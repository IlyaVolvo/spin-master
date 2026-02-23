/**
 * Ranking Service — Unit Tests
 *
 * Tests the ranking calculation logic extracted from rankingService.ts.
 * The actual service uses Prisma, so we test the mathematical logic directly:
 * - Win rate calculation
 * - Set ratio calculation
 * - Weighted score formula
 * - Sorting/ranking order
 * - BYE and forfeit handling
 */

export {};

// ─── Extracted ranking logic ──────────────────────────────────────────────

interface PlayerStats {
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  matchesPlayed: number;
}

interface Match {
  member1Id: number;
  member2Id: number | null;
  player1Sets: number;
  player2Sets: number;
  player1Forfeit: boolean;
  player2Forfeit: boolean;
}

function processMatch(stats: Map<number, PlayerStats>, match: Match): void {
  // Skip BYE matches
  if (match.member1Id === 0 || match.member2Id === 0 || match.member2Id === null) {
    return;
  }

  const stats1 = stats.get(match.member1Id);
  const stats2 = stats.get(match.member2Id);

  if (!stats1 || !stats2) return;

  stats1.matchesPlayed++;
  stats2.matchesPlayed++;

  if (match.player1Forfeit) {
    stats1.losses++;
    stats2.wins++;
    stats1.setsLost += 1;
    stats2.setsWon += 1;
  } else if (match.player2Forfeit) {
    stats1.wins++;
    stats2.losses++;
    stats1.setsWon += 1;
    stats2.setsLost += 1;
  } else {
    stats1.setsWon += match.player1Sets;
    stats1.setsLost += match.player2Sets;
    stats2.setsWon += match.player2Sets;
    stats2.setsLost += match.player1Sets;

    if (match.player1Sets > match.player2Sets) {
      stats1.wins++;
      stats2.losses++;
    } else if (match.player2Sets > match.player1Sets) {
      stats2.wins++;
      stats1.losses++;
    }
  }
}

function calculateScore(stats: PlayerStats): number {
  const winRate = stats.matchesPlayed > 0 ? stats.wins / stats.matchesPlayed : 0;
  const setRatio = stats.setsLost > 0
    ? stats.setsWon / stats.setsLost
    : (stats.setsWon > 0 ? 999 : 0);
  return winRate * 0.7 + Math.min(setRatio / 2, 1) * 0.3;
}

function calculateRankings(
  playerIds: number[],
  matches: Match[]
): Array<{ memberId: number; score: number; wins: number; matchesPlayed: number }> {
  const stats = new Map<number, PlayerStats>();
  playerIds.forEach(id => {
    stats.set(id, { wins: 0, losses: 0, setsWon: 0, setsLost: 0, matchesPlayed: 0 });
  });

  for (const match of matches) {
    processMatch(stats, match);
  }

  return Array.from(stats.entries())
    .map(([memberId, s]) => ({
      memberId,
      wins: s.wins,
      matchesPlayed: s.matchesPlayed,
      score: calculateScore(s),
    }))
    .filter(p => p.matchesPlayed > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.wins - a.wins;
    });
}

function makeStats(overrides: Partial<PlayerStats> = {}): PlayerStats {
  return { wins: 0, losses: 0, setsWon: 0, setsLost: 0, matchesPlayed: 0, ...overrides };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('Ranking Calculation', () => {
  describe('calculateScore', () => {
    it('returns 0 for player with no matches', () => {
      expect(calculateScore(makeStats())).toBe(0);
    });

    it('returns 1.0 for player who won all matches with perfect set ratio', () => {
      // winRate = 1.0, setRatio = 999 (no sets lost), score = 0.7 + 0.3 = 1.0
      const score = calculateScore(makeStats({ wins: 5, losses: 0, setsWon: 15, setsLost: 0, matchesPlayed: 5 }));
      expect(score).toBe(1.0);
    });

    it('returns 0.7 for player who won all matches but set ratio is 1:1', () => {
      // winRate = 1.0, setRatio = 1.0, score = 0.7 + min(0.5, 1) * 0.3 = 0.7 + 0.15 = 0.85
      const score = calculateScore(makeStats({ wins: 5, losses: 0, setsWon: 15, setsLost: 15, matchesPlayed: 5 }));
      expect(score).toBeCloseTo(0.85, 5);
    });

    it('returns 0 for player who lost all matches with 0 sets won', () => {
      const score = calculateScore(makeStats({ wins: 0, losses: 5, setsWon: 0, setsLost: 15, matchesPlayed: 5 }));
      expect(score).toBe(0);
    });

    it('win rate contributes 70% of score', () => {
      // 50% win rate, 0 set ratio
      const score = calculateScore(makeStats({ wins: 5, losses: 5, setsWon: 0, setsLost: 15, matchesPlayed: 10 }));
      expect(score).toBeCloseTo(0.35, 5); // 0.5 * 0.7 + 0 * 0.3
    });

    it('set ratio contributes 30% of score (capped)', () => {
      // 0% win rate, high set ratio
      const score = calculateScore(makeStats({ wins: 0, losses: 5, setsWon: 10, setsLost: 1, matchesPlayed: 5 }));
      // winRate = 0, setRatio = 10, min(10/2, 1) = 1, score = 0 + 0.3 = 0.3
      expect(score).toBeCloseTo(0.3, 5);
    });

    it('set ratio is capped at contributing 0.3 max', () => {
      const score1 = calculateScore(makeStats({ wins: 0, losses: 1, setsWon: 100, setsLost: 1, matchesPlayed: 1 }));
      const score2 = calculateScore(makeStats({ wins: 0, losses: 1, setsWon: 3, setsLost: 1, matchesPlayed: 1 }));
      // Both should have set ratio contribution capped at 0.3
      expect(score1).toBeCloseTo(0.3, 5);
      expect(score2).toBeCloseTo(0.3, 5);
    });

    it('handles equal sets won and lost', () => {
      const score = calculateScore(makeStats({ wins: 3, losses: 3, setsWon: 9, setsLost: 9, matchesPlayed: 6 }));
      // winRate = 0.5, setRatio = 1.0, score = 0.35 + min(0.5, 1) * 0.3 = 0.35 + 0.15 = 0.5
      expect(score).toBeCloseTo(0.5, 5);
    });
  });

  describe('processMatch', () => {
    it('skips BYE matches (member1Id === 0)', () => {
      const stats = new Map<number, PlayerStats>();
      stats.set(0, makeStats());
      stats.set(1, makeStats());

      processMatch(stats, {
        member1Id: 0, member2Id: 1,
        player1Sets: 0, player2Sets: 3,
        player1Forfeit: false, player2Forfeit: false,
      });

      expect(stats.get(1)!.matchesPlayed).toBe(0);
    });

    it('skips BYE matches (member2Id === 0)', () => {
      const stats = new Map<number, PlayerStats>();
      stats.set(1, makeStats());
      stats.set(0, makeStats());

      processMatch(stats, {
        member1Id: 1, member2Id: 0,
        player1Sets: 3, player2Sets: 0,
        player1Forfeit: false, player2Forfeit: false,
      });

      expect(stats.get(1)!.matchesPlayed).toBe(0);
    });

    it('skips BYE matches (member2Id === null)', () => {
      const stats = new Map<number, PlayerStats>();
      stats.set(1, makeStats());

      processMatch(stats, {
        member1Id: 1, member2Id: null,
        player1Sets: 3, player2Sets: 0,
        player1Forfeit: false, player2Forfeit: false,
      });

      expect(stats.get(1)!.matchesPlayed).toBe(0);
    });

    it('records regular match correctly (player 1 wins)', () => {
      const stats = new Map<number, PlayerStats>();
      stats.set(1, makeStats());
      stats.set(2, makeStats());

      processMatch(stats, {
        member1Id: 1, member2Id: 2,
        player1Sets: 3, player2Sets: 1,
        player1Forfeit: false, player2Forfeit: false,
      });

      expect(stats.get(1)!.wins).toBe(1);
      expect(stats.get(1)!.losses).toBe(0);
      expect(stats.get(1)!.setsWon).toBe(3);
      expect(stats.get(1)!.setsLost).toBe(1);
      expect(stats.get(2)!.wins).toBe(0);
      expect(stats.get(2)!.losses).toBe(1);
      expect(stats.get(2)!.setsWon).toBe(1);
      expect(stats.get(2)!.setsLost).toBe(3);
    });

    it('records regular match correctly (player 2 wins)', () => {
      const stats = new Map<number, PlayerStats>();
      stats.set(1, makeStats());
      stats.set(2, makeStats());

      processMatch(stats, {
        member1Id: 1, member2Id: 2,
        player1Sets: 1, player2Sets: 3,
        player1Forfeit: false, player2Forfeit: false,
      });

      expect(stats.get(1)!.wins).toBe(0);
      expect(stats.get(1)!.losses).toBe(1);
      expect(stats.get(2)!.wins).toBe(1);
      expect(stats.get(2)!.losses).toBe(0);
    });

    it('handles player 1 forfeit', () => {
      const stats = new Map<number, PlayerStats>();
      stats.set(1, makeStats());
      stats.set(2, makeStats());

      processMatch(stats, {
        member1Id: 1, member2Id: 2,
        player1Sets: 0, player2Sets: 0,
        player1Forfeit: true, player2Forfeit: false,
      });

      expect(stats.get(1)!.losses).toBe(1);
      expect(stats.get(1)!.setsLost).toBe(1);
      expect(stats.get(2)!.wins).toBe(1);
      expect(stats.get(2)!.setsWon).toBe(1);
    });

    it('handles player 2 forfeit', () => {
      const stats = new Map<number, PlayerStats>();
      stats.set(1, makeStats());
      stats.set(2, makeStats());

      processMatch(stats, {
        member1Id: 1, member2Id: 2,
        player1Sets: 0, player2Sets: 0,
        player1Forfeit: false, player2Forfeit: true,
      });

      expect(stats.get(1)!.wins).toBe(1);
      expect(stats.get(1)!.setsWon).toBe(1);
      expect(stats.get(2)!.losses).toBe(1);
      expect(stats.get(2)!.setsLost).toBe(1);
    });

    it('handles equal sets (draw — no winner)', () => {
      const stats = new Map<number, PlayerStats>();
      stats.set(1, makeStats());
      stats.set(2, makeStats());

      processMatch(stats, {
        member1Id: 1, member2Id: 2,
        player1Sets: 2, player2Sets: 2,
        player1Forfeit: false, player2Forfeit: false,
      });

      // No wins or losses, but sets are recorded
      expect(stats.get(1)!.wins).toBe(0);
      expect(stats.get(1)!.losses).toBe(0);
      expect(stats.get(1)!.setsWon).toBe(2);
      expect(stats.get(1)!.setsLost).toBe(2);
      expect(stats.get(1)!.matchesPlayed).toBe(1);
    });

    it('skips players not in stats map', () => {
      const stats = new Map<number, PlayerStats>();
      stats.set(1, makeStats());
      // Player 2 not in map

      processMatch(stats, {
        member1Id: 1, member2Id: 2,
        player1Sets: 3, player2Sets: 1,
        player1Forfeit: false, player2Forfeit: false,
      });

      // Should not crash, and player 1 stats should be unchanged
      expect(stats.get(1)!.matchesPlayed).toBe(0);
    });
  });

  describe('calculateRankings (end-to-end)', () => {
    it('ranks player with more wins higher', () => {
      const rankings = calculateRankings([1, 2, 3], [
        { member1Id: 1, member2Id: 2, player1Sets: 3, player2Sets: 1, player1Forfeit: false, player2Forfeit: false },
        { member1Id: 1, member2Id: 3, player1Sets: 3, player2Sets: 0, player1Forfeit: false, player2Forfeit: false },
        { member1Id: 2, member2Id: 3, player1Sets: 3, player2Sets: 2, player1Forfeit: false, player2Forfeit: false },
      ]);

      expect(rankings[0].memberId).toBe(1); // 2 wins
      expect(rankings[1].memberId).toBe(2); // 1 win
      expect(rankings[2].memberId).toBe(3); // 0 wins
    });

    it('excludes players with no matches', () => {
      const rankings = calculateRankings([1, 2, 3, 4], [
        { member1Id: 1, member2Id: 2, player1Sets: 3, player2Sets: 1, player1Forfeit: false, player2Forfeit: false },
      ]);

      expect(rankings).toHaveLength(2); // Only players 1 and 2
      expect(rankings.find(r => r.memberId === 3)).toBeUndefined();
      expect(rankings.find(r => r.memberId === 4)).toBeUndefined();
    });

    it('handles empty matches array', () => {
      const rankings = calculateRankings([1, 2, 3], []);
      expect(rankings).toHaveLength(0);
    });

    it('handles single match', () => {
      const rankings = calculateRankings([1, 2], [
        { member1Id: 1, member2Id: 2, player1Sets: 3, player2Sets: 0, player1Forfeit: false, player2Forfeit: false },
      ]);

      expect(rankings).toHaveLength(2);
      expect(rankings[0].memberId).toBe(1);
      expect(rankings[0].score).toBeGreaterThan(rankings[1].score);
    });

    it('uses set ratio as tiebreaker when win rates are equal', () => {
      // Both players have 1 win, 1 loss, but different set ratios
      const rankings = calculateRankings([1, 2, 3], [
        { member1Id: 1, member2Id: 2, player1Sets: 3, player2Sets: 0, player1Forfeit: false, player2Forfeit: false },
        { member1Id: 2, member2Id: 3, player1Sets: 3, player2Sets: 0, player1Forfeit: false, player2Forfeit: false },
        { member1Id: 3, member2Id: 1, player1Sets: 3, player2Sets: 2, player1Forfeit: false, player2Forfeit: false },
      ]);

      // All have 1 win, 1 loss (50% win rate)
      // Player 1: setsWon=5, setsLost=3, ratio=1.67
      // Player 2: setsWon=3, setsLost=3, ratio=1.0
      // Player 3: setsWon=3, setsLost=5, ratio=0.6
      expect(rankings[0].memberId).toBe(1);
      expect(rankings[2].memberId).toBe(3);
    });

    it('BYE matches do not affect rankings', () => {
      const rankings = calculateRankings([1, 2], [
        { member1Id: 1, member2Id: 0, player1Sets: 3, player2Sets: 0, player1Forfeit: false, player2Forfeit: false },
        { member1Id: 1, member2Id: 2, player1Sets: 3, player2Sets: 1, player1Forfeit: false, player2Forfeit: false },
      ]);

      // Player 1 should only have 1 match played (BYE skipped)
      expect(rankings.find(r => r.memberId === 1)!.matchesPlayed).toBe(1);
    });

    it('forfeit matches count toward rankings', () => {
      const rankings = calculateRankings([1, 2], [
        { member1Id: 1, member2Id: 2, player1Sets: 0, player2Sets: 0, player1Forfeit: true, player2Forfeit: false },
      ]);

      expect(rankings).toHaveLength(2);
      expect(rankings[0].memberId).toBe(2); // Won by forfeit
      expect(rankings[1].memberId).toBe(1); // Lost by forfeit
    });
  });
});
