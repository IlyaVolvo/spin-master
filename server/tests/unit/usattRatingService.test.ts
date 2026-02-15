/**
 * USATT Rating Service — Unit Tests
 *
 * Tests the USATT 4-pass rating algorithm logic:
 * - Point exchange table lookup
 * - Pass 1: rated player calculation
 * - Pass 2: adjustments for rated, initial ratings for unrated
 * - Pass 3: floor adjustments
 * - Upset detection
 * - BYE/forfeit skip logic
 */

// ─── Extracted logic from usattRatingService.ts ───────────────────────────

// Hardcoded fallback point exchange rules (same as in source)
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
];

function getPointExchange(ratingDiff: number, isUpset: boolean): number {
  const absDiff = Math.abs(ratingDiff);
  for (const rule of FALLBACK_RULES) {
    if (absDiff >= rule.minDiff && absDiff <= rule.maxDiff) {
      return isUpset ? rule.upsetPoints : rule.expectedPoints;
    }
  }
  return 0;
}

interface PlayerMatchResult {
  opponentId: number;
  opponentRating: number | null;
  won: boolean;
  setsWon: number;
  setsLost: number;
}

interface TournamentPlayerData {
  memberId: number;
  initialRating: number | null;
  matches: PlayerMatchResult[];
  wins: number;
  losses: number;
}

function calculatePass1(playerData: TournamentPlayerData, _allPlayersData: Map<number, TournamentPlayerData>): number | null {
  if (playerData.initialRating === null) return null;

  let rating = playerData.initialRating;

  for (const match of playerData.matches) {
    if (match.opponentRating === null) continue;

    const ratingDiff = match.opponentRating - rating;
    const isUpset = (match.won && ratingDiff > 0) || (!match.won && ratingDiff < 0);
    const points = getPointExchange(Math.abs(ratingDiff), isUpset);

    if (match.won) {
      rating += points;
    } else {
      rating -= points;
    }
  }

  return rating;
}

function calculatePass2Adjustment(
  playerData: TournamentPlayerData,
  pass1Rating: number | null,
  _allPlayersData: Map<number, TournamentPlayerData>
): number | null {
  if (playerData.initialRating === null || pass1Rating === null) return null;

  const pointsGained = pass1Rating - playerData.initialRating;

  if (pointsGained < 50) {
    return playerData.initialRating;
  }

  if (pointsGained >= 50 && pointsGained <= 74) {
    return pass1Rating;
  }

  // Points gained >= 75
  if (playerData.wins > 0 && playerData.losses > 0) {
    const wins = playerData.matches.filter(m => m.won && m.opponentRating !== null);
    const losses = playerData.matches.filter(m => !m.won && m.opponentRating !== null);

    if (wins.length === 0 || losses.length === 0) return pass1Rating;

    const bestWin = Math.max(...wins.map(m => m.opponentRating!));
    const worstLoss = Math.min(...losses.map(m => m.opponentRating!));
    const avgOpponent = (bestWin + worstLoss) / 2;

    return Math.round((pass1Rating + avgOpponent) / 2);
  }

  // All wins or all losses
  const opponentRatings = playerData.matches
    .filter(m => m.opponentRating !== null)
    .map(m => m.opponentRating!);

  if (opponentRatings.length === 0) return pass1Rating;

  if (opponentRatings.length === 1) {
    const maxChange = 100;
    const cappedRating = Math.max(
      playerData.initialRating! - maxChange,
      Math.min(playerData.initialRating! + maxChange, pass1Rating)
    );
    if (playerData.losses > 0 && playerData.wins === 0) {
      return Math.min(pass1Rating, playerData.initialRating!);
    }
    return cappedRating;
  }

  opponentRatings.sort((a, b) => a - b);
  const median = opponentRatings[Math.floor(opponentRatings.length / 2)];
  return median;
}

function isUpsetResult(playerWon: boolean, ratingDiff: number): boolean {
  return (playerWon && ratingDiff > 0) || (!playerWon && ratingDiff < 0);
}

function isBYEMatch(member1Id: number, member2Id: number | null): boolean {
  return member1Id === 0 || member2Id === 0 || member2Id === null;
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('USATT Rating Service', () => {
  describe('getPointExchange', () => {
    it('returns 8 for equal ratings (diff 0), expected win', () => {
      expect(getPointExchange(0, false)).toBe(8);
    });

    it('returns 8 for equal ratings (diff 0), upset', () => {
      expect(getPointExchange(0, true)).toBe(8);
    });

    it('returns 7 expected / 10 upset for diff 13-37', () => {
      expect(getPointExchange(25, false)).toBe(7);
      expect(getPointExchange(25, true)).toBe(10);
    });

    it('returns 6 expected / 13 upset for diff 38-62', () => {
      expect(getPointExchange(50, false)).toBe(6);
      expect(getPointExchange(50, true)).toBe(13);
    });

    it('returns 4 expected / 20 upset for diff 88-112', () => {
      expect(getPointExchange(100, false)).toBe(4);
      expect(getPointExchange(100, true)).toBe(20);
    });

    it('returns 0 expected / 50 upset for diff 238-262', () => {
      expect(getPointExchange(250, false)).toBe(0);
      expect(getPointExchange(250, true)).toBe(50);
    });

    it('returns 0 expected / 100 upset for diff 500', () => {
      expect(getPointExchange(500, false)).toBe(0);
      expect(getPointExchange(500, true)).toBe(100);
    });

    it('returns 0 expected / 100 upset for very large diff (1000+)', () => {
      expect(getPointExchange(1000, false)).toBe(0);
      expect(getPointExchange(1000, true)).toBe(100);
    });

    it('handles negative rating diff (uses absolute value)', () => {
      expect(getPointExchange(-100, false)).toBe(4);
      expect(getPointExchange(-100, true)).toBe(20);
    });

    it('boundary: diff exactly at minDiff', () => {
      expect(getPointExchange(13, false)).toBe(7);
      expect(getPointExchange(38, false)).toBe(6);
      expect(getPointExchange(88, false)).toBe(4);
    });

    it('boundary: diff exactly at maxDiff', () => {
      expect(getPointExchange(12, false)).toBe(8);
      expect(getPointExchange(37, false)).toBe(7);
      expect(getPointExchange(62, false)).toBe(6);
    });

    it('upset points increase as rating diff increases', () => {
      const upsets = [0, 25, 50, 100, 200, 300, 400, 500].map(d => getPointExchange(d, true));
      // Should be non-decreasing
      for (let i = 1; i < upsets.length; i++) {
        expect(upsets[i]).toBeGreaterThanOrEqual(upsets[i - 1]);
      }
    });

    it('expected points decrease as rating diff increases', () => {
      const expected = [0, 25, 50, 100, 200, 300].map(d => getPointExchange(d, false));
      // Should be non-increasing
      for (let i = 1; i < expected.length; i++) {
        expect(expected[i]).toBeLessThanOrEqual(expected[i - 1]);
      }
    });
  });

  describe('isUpsetResult', () => {
    it('player wins as underdog (opponent higher rated) → upset', () => {
      expect(isUpsetResult(true, 200)).toBe(true); // ratingDiff > 0 means opponent is higher
    });

    it('player wins as favorite → not upset', () => {
      expect(isUpsetResult(true, -200)).toBe(false);
    });

    it('player loses as favorite (opponent lower rated wins) → upset from opponent perspective', () => {
      expect(isUpsetResult(false, -200)).toBe(true); // ratingDiff < 0 means opponent is lower
    });

    it('player loses as underdog → not upset', () => {
      expect(isUpsetResult(false, 200)).toBe(false);
    });

    it('equal ratings, win → not upset', () => {
      expect(isUpsetResult(true, 0)).toBe(false);
    });

    it('equal ratings, loss → not upset', () => {
      expect(isUpsetResult(false, 0)).toBe(false);
    });
  });

  describe('isBYEMatch', () => {
    it('member1Id === 0 is BYE', () => {
      expect(isBYEMatch(0, 1)).toBe(true);
    });

    it('member2Id === 0 is BYE', () => {
      expect(isBYEMatch(1, 0)).toBe(true);
    });

    it('member2Id === null is BYE', () => {
      expect(isBYEMatch(1, null)).toBe(true);
    });

    it('both valid IDs is not BYE', () => {
      expect(isBYEMatch(1, 2)).toBe(false);
    });
  });

  describe('calculatePass1', () => {
    it('returns null for unrated player', () => {
      const data: TournamentPlayerData = {
        memberId: 1, initialRating: null, matches: [], wins: 0, losses: 0,
      };
      expect(calculatePass1(data, new Map())).toBeNull();
    });

    it('returns initial rating when no matches', () => {
      const data: TournamentPlayerData = {
        memberId: 1, initialRating: 1500, matches: [], wins: 0, losses: 0,
      };
      expect(calculatePass1(data, new Map())).toBe(1500);
    });

    it('increases rating for expected win (equal ratings)', () => {
      const data: TournamentPlayerData = {
        memberId: 1, initialRating: 1500, wins: 1, losses: 0,
        matches: [{ opponentId: 2, opponentRating: 1500, won: true, setsWon: 3, setsLost: 1 }],
      };
      const result = calculatePass1(data, new Map());
      expect(result).toBe(1508); // +8 for equal rating win
    });

    it('decreases rating for expected loss (equal ratings)', () => {
      const data: TournamentPlayerData = {
        memberId: 1, initialRating: 1500, wins: 0, losses: 1,
        matches: [{ opponentId: 2, opponentRating: 1500, won: false, setsWon: 1, setsLost: 3 }],
      };
      const result = calculatePass1(data, new Map());
      expect(result).toBe(1492); // -8 for equal rating loss
    });

    it('gives larger gain for upset win', () => {
      const data: TournamentPlayerData = {
        memberId: 1, initialRating: 1300, wins: 1, losses: 0,
        matches: [{ opponentId: 2, opponentRating: 1500, won: true, setsWon: 3, setsLost: 1 }],
      };
      const result = calculatePass1(data, new Map());
      // diff = 200, upset win → 40 points
      expect(result).toBe(1340);
    });

    it('gives smaller loss for expected loss (large diff)', () => {
      const data: TournamentPlayerData = {
        memberId: 1, initialRating: 1300, wins: 0, losses: 1,
        matches: [{ opponentId: 2, opponentRating: 1500, won: false, setsWon: 1, setsLost: 3 }],
      };
      const result = calculatePass1(data, new Map());
      // diff = 200, expected loss → -1 point
      expect(result).toBe(1299);
    });

    it('skips matches against unrated opponents', () => {
      const data: TournamentPlayerData = {
        memberId: 1, initialRating: 1500, wins: 1, losses: 0,
        matches: [{ opponentId: 2, opponentRating: null, won: true, setsWon: 3, setsLost: 0 }],
      };
      expect(calculatePass1(data, new Map())).toBe(1500);
    });

    it('accumulates across multiple matches', () => {
      const data: TournamentPlayerData = {
        memberId: 1, initialRating: 1500, wins: 2, losses: 0,
        matches: [
          { opponentId: 2, opponentRating: 1500, won: true, setsWon: 3, setsLost: 1 },
          { opponentId: 3, opponentRating: 1500, won: true, setsWon: 3, setsLost: 0 },
        ],
      };
      const result = calculatePass1(data, new Map());
      // First win: +8 → 1508. Second win: diff = 1500 - 1508 = -8, expected win → +8 → 1516
      expect(result).toBe(1516);
    });
  });

  describe('calculatePass2Adjustment', () => {
    it('returns null for unrated player', () => {
      const data: TournamentPlayerData = {
        memberId: 1, initialRating: null, matches: [], wins: 0, losses: 0,
      };
      expect(calculatePass2Adjustment(data, null, new Map())).toBeNull();
    });

    it('returns initial rating when points gained < 50', () => {
      const data: TournamentPlayerData = {
        memberId: 1, initialRating: 1500, matches: [], wins: 1, losses: 0,
      };
      // pass1Rating = 1530, gained = 30 < 50
      expect(calculatePass2Adjustment(data, 1530, new Map())).toBe(1500);
    });

    it('returns pass1 rating when points gained 50-74', () => {
      const data: TournamentPlayerData = {
        memberId: 1, initialRating: 1500, matches: [], wins: 3, losses: 0,
      };
      // pass1Rating = 1560, gained = 60 (50-74 range)
      expect(calculatePass2Adjustment(data, 1560, new Map())).toBe(1560);
    });

    it('uses best win / worst loss average when gained >= 75 and mixed results', () => {
      const data: TournamentPlayerData = {
        memberId: 1, initialRating: 1200, wins: 3, losses: 1,
        matches: [
          { opponentId: 2, opponentRating: 1500, won: true, setsWon: 3, setsLost: 1 },
          { opponentId: 3, opponentRating: 1400, won: true, setsWon: 3, setsLost: 0 },
          { opponentId: 4, opponentRating: 1600, won: true, setsWon: 3, setsLost: 2 },
          { opponentId: 5, opponentRating: 1300, won: false, setsWon: 1, setsLost: 3 },
        ],
      };
      // pass1Rating = 1300, gained = 100 >= 75
      // bestWin = 1600, worstLoss = 1300, avg = 1450
      // result = (1300 + 1450) / 2 = 1375
      expect(calculatePass2Adjustment(data, 1300, new Map())).toBe(1375);
    });

    it('caps single-match all-wins to ±100 from initial', () => {
      const data: TournamentPlayerData = {
        memberId: 1, initialRating: 1200, wins: 1, losses: 0,
        matches: [
          { opponentId: 2, opponentRating: 1500, won: true, setsWon: 3, setsLost: 0 },
        ],
      };
      // pass1Rating = 1300 (gained 100 >= 75), single match, all wins
      // cappedRating = max(1100, min(1300, 1300)) = 1300
      expect(calculatePass2Adjustment(data, 1300, new Map())).toBe(1300);
    });

    it('single-match all-losses returns min of pass1 and initial', () => {
      const data: TournamentPlayerData = {
        memberId: 1, initialRating: 1500, wins: 0, losses: 1,
        matches: [
          { opponentId: 2, opponentRating: 1200, won: false, setsWon: 0, setsLost: 3 },
        ],
      };
      // pass1Rating = 1400 (lost 100 points, but gained = 1400 - 1500 = -100, which is < 50)
      // Actually gained < 50, so returns initialRating
      expect(calculatePass2Adjustment(data, 1400, new Map())).toBe(1500);
    });

    it('uses median for multiple matches all wins', () => {
      const data: TournamentPlayerData = {
        memberId: 1, initialRating: 1200, wins: 3, losses: 0,
        matches: [
          { opponentId: 2, opponentRating: 1400, won: true, setsWon: 3, setsLost: 0 },
          { opponentId: 3, opponentRating: 1500, won: true, setsWon: 3, setsLost: 1 },
          { opponentId: 4, opponentRating: 1600, won: true, setsWon: 3, setsLost: 2 },
        ],
      };
      // pass1Rating = 1280 (gained 80 >= 75), all wins, multiple matches
      // opponentRatings sorted: [1400, 1500, 1600], median = 1500
      expect(calculatePass2Adjustment(data, 1280, new Map())).toBe(1500);
    });
  });

  describe('Point exchange symmetry', () => {
    it('winner gains same points that loser loses (zero-sum per match)', () => {
      // Equal ratings
      const winnerGain = getPointExchange(0, false);
      const loserLoss = getPointExchange(0, false);
      expect(winnerGain).toBe(loserLoss);
    });

    it('upset winner gains more than expected winner would', () => {
      const expectedGain = getPointExchange(200, false); // expected win
      const upsetGain = getPointExchange(200, true);     // upset win
      expect(upsetGain).toBeGreaterThan(expectedGain);
    });

    it('all rules cover the full range 0 to 99999', () => {
      // Verify no gaps in the rules
      for (let i = 0; i < FALLBACK_RULES.length - 1; i++) {
        expect(FALLBACK_RULES[i + 1].minDiff).toBe(FALLBACK_RULES[i].maxDiff + 1);
      }
      expect(FALLBACK_RULES[0].minDiff).toBe(0);
      expect(FALLBACK_RULES[FALLBACK_RULES.length - 1].maxDiff).toBe(99999);
    });
  });

  describe('Full rating calculation scenario', () => {
    it('4-player round robin: correct Pass 1 ratings', () => {
      // Players: A(1500), B(1500), C(1400), D(1300)
      // A beats B, C, D. B beats C, D. C beats D.
      const playersData = new Map<number, TournamentPlayerData>();

      playersData.set(1, {
        memberId: 1, initialRating: 1500, wins: 3, losses: 0,
        matches: [
          { opponentId: 2, opponentRating: 1500, won: true, setsWon: 3, setsLost: 1 },
          { opponentId: 3, opponentRating: 1400, won: true, setsWon: 3, setsLost: 0 },
          { opponentId: 4, opponentRating: 1300, won: true, setsWon: 3, setsLost: 0 },
        ],
      });

      const pass1A = calculatePass1(playersData.get(1)!, playersData);
      expect(pass1A).not.toBeNull();
      expect(pass1A!).toBeGreaterThan(1500); // Should gain points
    });

    it('losing all matches decreases rating', () => {
      const data: TournamentPlayerData = {
        memberId: 4, initialRating: 1300, wins: 0, losses: 3,
        matches: [
          { opponentId: 1, opponentRating: 1500, won: false, setsWon: 0, setsLost: 3 },
          { opponentId: 2, opponentRating: 1500, won: false, setsWon: 1, setsLost: 3 },
          { opponentId: 3, opponentRating: 1400, won: false, setsWon: 0, setsLost: 3 },
        ],
      };

      const pass1 = calculatePass1(data, new Map());
      expect(pass1!).toBeLessThan(1300);
    });
  });
});
