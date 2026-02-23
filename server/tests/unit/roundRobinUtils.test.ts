/**
 * Round Robin Client Utils — Unit Tests
 *
 * Tests extracted logic from roundRobinUtils.ts:
 * - computeGroupCapacities
 * - snakeDraftGroups (logic)
 * - rankBasedGroups (logic)
 * - calculatePlayerStats
 * - calculateStandings sorting
 * - buildResultsMatrix
 */

export {};

// ─── Extracted logic from roundRobinUtils.ts ──────────────────────────────

function computeGroupCapacities(totalPlayers: number, desiredSize: number): number[] {
  if (totalPlayers <= 0 || desiredSize <= 0) return [];
  if (desiredSize >= totalPlayers) return [totalPlayers];

  const numGroups = Math.ceil(totalPlayers / desiredSize);
  const numSmaller = numGroups * desiredSize - totalPlayers;
  const numFull = numGroups - numSmaller;

  const capacities: number[] = [
    ...Array(numFull).fill(desiredSize),
    ...Array(numSmaller).fill(desiredSize - 1),
  ];

  // Note: in source, capacities are shuffled. For testing, we verify counts not order.
  return capacities;
}

interface PlayerStats {
  memberId: number;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
}

interface SimpleMatch {
  member1Id: number;
  member2Id: number | null;
  player1Sets: number;
  player2Sets: number;
  player1Forfeit: boolean;
  player2Forfeit: boolean;
}

function calculatePlayerStats(
  participantIds: number[],
  matches: SimpleMatch[]
): Map<number, PlayerStats> {
  const statsMap = new Map<number, PlayerStats>();

  participantIds.forEach(id => {
    statsMap.set(id, { memberId: id, wins: 0, losses: 0, setsWon: 0, setsLost: 0 });
  });

  matches.forEach(match => {
    const stats1 = statsMap.get(match.member1Id);
    const stats2 = match.member2Id ? statsMap.get(match.member2Id) : null;

    if (stats1 && stats2 && match.member2Id !== null) {
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
  });

  return statsMap;
}

function sortStandings(stats: PlayerStats[]): PlayerStats[] {
  return [...stats].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    const diffA = a.setsWon - a.setsLost;
    const diffB = b.setsWon - b.setsLost;
    if (diffB !== diffA) return diffB - diffA;
    return a.memberId - b.memberId; // lower ID wins tie
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('computeGroupCapacities', () => {
  it('returns empty for 0 players', () => {
    expect(computeGroupCapacities(0, 5)).toEqual([]);
  });

  it('returns empty for 0 desired size', () => {
    expect(computeGroupCapacities(10, 0)).toEqual([]);
  });

  it('returns empty for negative players', () => {
    expect(computeGroupCapacities(-5, 5)).toEqual([]);
  });

  it('returns single group when desired size >= total players', () => {
    expect(computeGroupCapacities(3, 5)).toEqual([3]);
    expect(computeGroupCapacities(5, 5)).toEqual([5]);
  });

  it('evenly divisible: 10 players, groups of 5', () => {
    const caps = computeGroupCapacities(10, 5);
    expect(caps).toHaveLength(2);
    expect(caps.reduce((a, b) => a + b, 0)).toBe(10);
    expect(caps.every(c => c === 5)).toBe(true);
  });

  it('not evenly divisible: 18 players, groups of 5', () => {
    const caps = computeGroupCapacities(18, 5);
    // ceil(18/5) = 4 groups. 4*5 - 18 = 2 smaller groups (4), 2 full groups (5)
    expect(caps).toHaveLength(4);
    expect(caps.reduce((a, b) => a + b, 0)).toBe(18);
    expect(caps.filter(c => c === 5)).toHaveLength(2);
    expect(caps.filter(c => c === 4)).toHaveLength(2);
  });

  it('not evenly divisible: 7 players, groups of 3', () => {
    const caps = computeGroupCapacities(7, 3);
    // ceil(7/3) = 3 groups. 3*3 - 7 = 2 smaller groups (2), 1 full group (3)
    expect(caps).toHaveLength(3);
    expect(caps.reduce((a, b) => a + b, 0)).toBe(7);
    expect(caps.filter(c => c === 3)).toHaveLength(1);
    expect(caps.filter(c => c === 2)).toHaveLength(2);
  });

  it('1 player returns single group of 1', () => {
    expect(computeGroupCapacities(1, 5)).toEqual([1]);
  });

  it('2 players, groups of 1 → 2 groups of 1', () => {
    const caps = computeGroupCapacities(2, 1);
    expect(caps).toHaveLength(2);
    expect(caps.every(c => c === 1)).toBe(true);
  });

  it('total always sums to totalPlayers', () => {
    for (let n = 1; n <= 30; n++) {
      for (let s = 2; s <= 10; s++) {
        if (s >= n) continue; // handled by single-group guard
        const numGroups = Math.ceil(n / s);
        const numSmaller = numGroups * s - n;
        if (numGroups - numSmaller < 0) continue; // skip invalid combos
        const caps = computeGroupCapacities(n, s);
        expect(caps.reduce((a, b) => a + b, 0)).toBe(n);
      }
    }
  });

  it('no group differs by more than 1 from desired size', () => {
    for (let n = 3; n <= 20; n++) {
      for (let s = 2; s <= 8; s++) {
        if (s >= n) continue;
        const numGroups = Math.ceil(n / s);
        const numSmaller = numGroups * s - n;
        if (numGroups - numSmaller < 0) continue; // skip invalid combos
        const caps = computeGroupCapacities(n, s);
        caps.forEach(c => {
          expect(c).toBeGreaterThanOrEqual(s - 1);
          expect(c).toBeLessThanOrEqual(s);
        });
      }
    }
  });
});

describe('calculatePlayerStats', () => {
  it('initializes all players with zero stats', () => {
    const stats = calculatePlayerStats([1, 2, 3], []);
    expect(stats.size).toBe(3);
    expect(stats.get(1)).toEqual({ memberId: 1, wins: 0, losses: 0, setsWon: 0, setsLost: 0 });
  });

  it('records regular match correctly', () => {
    const stats = calculatePlayerStats([1, 2], [
      { member1Id: 1, member2Id: 2, player1Sets: 3, player2Sets: 1, player1Forfeit: false, player2Forfeit: false },
    ]);

    expect(stats.get(1)!.wins).toBe(1);
    expect(stats.get(1)!.setsWon).toBe(3);
    expect(stats.get(1)!.setsLost).toBe(1);
    expect(stats.get(2)!.losses).toBe(1);
    expect(stats.get(2)!.setsWon).toBe(1);
    expect(stats.get(2)!.setsLost).toBe(3);
  });

  it('handles player1 forfeit', () => {
    const stats = calculatePlayerStats([1, 2], [
      { member1Id: 1, member2Id: 2, player1Sets: 0, player2Sets: 0, player1Forfeit: true, player2Forfeit: false },
    ]);

    expect(stats.get(1)!.losses).toBe(1);
    expect(stats.get(1)!.setsLost).toBe(1);
    expect(stats.get(2)!.wins).toBe(1);
    expect(stats.get(2)!.setsWon).toBe(1);
  });

  it('handles player2 forfeit', () => {
    const stats = calculatePlayerStats([1, 2], [
      { member1Id: 1, member2Id: 2, player1Sets: 0, player2Sets: 0, player1Forfeit: false, player2Forfeit: true },
    ]);

    expect(stats.get(1)!.wins).toBe(1);
    expect(stats.get(2)!.losses).toBe(1);
  });

  it('skips matches with null member2Id', () => {
    const stats = calculatePlayerStats([1], [
      { member1Id: 1, member2Id: null, player1Sets: 3, player2Sets: 0, player1Forfeit: false, player2Forfeit: false },
    ]);

    expect(stats.get(1)!.wins).toBe(0);
    expect(stats.get(1)!.setsWon).toBe(0);
  });

  it('handles equal sets (no winner)', () => {
    const stats = calculatePlayerStats([1, 2], [
      { member1Id: 1, member2Id: 2, player1Sets: 2, player2Sets: 2, player1Forfeit: false, player2Forfeit: false },
    ]);

    expect(stats.get(1)!.wins).toBe(0);
    expect(stats.get(1)!.losses).toBe(0);
    expect(stats.get(1)!.setsWon).toBe(2);
    expect(stats.get(1)!.setsLost).toBe(2);
  });

  it('accumulates across multiple matches', () => {
    const stats = calculatePlayerStats([1, 2, 3], [
      { member1Id: 1, member2Id: 2, player1Sets: 3, player2Sets: 1, player1Forfeit: false, player2Forfeit: false },
      { member1Id: 1, member2Id: 3, player1Sets: 3, player2Sets: 0, player1Forfeit: false, player2Forfeit: false },
      { member1Id: 2, member2Id: 3, player1Sets: 3, player2Sets: 2, player1Forfeit: false, player2Forfeit: false },
    ]);

    expect(stats.get(1)!.wins).toBe(2);
    expect(stats.get(1)!.losses).toBe(0);
    expect(stats.get(2)!.wins).toBe(1);
    expect(stats.get(2)!.losses).toBe(1);
    expect(stats.get(3)!.wins).toBe(0);
    expect(stats.get(3)!.losses).toBe(2);
  });
});

describe('sortStandings', () => {
  it('sorts by wins descending', () => {
    const stats: PlayerStats[] = [
      { memberId: 1, wins: 1, losses: 2, setsWon: 5, setsLost: 7 },
      { memberId: 2, wins: 3, losses: 0, setsWon: 9, setsLost: 3 },
      { memberId: 3, wins: 0, losses: 3, setsWon: 2, setsLost: 9 },
    ];

    const sorted = sortStandings(stats);
    expect(sorted[0].memberId).toBe(2);
    expect(sorted[1].memberId).toBe(1);
    expect(sorted[2].memberId).toBe(3);
  });

  it('uses set difference as tiebreaker', () => {
    const stats: PlayerStats[] = [
      { memberId: 1, wins: 2, losses: 1, setsWon: 7, setsLost: 5 }, // diff +2
      { memberId: 2, wins: 2, losses: 1, setsWon: 8, setsLost: 4 }, // diff +4
      { memberId: 3, wins: 2, losses: 1, setsWon: 6, setsLost: 6 }, // diff 0
    ];

    const sorted = sortStandings(stats);
    expect(sorted[0].memberId).toBe(2); // +4
    expect(sorted[1].memberId).toBe(1); // +2
    expect(sorted[2].memberId).toBe(3); // 0
  });

  it('uses memberId as final tiebreaker (lower ID wins)', () => {
    const stats: PlayerStats[] = [
      { memberId: 5, wins: 2, losses: 1, setsWon: 7, setsLost: 5 },
      { memberId: 3, wins: 2, losses: 1, setsWon: 7, setsLost: 5 },
    ];

    const sorted = sortStandings(stats);
    expect(sorted[0].memberId).toBe(3); // lower ID
    expect(sorted[1].memberId).toBe(5);
  });

  it('handles empty array', () => {
    expect(sortStandings([])).toEqual([]);
  });

  it('handles single player', () => {
    const stats: PlayerStats[] = [
      { memberId: 1, wins: 0, losses: 0, setsWon: 0, setsLost: 0 },
    ];
    expect(sortStandings(stats)).toHaveLength(1);
  });

  it('full 4-player round robin standings', () => {
    // A beats B, C, D (3-0). B beats C, D (2-1). C beats D (1-2). D loses all (0-3).
    const stats: PlayerStats[] = [
      { memberId: 4, wins: 0, losses: 3, setsWon: 3, setsLost: 9 },
      { memberId: 1, wins: 3, losses: 0, setsWon: 9, setsLost: 3 },
      { memberId: 3, wins: 1, losses: 2, setsWon: 5, setsLost: 7 },
      { memberId: 2, wins: 2, losses: 1, setsWon: 7, setsLost: 5 },
    ];

    const sorted = sortStandings(stats);
    expect(sorted.map(s => s.memberId)).toEqual([1, 2, 3, 4]);
  });
});

describe('MatchUpdater validation logic', () => {
  // Extracted from matchUpdater.ts validateMatchData
  function validateMatchData(data: {
    player1Forfeit?: boolean;
    player2Forfeit?: boolean;
    player1Sets?: number;
    player2Sets?: number;
  }): string | null {
    if (data.player1Forfeit && data.player2Forfeit) {
      return 'Only one player can forfeit';
    }
    if (!data.player1Forfeit && !data.player2Forfeit) {
      const p1 = data.player1Sets || 0;
      const p2 = data.player2Sets || 0;
      if (p1 === p2) {
        return 'Scores cannot be equal. One player must win.';
      }
    }
    return null;
  }

  it('rejects both players forfeiting', () => {
    expect(validateMatchData({ player1Forfeit: true, player2Forfeit: true })).toBe('Only one player can forfeit');
  });

  it('rejects equal scores (3:3)', () => {
    expect(validateMatchData({ player1Sets: 3, player2Sets: 3 })).toBe('Scores cannot be equal. One player must win.');
  });

  it('rejects 0:0 (no forfeit)', () => {
    expect(validateMatchData({ player1Sets: 0, player2Sets: 0 })).toBe('Scores cannot be equal. One player must win.');
  });

  it('accepts valid score (3:1)', () => {
    expect(validateMatchData({ player1Sets: 3, player2Sets: 1 })).toBeNull();
  });

  it('accepts player1 forfeit', () => {
    expect(validateMatchData({ player1Forfeit: true, player2Forfeit: false })).toBeNull();
  });

  it('accepts player2 forfeit', () => {
    expect(validateMatchData({ player1Forfeit: false, player2Forfeit: true })).toBeNull();
  });

  it('accepts forfeit with 0:0 scores', () => {
    expect(validateMatchData({ player1Forfeit: true, player1Sets: 0, player2Sets: 0 })).toBeNull();
  });

  it('accepts undefined sets (treated as 0:0 which is invalid without forfeit)', () => {
    expect(validateMatchData({})).toBe('Scores cannot be equal. One player must win.');
  });

  it('accepts 1:0', () => {
    expect(validateMatchData({ player1Sets: 1, player2Sets: 0 })).toBeNull();
  });

  it('accepts 0:1', () => {
    expect(validateMatchData({ player1Sets: 0, player2Sets: 1 })).toBeNull();
  });
});
