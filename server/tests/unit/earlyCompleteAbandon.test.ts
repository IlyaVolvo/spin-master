/**
 * Early completion / Abandon — unit tests for plugin gates, NP fill, and helpers.
 */

import { RoundRobinPlugin } from '../../src/plugins/RoundRobinPlugin';
import { SwissPlugin } from '../../src/plugins/SwissPlugin';
import { PlayoffPlugin } from '../../src/plugins/PlayoffPlugin';
import {
  matchHasCompetitiveResult,
  matchHasResult,
} from '../../src/utils/scoreCorrectionMatchUtils';

jest.mock('../../src/services/usattRatingService', () => ({
  createRatingHistoryForRoundRobinTournament: jest.fn().mockResolvedValue(undefined),
  adjustRatingsForSingleMatch: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/systemConfigService', () => ({
  getTournamentRulesConfig: () => ({
    roundRobin: {
      minPlayers: 3,
      maxPlayers: 32,
      earlyCompleteMinPercent: 70,
    },
    swiss: {
      minPlayers: 4,
      pairByRating: true,
      maxRoundsDivisor: 2,
    },
    playoff: { minPlayers: 2, seedDivisor: 1 },
  }),
  calculateSwissDefaultRounds: (n: number) => Math.max(1, Math.floor(Math.log2(n))),
}));

describe('matchHasResult / matchHasCompetitiveResult', () => {
  it('treats notPlayed as a result but not competitive', () => {
    const np = { player1Sets: 0, player2Sets: 0, notPlayed: true };
    expect(matchHasResult(np)).toBe(true);
    expect(matchHasCompetitiveResult(np)).toBe(false);
  });

  it('treats score/forfeit as competitive', () => {
    expect(matchHasCompetitiveResult({ player1Sets: 3, player2Sets: 1 })).toBe(true);
    expect(matchHasCompetitiveResult({ player1Sets: 0, player2Sets: 0, player1Forfeit: true })).toBe(true);
  });
});

describe('RoundRobinPlugin early complete', () => {
  const plugin = new RoundRobinPlugin();

  function makeTournament(competitiveCount: number, participantCount = 4) {
    const expected = (participantCount * (participantCount - 1)) / 2;
    const matches: any[] = [];
    let created = 0;
    for (let i = 1; i <= participantCount && created < competitiveCount; i++) {
      for (let j = i + 1; j <= participantCount && created < competitiveCount; j++) {
        matches.push({
          id: created + 1,
          member1Id: i,
          member2Id: j,
          player1Sets: 3,
          player2Sets: 1,
          player1Forfeit: false,
          player2Forfeit: false,
          notPlayed: false,
        });
        created++;
      }
    }
    return {
      id: 10,
      type: 'ROUND_ROBIN',
      status: 'ACTIVE',
      participants: Array.from({ length: participantCount }, (_, i) => ({
        memberId: i + 1,
        playerRatingAtTime: 1500,
      })),
      matches,
      _expected: expected,
    };
  }

  it('denies early complete below threshold', async () => {
    // 4 players → 6 matches; 70% = 4.2 → need 5; with 4 competitive (~66%) deny
    const t = makeTournament(4, 4);
    const result = await plugin.canEarlyComplete({ tournament: t, prisma: {} });
    expect(result.supported).toBe(true);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/70%/);
  });

  it('allows early complete at or above threshold', async () => {
    const t = makeTournament(5, 4); // 5/6 ≈ 83%
    const result = await plugin.canEarlyComplete({ tournament: t, prisma: {} });
    expect(result.supported).toBe(true);
    expect(result.allowed).toBe(true);
  });

  it('honors earlyCompleteMinPercent override without persisting during canEarlyComplete', async () => {
    const t = makeTournament(4, 4); // ~66%
    const denied = await plugin.canEarlyComplete({ tournament: t, prisma: {} });
    expect(denied.allowed).toBe(false);
    const allowed = await plugin.canEarlyComplete({
      tournament: t,
      prisma: {},
      overrides: { earlyCompleteMinPercent: 50 },
    });
    expect(allowed.allowed).toBe(true);
    expect(allowed.earlyCompleteMinPercent).toBe(50);
  });

  it('fills missing pairings as NP on earlyComplete', async () => {
    const t = makeTournament(5, 4);
    const created: any[] = [];
    const updated: any[] = [];
    const prisma = {
      match: {
        create: jest.fn(async ({ data }: any) => {
          created.push(data);
          return { id: 100 + created.length, ...data };
        }),
        update: jest.fn(async ({ where, data }: any) => {
          updated.push({ where, data });
          return { id: where.id, ...data };
        }),
      },
      tournament: {
        findUnique: jest.fn(async () => ({
          ...t,
          matches: [
            ...t.matches,
            ...created.map((c, i) => ({ id: 100 + i + 1, ...c })),
          ],
        })),
      },
    };

    const result = await plugin.earlyComplete({ tournament: t, prisma });
    expect(result.shouldMarkComplete).toBe(true);
    // One missing pairing among 6 expected with 5 played
    expect(created.length).toBe(1);
    expect(created[0].notPlayed).toBe(true);
    expect(created[0].player1Sets).toBe(0);
    expect(created[0].player2Sets).toBe(0);
  });

  it('counts NP toward matchesRemaining as filled', () => {
    const t = makeTournament(5, 4);
    t.matches.push({
      id: 99,
      member1Id: 3,
      member2Id: 4,
      player1Sets: 0,
      player2Sets: 0,
      notPlayed: true,
    });
    expect(plugin.matchesRemaining(t)).toBe(0);
    expect(plugin.isComplete(t)).toBe(true);
  });
});

describe('SwissPlugin early complete', () => {
  const plugin = new SwissPlugin();

  it('allows when a round has started', async () => {
    const tournament = {
      id: 1,
      status: 'ACTIVE',
      swissData: { currentRound: 1, numberOfRounds: 3, isCompleted: false },
      participants: [{ memberId: 1 }, { memberId: 2 }, { memberId: 3 }, { memberId: 4 }],
      matches: [
        { id: 1, round: 1, member1Id: 1, member2Id: 2, player1Sets: 3, player2Sets: 1 },
        { id: 2, round: 1, member1Id: 3, member2Id: 4, player1Sets: 0, player2Sets: 0 },
      ],
    };
    const result = await plugin.canEarlyComplete({ tournament, prisma: {} });
    expect(result.allowed).toBe(true);
  });

  it('denies when no rounds started', async () => {
    const tournament = {
      id: 1,
      status: 'ACTIVE',
      swissData: { currentRound: 0, numberOfRounds: 3, isCompleted: false },
      participants: [],
      matches: [],
    };
    const result = await plugin.canEarlyComplete({ tournament, prisma: {} });
    expect(result.allowed).toBe(false);
  });

  it('marks unplayed current-round matches NP and sets isCompleted', async () => {
    const tournament = {
      id: 5,
      status: 'ACTIVE',
      swissData: { currentRound: 1, numberOfRounds: 3, isCompleted: false },
      participants: [{ memberId: 1 }, { memberId: 2 }, { memberId: 3 }, { memberId: 4 }],
      matches: [
        { id: 1, round: 1, member1Id: 1, member2Id: 2, player1Sets: 3, player2Sets: 1, notPlayed: false },
        { id: 2, round: 1, member1Id: 3, member2Id: 4, player1Sets: 0, player2Sets: 0, notPlayed: false },
      ],
    };
    const prisma = {
      match: {
        update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
      },
      swissTournamentData: {
        update: jest.fn(async () => ({})),
      },
      tournament: {
        findUnique: jest.fn(async () => ({
          ...tournament,
          swissData: { ...tournament.swissData, isCompleted: true },
        })),
      },
    };

    const result = await plugin.earlyComplete({ tournament, prisma });
    expect(result.shouldMarkComplete).toBe(true);
    expect(prisma.match.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: expect.objectContaining({ notPlayed: true, player1Sets: 0, player2Sets: 0 }),
    });
    expect(prisma.swissTournamentData.update).toHaveBeenCalledWith({
      where: { tournamentId: 5 },
      data: { isCompleted: true },
    });
  });
});

describe('PlayoffPlugin early complete', () => {
  const plugin = new PlayoffPlugin();

  it('always denies', async () => {
    const result = await plugin.canEarlyComplete({ tournament: { status: 'ACTIVE' }, prisma: {} });
    expect(result.supported).toBe(false);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Playoffs cannot be early-completed/);
  });
});

describe('qualification shrink helpers (abandoned groups)', () => {
  it('computes effective final size from non-cancelled groups', () => {
    const preliminaryGroups = [
      { cancelled: true, participants: [{ memberId: 1 }, { memberId: 2 }] },
      { cancelled: false, participants: [{ memberId: 3 }, { memberId: 4 }] },
      { cancelled: false, participants: [{ memberId: 5 }, { memberId: 6 }] },
    ];
    const autoQualifiedMemberIds: number[] = [];
    const activeGroups = preliminaryGroups.filter((c) => !c.cancelled);
    const maxEligible =
      autoQualifiedMemberIds.length +
      activeGroups.reduce((sum, g) => sum + g.participants.length, 0);
    const configuredFinalSize = 4;
    const effective = Math.min(configuredFinalSize, maxEligible);
    expect(effective).toBe(4);
    expect(activeGroups.every((g) => !g.cancelled)).toBe(true);
  });

  it('marks all-abandoned with no auto-qualified as zero eligible', () => {
    const preliminaryGroups = [
      { cancelled: true, participants: [{ memberId: 1 }] },
      { cancelled: true, participants: [{ memberId: 2 }] },
    ];
    const autoQualifiedMemberIds: number[] = [];
    const activeGroups = preliminaryGroups.filter((c) => !c.cancelled);
    const maxEligible =
      autoQualifiedMemberIds.length +
      activeGroups.reduce((sum, g) => sum + g.participants.length, 0);
    expect(maxEligible).toBe(0);
  });
});
