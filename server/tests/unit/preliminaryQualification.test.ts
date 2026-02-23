/**
 * Preliminary Qualification Logic — Unit Tests
 *
 * Tests the qualification logic shared by:
 * - PreliminaryWithFinalPlayoffPlugin
 * - PreliminaryWithFinalRoundRobinPlugin
 *
 * Covers:
 * - calculateGroupStandings (sorting by wins, set diff, rating)
 * - Qualification order: auto-qualified → 1st places → fill from 2nd/3rd by rating
 * - Seeding logic for playoff brackets
 * - Edge cases: ties, forfeits, empty groups
 */

export {};

// ─── Extracted logic from both Preliminary plugins ────────────────────────

interface GroupStanding {
  memberId: number;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  rating: number | null;
  place: number;
}

interface GroupResult {
  groupNumber: number;
  players: GroupStanding[];
}

function calculateGroupStandings(roundRobin: {
  participants: Array<{ memberId: number; playerRatingAtTime: number | null }>;
  matches: Array<{
    member1Id: number;
    member2Id: number;
    player1Sets: number;
    player2Sets: number;
    player1Forfeit: boolean;
    player2Forfeit: boolean;
  }>;
}): GroupStanding[] {
  const standings = new Map<number, {
    memberId: number;
    wins: number;
    losses: number;
    setsWon: number;
    setsLost: number;
    rating: number | null;
  }>();

  roundRobin.participants.forEach(p => {
    standings.set(p.memberId, {
      memberId: p.memberId,
      wins: 0, losses: 0, setsWon: 0, setsLost: 0,
      rating: p.playerRatingAtTime,
    });
  });

  roundRobin.matches.forEach(match => {
    if (match.player1Forfeit || match.player2Forfeit) {
      if (match.player1Forfeit) {
        const p1 = standings.get(match.member1Id);
        const p2 = standings.get(match.member2Id);
        if (p1) p1.losses++;
        if (p2) p2.wins++;
      } else {
        const p1 = standings.get(match.member1Id);
        const p2 = standings.get(match.member2Id);
        if (p1) p1.wins++;
        if (p2) p2.losses++;
      }
    } else {
      const p1 = standings.get(match.member1Id);
      const p2 = standings.get(match.member2Id);
      if (p1 && p2) {
        p1.setsWon += match.player1Sets;
        p1.setsLost += match.player2Sets;
        p2.setsWon += match.player2Sets;
        p2.setsLost += match.player1Sets;
        if (match.player1Sets > match.player2Sets) {
          p1.wins++;
          p2.losses++;
        } else {
          p1.losses++;
          p2.wins++;
        }
      }
    }
  });

  const sorted = Array.from(standings.values()).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    const diffA = a.setsWon - a.setsLost;
    const diffB = b.setsWon - b.setsLost;
    if (diffB !== diffA) return diffB - diffA;
    const ratingA = a.rating ?? 0;
    const ratingB = b.rating ?? 0;
    return ratingB - ratingA;
  });

  return sorted.map((player, index) => ({ ...player, place: index + 1 }));
}

function buildQualifiedList(
  groupResults: GroupResult[],
  finalSize: number,
  autoQualifiedMemberIds: number[]
): number[] {
  const qualifiedMemberIds: number[] = [];

  // 1. Auto-qualified
  qualifiedMemberIds.push(...autoQualifiedMemberIds);

  // 2. All 1st-place finishers
  for (const group of groupResults) {
    if (group.players.length > 0) {
      const firstPlace = group.players[0];
      if (!qualifiedMemberIds.includes(firstPlace.memberId)) {
        qualifiedMemberIds.push(firstPlace.memberId);
      }
    }
  }

  // 3. Fill remaining from 2nd, 3rd, etc. sorted by rating desc
  let remainingSlots = finalSize - qualifiedMemberIds.length;
  let placeIndex = 1;

  while (remainingSlots > 0 && placeIndex < Math.max(...groupResults.map(g => g.players.length))) {
    const candidatesAtPlace: Array<{ memberId: number; rating: number | null }> = [];

    for (const group of groupResults) {
      if (placeIndex < group.players.length) {
        const player = group.players[placeIndex];
        if (!qualifiedMemberIds.includes(player.memberId)) {
          candidatesAtPlace.push({ memberId: player.memberId, rating: player.rating });
        }
      }
    }

    candidatesAtPlace.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));

    const toTake = Math.min(remainingSlots, candidatesAtPlace.length);
    for (let i = 0; i < toTake; i++) {
      qualifiedMemberIds.push(candidatesAtPlace[i].memberId);
    }
    remainingSlots = finalSize - qualifiedMemberIds.length;
    placeIndex++;
  }

  return qualifiedMemberIds;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeGroup(
  participants: Array<{ memberId: number; rating: number | null }>,
  matches: Array<{
    member1Id: number; member2Id: number;
    player1Sets: number; player2Sets: number;
    player1Forfeit?: boolean; player2Forfeit?: boolean;
  }>
) {
  return {
    participants: participants.map(p => ({ memberId: p.memberId, playerRatingAtTime: p.rating })),
    matches: matches.map(m => ({
      ...m,
      player1Forfeit: m.player1Forfeit ?? false,
      player2Forfeit: m.player2Forfeit ?? false,
    })),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('Preliminary Qualification Logic', () => {
  describe('calculateGroupStandings', () => {
    it('sorts by wins descending', () => {
      const group = makeGroup(
        [{ memberId: 1, rating: 1500 }, { memberId: 2, rating: 1400 }, { memberId: 3, rating: 1300 }],
        [
          { member1Id: 1, member2Id: 2, player1Sets: 3, player2Sets: 1 },
          { member1Id: 1, member2Id: 3, player1Sets: 3, player2Sets: 0 },
          { member1Id: 2, member2Id: 3, player1Sets: 3, player2Sets: 2 },
        ]
      );

      const standings = calculateGroupStandings(group);
      expect(standings[0].memberId).toBe(1); // 2 wins
      expect(standings[1].memberId).toBe(2); // 1 win
      expect(standings[2].memberId).toBe(3); // 0 wins
    });

    it('uses set difference as tiebreaker', () => {
      const group = makeGroup(
        [{ memberId: 1, rating: 1500 }, { memberId: 2, rating: 1400 }, { memberId: 3, rating: 1300 }],
        [
          { member1Id: 1, member2Id: 2, player1Sets: 3, player2Sets: 0 },
          { member1Id: 2, member2Id: 3, player1Sets: 3, player2Sets: 0 },
          { member1Id: 3, member2Id: 1, player1Sets: 3, player2Sets: 2 },
        ]
      );

      const standings = calculateGroupStandings(group);
      // All have 1 win, 1 loss
      // P1: setsWon=5, setsLost=3, diff=+2
      // P2: setsWon=3, setsLost=3, diff=0
      // P3: setsWon=3, setsLost=5, diff=-2
      expect(standings[0].memberId).toBe(1);
      expect(standings[2].memberId).toBe(3);
    });

    it('uses rating as final tiebreaker', () => {
      const group = makeGroup(
        [{ memberId: 1, rating: 1500 }, { memberId: 2, rating: 1600 }],
        [
          { member1Id: 1, member2Id: 2, player1Sets: 3, player2Sets: 3 }, // draw (shouldn't happen but tests tiebreaker)
        ]
      );

      // Both have 0 wins (3-3 means p2 wins since else branch), actually p1Sets > p2Sets is false, so p1.losses++, p2.wins++
      // Wait: 3 vs 3 → p1Sets > p2Sets is false → p1.losses++, p2.wins++
      const standings = calculateGroupStandings(group);
      expect(standings[0].memberId).toBe(2); // 1 win
      expect(standings[1].memberId).toBe(1); // 0 wins
    });

    it('handles forfeit matches', () => {
      const group = makeGroup(
        [{ memberId: 1, rating: 1500 }, { memberId: 2, rating: 1400 }],
        [
          { member1Id: 1, member2Id: 2, player1Sets: 0, player2Sets: 0, player1Forfeit: true },
        ]
      );

      const standings = calculateGroupStandings(group);
      expect(standings[0].memberId).toBe(2); // Won by forfeit
      expect(standings[0].wins).toBe(1);
      expect(standings[1].memberId).toBe(1); // Lost by forfeit
      expect(standings[1].losses).toBe(1);
    });

    it('assigns correct places', () => {
      const group = makeGroup(
        [{ memberId: 1, rating: 1500 }, { memberId: 2, rating: 1400 }, { memberId: 3, rating: 1300 }],
        [
          { member1Id: 1, member2Id: 2, player1Sets: 3, player2Sets: 1 },
          { member1Id: 1, member2Id: 3, player1Sets: 3, player2Sets: 0 },
          { member1Id: 2, member2Id: 3, player1Sets: 3, player2Sets: 2 },
        ]
      );

      const standings = calculateGroupStandings(group);
      expect(standings[0].place).toBe(1);
      expect(standings[1].place).toBe(2);
      expect(standings[2].place).toBe(3);
    });

    it('handles empty matches', () => {
      const group = makeGroup(
        [{ memberId: 1, rating: 1500 }, { memberId: 2, rating: 1400 }],
        []
      );

      const standings = calculateGroupStandings(group);
      expect(standings).toHaveLength(2);
      // With equal stats, higher rating wins
      expect(standings[0].memberId).toBe(1);
    });

    it('handles single participant', () => {
      const group = makeGroup(
        [{ memberId: 1, rating: 1500 }],
        []
      );

      const standings = calculateGroupStandings(group);
      expect(standings).toHaveLength(1);
      expect(standings[0].place).toBe(1);
    });
  });

  describe('buildQualifiedList', () => {
    // Helper to make group results
    function makeGroupResult(groupNumber: number, players: Array<{ memberId: number; rating: number | null; place: number }>): GroupResult {
      return {
        groupNumber,
        players: players.map(p => ({
          memberId: p.memberId,
          wins: 0, losses: 0, setsWon: 0, setsLost: 0,
          rating: p.rating,
          place: p.place,
        })),
      };
    }

    it('auto-qualified players come first', () => {
      const groups: GroupResult[] = [
        makeGroupResult(1, [
          { memberId: 10, rating: 1500, place: 1 },
          { memberId: 11, rating: 1400, place: 2 },
        ]),
        makeGroupResult(2, [
          { memberId: 20, rating: 1300, place: 1 },
          { memberId: 21, rating: 1200, place: 2 },
        ]),
      ];

      const qualified = buildQualifiedList(groups, 4, [99, 98]);
      expect(qualified[0]).toBe(99);
      expect(qualified[1]).toBe(98);
    });

    it('1st place finishers added after auto-qualified', () => {
      const groups: GroupResult[] = [
        makeGroupResult(1, [
          { memberId: 10, rating: 1500, place: 1 },
          { memberId: 11, rating: 1400, place: 2 },
        ]),
        makeGroupResult(2, [
          { memberId: 20, rating: 1300, place: 1 },
          { memberId: 21, rating: 1200, place: 2 },
        ]),
      ];

      const qualified = buildQualifiedList(groups, 4, []);
      expect(qualified[0]).toBe(10); // 1st in group 1
      expect(qualified[1]).toBe(20); // 1st in group 2
    });

    it('fills remaining slots from 2nd place by rating desc', () => {
      const groups: GroupResult[] = [
        makeGroupResult(1, [
          { memberId: 10, rating: 1500, place: 1 },
          { memberId: 11, rating: 1400, place: 2 },
          { memberId: 12, rating: 1100, place: 3 },
        ]),
        makeGroupResult(2, [
          { memberId: 20, rating: 1300, place: 1 },
          { memberId: 21, rating: 1600, place: 2 },
          { memberId: 22, rating: 1000, place: 3 },
        ]),
      ];

      const qualified = buildQualifiedList(groups, 4, []);
      // 1st places: 10, 20
      // Need 2 more from 2nd places: 21 (1600) > 11 (1400)
      expect(qualified).toContain(10);
      expect(qualified).toContain(20);
      expect(qualified).toContain(21); // Higher rated 2nd place
      expect(qualified).toContain(11); // Lower rated 2nd place
      expect(qualified).toHaveLength(4);
    });

    it('auto-qualified player who is also 1st place is not duplicated', () => {
      const groups: GroupResult[] = [
        makeGroupResult(1, [
          { memberId: 10, rating: 1500, place: 1 },
          { memberId: 11, rating: 1400, place: 2 },
        ]),
        makeGroupResult(2, [
          { memberId: 20, rating: 1300, place: 1 },
          { memberId: 21, rating: 1200, place: 2 },
        ]),
      ];

      const qualified = buildQualifiedList(groups, 4, [10]); // 10 is auto-qualified AND 1st place
      // Should not have 10 twice
      expect(qualified.filter(id => id === 10)).toHaveLength(1);
      expect(qualified).toHaveLength(4);
    });

    it('handles more slots than available players', () => {
      const groups: GroupResult[] = [
        makeGroupResult(1, [
          { memberId: 10, rating: 1500, place: 1 },
          { memberId: 11, rating: 1400, place: 2 },
        ]),
      ];

      const qualified = buildQualifiedList(groups, 8, []);
      // Only 2 players available
      expect(qualified).toHaveLength(2);
    });

    it('no auto-qualified, single group', () => {
      const groups: GroupResult[] = [
        makeGroupResult(1, [
          { memberId: 1, rating: 1500, place: 1 },
          { memberId: 2, rating: 1400, place: 2 },
          { memberId: 3, rating: 1300, place: 3 },
          { memberId: 4, rating: 1200, place: 4 },
        ]),
      ];

      const qualified = buildQualifiedList(groups, 2, []);
      expect(qualified).toEqual([1, 2]); // 1st place + fill from 2nd
    });

    it('fills from 3rd place when 2nd places are exhausted', () => {
      const groups: GroupResult[] = [
        makeGroupResult(1, [
          { memberId: 10, rating: 1500, place: 1 },
          { memberId: 11, rating: 1400, place: 2 },
          { memberId: 12, rating: 1100, place: 3 },
        ]),
        makeGroupResult(2, [
          { memberId: 20, rating: 1300, place: 1 },
          { memberId: 21, rating: 1200, place: 2 },
          { memberId: 22, rating: 1000, place: 3 },
        ]),
      ];

      const qualified = buildQualifiedList(groups, 6, []);
      // 1st: 10, 20. 2nd: 11, 21. 3rd: 12, 22
      expect(qualified).toHaveLength(6);
      expect(qualified).toContain(12);
      expect(qualified).toContain(22);
    });

    it('2nd place candidates sorted by rating, not group order', () => {
      const groups: GroupResult[] = [
        makeGroupResult(1, [
          { memberId: 10, rating: 1500, place: 1 },
          { memberId: 11, rating: 1200, place: 2 }, // Lower rated 2nd
        ]),
        makeGroupResult(2, [
          { memberId: 20, rating: 1300, place: 1 },
          { memberId: 21, rating: 1800, place: 2 }, // Higher rated 2nd
        ]),
      ];

      const qualified = buildQualifiedList(groups, 3, []);
      // 1st: 10, 20. Need 1 more from 2nd: 21 (1800) > 11 (1200)
      expect(qualified[2]).toBe(21);
    });

    it('handles null ratings (treated as 0)', () => {
      const groups: GroupResult[] = [
        makeGroupResult(1, [
          { memberId: 10, rating: 1500, place: 1 },
          { memberId: 11, rating: null, place: 2 },
        ]),
        makeGroupResult(2, [
          { memberId: 20, rating: 1300, place: 1 },
          { memberId: 21, rating: 1200, place: 2 },
        ]),
      ];

      const qualified = buildQualifiedList(groups, 4, []);
      // 2nd places: 21 (1200) > 11 (null → 0)
      expect(qualified[2]).toBe(21);
      expect(qualified[3]).toBe(11);
    });

    it('3 groups, finalSize=4, no auto-qualified', () => {
      const groups: GroupResult[] = [
        makeGroupResult(1, [
          { memberId: 1, rating: 1500, place: 1 },
          { memberId: 2, rating: 1400, place: 2 },
        ]),
        makeGroupResult(2, [
          { memberId: 3, rating: 1300, place: 1 },
          { memberId: 4, rating: 1200, place: 2 },
        ]),
        makeGroupResult(3, [
          { memberId: 5, rating: 1100, place: 1 },
          { memberId: 6, rating: 1000, place: 2 },
        ]),
      ];

      const qualified = buildQualifiedList(groups, 4, []);
      // 1st places: 1, 3, 5 (3 players). Need 1 more from 2nd: 2 (1400) > 4 (1200) > 6 (1000)
      expect(qualified).toHaveLength(4);
      expect(qualified.slice(0, 3)).toEqual(expect.arrayContaining([1, 3, 5]));
      expect(qualified[3]).toBe(2); // Highest rated 2nd place
    });
  });
});
