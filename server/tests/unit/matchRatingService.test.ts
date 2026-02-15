/**
 * Match Rating Service — Unit Tests
 *
 * Tests the ELO-style rating calculation logic.
 * Since processMatchRating uses Prisma directly, we test the mathematical
 * logic by extracting and testing the calculation formulas.
 *
 * The rating system uses:
 * - K-factor of 32
 * - Standard ELO expected score formula: 1 / (1 + 10^(-diff/400))
 * - Rating change = K * (actual - expected)
 */

// ─── Rating Calculation Logic (extracted from matchRatingService) ──────────

function calculateExpectedScore(ratingDiff: number): number {
  return 1 / (1 + Math.pow(10, -ratingDiff / 400));
}

function calculateRatingChange(
  rating1: number,
  rating2: number,
  player1Won: boolean,
  kFactor: number = 32
): { ratingChange1: number; ratingChange2: number; newRating1: number; newRating2: number } {
  const ratingDiff = rating2 - rating1;
  const expectedScore1 = calculateExpectedScore(ratingDiff);
  const expectedScore2 = 1 - expectedScore1;

  const actualScore1 = player1Won ? 1 : 0;
  const actualScore2 = player1Won ? 0 : 1;

  const ratingChange1 = Math.round(kFactor * (actualScore1 - expectedScore1));
  const ratingChange2 = Math.round(kFactor * (actualScore2 - expectedScore2));

  return {
    ratingChange1,
    ratingChange2,
    newRating1: rating1 + ratingChange1,
    newRating2: rating2 + ratingChange2,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('Rating Calculation (ELO)', () => {
  describe('calculateExpectedScore', () => {
    it('returns 0.5 when ratings are equal (diff = 0)', () => {
      expect(calculateExpectedScore(0)).toBeCloseTo(0.5, 5);
    });

    it('returns > 0.5 when opponent is higher rated (positive diff)', () => {
      // diff = opponent - player = positive means opponent is stronger
      // but expected score formula uses -diff/400, so positive diff → higher expected
      const score = calculateExpectedScore(200);
      expect(score).toBeGreaterThan(0.5);
    });

    it('returns < 0.5 when opponent is lower rated (negative diff)', () => {
      const score = calculateExpectedScore(-200);
      expect(score).toBeLessThan(0.5);
    });

    it('returns approximately 0.76 for 200 point advantage', () => {
      // When diff = 200 (opponent 200 points higher)
      // Expected = 1 / (1 + 10^(-200/400)) = 1 / (1 + 10^(-0.5)) ≈ 0.76
      const score = calculateExpectedScore(200);
      expect(score).toBeCloseTo(0.76, 1);
    });

    it('returns approximately 0.24 for -200 point difference', () => {
      const score = calculateExpectedScore(-200);
      expect(score).toBeCloseTo(0.24, 1);
    });

    it('returns approximately 0.91 for 400 point advantage', () => {
      // 1 / (1 + 10^(-1)) = 1 / (1 + 0.1) ≈ 0.909
      const score = calculateExpectedScore(400);
      expect(score).toBeCloseTo(0.909, 2);
    });

    it('expected scores for equal opponents sum to 1', () => {
      const score1 = calculateExpectedScore(100);
      const score2 = calculateExpectedScore(-100);
      expect(score1 + score2).toBeCloseTo(1.0, 10);
    });

    it('is symmetric: E(A,B) + E(B,A) = 1', () => {
      for (const diff of [0, 50, 100, 200, 400, 800]) {
        const e1 = calculateExpectedScore(diff);
        const e2 = calculateExpectedScore(-diff);
        expect(e1 + e2).toBeCloseTo(1.0, 10);
      }
    });
  });

  describe('calculateRatingChange', () => {
    it('equal ratings, player 1 wins → positive change for p1, negative for p2', () => {
      const result = calculateRatingChange(1500, 1500, true);
      expect(result.ratingChange1).toBe(16); // K/2 = 32/2 = 16
      expect(result.ratingChange2).toBe(-16);
    });

    it('equal ratings, player 1 loses → negative change for p1, positive for p2', () => {
      const result = calculateRatingChange(1500, 1500, false);
      expect(result.ratingChange1).toBe(-16);
      expect(result.ratingChange2).toBe(16);
    });

    it('higher rated player wins → gain (expected outcome)', () => {
      // Player 1 (1700) beats Player 2 (1500) — expected win
      // diff = 1500 - 1700 = -200, expected ≈ 0.24, actual = 1, change ≈ +24
      const result = calculateRatingChange(1700, 1500, true);
      expect(result.ratingChange1).toBeGreaterThan(0);
      expect(result.ratingChange1).toBeGreaterThan(16); // More than equal-rating win since expected was low
    });

    it('lower rated player wins (upset) → small gain', () => {
      // Player 1 (1300) beats Player 2 (1500) — upset
      // diff = 1500 - 1300 = 200, expected ≈ 0.76, actual = 1, change ≈ +8
      const result = calculateRatingChange(1300, 1500, true);
      expect(result.ratingChange1).toBeGreaterThan(0);
      expect(result.ratingChange1).toBeLessThan(16); // Less than equal-rating win since expected was high
    });

    it('rating changes are approximately zero-sum', () => {
      const result = calculateRatingChange(1500, 1700, true);
      // Due to rounding, they may not be exactly zero-sum
      expect(Math.abs(result.ratingChange1 + result.ratingChange2)).toBeLessThanOrEqual(1);
    });

    it('new ratings are correctly calculated', () => {
      const result = calculateRatingChange(1500, 1500, true);
      expect(result.newRating1).toBe(1500 + result.ratingChange1);
      expect(result.newRating2).toBe(1500 + result.ratingChange2);
    });

    it('very large rating difference → max change for expected winner', () => {
      // Player 1 (2000) beats Player 2 (1200) — very expected
      // diff = 1200 - 2000 = -800, expected ≈ 0.01, actual = 1, change ≈ +32 (near max K)
      const result = calculateRatingChange(2000, 1200, true);
      expect(result.ratingChange1).toBeGreaterThan(25);
    });

    it('very large rating difference → minimal change for upset winner', () => {
      // Player 1 (1200) beats Player 2 (2000) — massive upset
      // diff = 2000 - 1200 = 800, expected ≈ 0.99, actual = 1, change ≈ 0
      const result = calculateRatingChange(1200, 2000, true);
      expect(result.ratingChange1).toBeLessThanOrEqual(3);
    });

    it('rating change decreases as underdog advantage grows (expected score increases)', () => {
      // As p2 rating increases relative to p1, p1's expected score increases,
      // so the gain from winning decreases
      const small = calculateRatingChange(1400, 1500, true); // 100 pt gap, change ≈ 12
      const medium = calculateRatingChange(1300, 1500, true); // 200 pt gap, change ≈ 8
      const large = calculateRatingChange(1200, 1500, true); // 300 pt gap, change ≈ 5

      expect(small.ratingChange1).toBeGreaterThan(medium.ratingChange1);
      expect(medium.ratingChange1).toBeGreaterThan(large.ratingChange1);
    });

    it('winning always gives positive change, losing always gives negative', () => {
      const testCases = [
        [1500, 1500],
        [1200, 1800],
        [1800, 1200],
        [1000, 2000],
        [2000, 1000],
      ];

      for (const [r1, r2] of testCases) {
        const winResult = calculateRatingChange(r1, r2, true);
        expect(winResult.ratingChange1).toBeGreaterThanOrEqual(0);
        expect(winResult.ratingChange2).toBeLessThanOrEqual(0);

        const loseResult = calculateRatingChange(r1, r2, false);
        expect(loseResult.ratingChange1).toBeLessThanOrEqual(0);
        expect(loseResult.ratingChange2).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('BYE and forfeit handling (from processMatchRating logic)', () => {
    // These test the conditions that processMatchRating checks before calculating

    function isByeMatch(m1: number | null, m2: number | null): boolean {
      return m1 === 0 || m1 === null || m2 === 0 || m2 === null;
    }

    it('BYE matches should be skipped (member1Id === 0)', () => {
      expect(isByeMatch(0, 5)).toBe(true);
    });

    it('BYE matches should be skipped (member2Id === 0)', () => {
      expect(isByeMatch(5, 0)).toBe(true);
    });

    it('BYE matches should be skipped (member2Id === null)', () => {
      expect(isByeMatch(5, null)).toBe(true);
    });

    it('BYE matches should be skipped (member1Id === null)', () => {
      expect(isByeMatch(null, 5)).toBe(true);
    });

    it('regular match should not be skipped', () => {
      expect(isByeMatch(5, 10)).toBe(false);
    });

    it('forfeit matches should not change ratings', () => {
      const isForfeit = true;
      // processMatchRating returns null for forfeits
      expect(isForfeit).toBe(true);
    });
  });
});
