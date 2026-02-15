/**
 * BaseCompoundTournamentPlugin — Unit Tests
 *
 * Tests the base class for compound tournament plugins:
 * - isComplete, canCancel
 * - matchesRemaining (delegation to child plugins)
 * - updateMatch (should throw)
 * - enrichActiveTournament, enrichCompletedTournament
 * - onChildTournamentCompleted
 * - getSchedule, getPrintableView
 */

// Mock the TournamentPluginRegistry
jest.mock('../../src/plugins/TournamentPluginRegistry', () => {
  const mockPlugins = new Map<string, any>();
  return {
    tournamentPluginRegistry: {
      get: jest.fn((type: string) => {
        const plugin = mockPlugins.get(type);
        if (!plugin) throw new Error(`No plugin for type: ${type}`);
        return plugin;
      }),
      _mockPlugins: mockPlugins,
    },
  };
});

import { BaseCompoundTournamentPlugin } from '../../src/plugins/BaseCompoundTournamentPlugin';
import { tournamentPluginRegistry } from '../../src/plugins/TournamentPluginRegistry';

// Concrete subclass for testing (since BaseCompoundTournamentPlugin is abstract)
class TestCompoundPlugin extends BaseCompoundTournamentPlugin {
  type = 'TEST_COMPOUND';
  private _hasFinal: boolean;

  constructor(hasFinal: boolean = false) {
    super();
    this._hasFinal = hasFinal;
  }

  async createTournament(): Promise<any> {
    return { id: 1, type: 'TEST_COMPOUND' };
  }

  protected hasFinalPhase(): boolean {
    return this._hasFinal;
  }

  protected async handleFinalPhaseLogic(
    parentTournament: any,
    allChildren: any[],
    prisma: any
  ): Promise<any> {
    const finalChild = allChildren.find((c: any) => c.isFinal);
    if (finalChild && finalChild.status === 'COMPLETED') {
      return { shouldMarkComplete: true };
    }
    if (!finalChild && allChildren.every((c: any) => c.status === 'COMPLETED')) {
      return { message: 'Final phase created' };
    }
    return {};
  }
}

// ─── isComplete ───────────────────────────────────────────────────────────

describe('BaseCompoundTournamentPlugin.isComplete', () => {
  const plugin = new TestCompoundPlugin();

  it('returns false when no child tournaments', () => {
    expect(plugin.isComplete({ childTournaments: [] })).toBe(false);
  });

  it('returns false when childTournaments is undefined', () => {
    expect(plugin.isComplete({})).toBe(false);
  });

  it('returns false when childTournaments is null', () => {
    expect(plugin.isComplete({ childTournaments: null })).toBe(false);
  });

  it('returns false when some children are not completed', () => {
    const tournament = {
      childTournaments: [
        { status: 'COMPLETED' },
        { status: 'ACTIVE' },
        { status: 'COMPLETED' },
      ],
    };
    expect(plugin.isComplete(tournament)).toBe(false);
  });

  it('returns true when all children are completed', () => {
    const tournament = {
      childTournaments: [
        { status: 'COMPLETED' },
        { status: 'COMPLETED' },
        { status: 'COMPLETED' },
      ],
    };
    expect(plugin.isComplete(tournament)).toBe(true);
  });

  it('returns true with single completed child', () => {
    const tournament = {
      childTournaments: [{ status: 'COMPLETED' }],
    };
    expect(plugin.isComplete(tournament)).toBe(true);
  });
});

// ─── canCancel ────────────────────────────────────────────────────────────

describe('BaseCompoundTournamentPlugin.canCancel', () => {
  const plugin = new TestCompoundPlugin();

  it('always returns true', () => {
    expect(plugin.canCancel({})).toBe(true);
    expect(plugin.canCancel({ childTournaments: [] })).toBe(true);
    expect(plugin.canCancel({ childTournaments: [{ status: 'ACTIVE' }] })).toBe(true);
  });
});

// ─── matchesRemaining ─────────────────────────────────────────────────────

describe('BaseCompoundTournamentPlugin.matchesRemaining', () => {
  const plugin = new TestCompoundPlugin();
  const mockPlugins = (tournamentPluginRegistry as any)._mockPlugins;

  beforeEach(() => {
    mockPlugins.clear();
  });

  it('returns 0 when no child tournaments', () => {
    expect(plugin.matchesRemaining({ childTournaments: [] })).toBe(0);
  });

  it('returns 0 when childTournaments is undefined', () => {
    expect(plugin.matchesRemaining({})).toBe(0);
  });

  it('skips completed children', () => {
    mockPlugins.set('ROUND_ROBIN', { matchesRemaining: () => 5 });

    const tournament = {
      childTournaments: [
        { type: 'ROUND_ROBIN', status: 'COMPLETED' },
        { type: 'ROUND_ROBIN', status: 'COMPLETED' },
      ],
    };
    expect(plugin.matchesRemaining(tournament)).toBe(0);
  });

  it('sums remaining matches from active children', () => {
    mockPlugins.set('ROUND_ROBIN', { matchesRemaining: (t: any) => t._remaining });

    const tournament = {
      childTournaments: [
        { type: 'ROUND_ROBIN', status: 'ACTIVE', _remaining: 3 },
        { type: 'ROUND_ROBIN', status: 'ACTIVE', _remaining: 5 },
        { type: 'ROUND_ROBIN', status: 'COMPLETED', _remaining: 0 },
      ],
    };
    expect(plugin.matchesRemaining(tournament)).toBe(8);
  });
});

// ─── updateMatch ──────────────────────────────────────────────────────────

describe('BaseCompoundTournamentPlugin.updateMatch', () => {
  const plugin = new TestCompoundPlugin();

  it('throws error — compound tournaments do not handle matches directly', async () => {
    await expect(
      plugin.updateMatch({
        matchId: 1,
        tournamentId: 1,
        player1Sets: 3,
        player2Sets: 1,
        player1Forfeit: false,
        player2Forfeit: false,
        prisma: {},
      })
    ).rejects.toThrow('Compound tournaments do not handle matches directly');
  });
});

// ─── onMatchCompleted ─────────────────────────────────────────────────────

describe('BaseCompoundTournamentPlugin.onMatchCompleted', () => {
  const plugin = new TestCompoundPlugin();

  it('returns empty object (compound tournaments do not handle match completion)', async () => {
    const result = await plugin.onMatchCompleted({
      tournament: {},
      match: {},
      winnerId: 1,
      prisma: {},
    });
    expect(result).toEqual({});
  });
});

// ─── onChildTournamentCompleted (no final phase) ──────────────────────────

describe('BaseCompoundTournamentPlugin.onChildTournamentCompleted (no final phase)', () => {
  const plugin = new TestCompoundPlugin(false); // no final phase

  it('returns shouldMarkComplete when all children are complete', async () => {
    const mockPrisma = {
      tournament: {
        findMany: jest.fn().mockResolvedValue([
          { id: 2, status: 'COMPLETED' },
          { id: 3, status: 'COMPLETED' },
        ]),
      },
    };

    const result = await plugin.onChildTournamentCompleted({
      parentTournament: { id: 1 },
      childTournament: { id: 2 },
      prisma: mockPrisma,
    });

    expect(result).toEqual({ shouldMarkComplete: true });
  });

  it('returns empty when not all children are complete', async () => {
    const mockPrisma = {
      tournament: {
        findMany: jest.fn().mockResolvedValue([
          { id: 2, status: 'COMPLETED' },
          { id: 3, status: 'ACTIVE' },
        ]),
      },
    };

    const result = await plugin.onChildTournamentCompleted({
      parentTournament: { id: 1 },
      childTournament: { id: 2 },
      prisma: mockPrisma,
    });

    expect(result).toEqual({});
  });
});

// ─── onChildTournamentCompleted (with final phase) ────────────────────────

describe('BaseCompoundTournamentPlugin.onChildTournamentCompleted (with final phase)', () => {
  const plugin = new TestCompoundPlugin(true); // has final phase

  it('delegates to handleFinalPhaseLogic', async () => {
    const mockPrisma = {
      tournament: {
        findMany: jest.fn().mockResolvedValue([
          { id: 2, status: 'COMPLETED', isFinal: false },
          { id: 3, status: 'COMPLETED', isFinal: true },
        ]),
      },
    };

    const result = await plugin.onChildTournamentCompleted({
      parentTournament: { id: 1 },
      childTournament: { id: 3 },
      prisma: mockPrisma,
    });

    expect(result).toEqual({ shouldMarkComplete: true });
  });

  it('returns message when final phase needs to be created', async () => {
    const mockPrisma = {
      tournament: {
        findMany: jest.fn().mockResolvedValue([
          { id: 2, status: 'COMPLETED', isFinal: false },
          { id: 3, status: 'COMPLETED', isFinal: false },
        ]),
      },
    };

    const result = await plugin.onChildTournamentCompleted({
      parentTournament: { id: 1 },
      childTournament: { id: 2 },
      prisma: mockPrisma,
    });

    expect(result).toEqual({ message: 'Final phase created' });
  });
});

// ─── enrichActiveTournament ───────────────────────────────────────────────

describe('BaseCompoundTournamentPlugin.enrichActiveTournament', () => {
  const plugin = new TestCompoundPlugin();
  const mockPlugins = (tournamentPluginRegistry as any)._mockPlugins;

  beforeEach(() => {
    mockPlugins.clear();
  });

  it('fetches children from DB when not already loaded', async () => {
    const mockChildren = [
      { id: 2, type: 'ROUND_ROBIN', participants: [], matches: [] },
    ];
    const mockPrisma = {
      tournament: {
        findMany: jest.fn().mockResolvedValue(mockChildren),
      },
    };

    mockPlugins.set('ROUND_ROBIN', {
      enrichActiveTournament: jest.fn().mockResolvedValue({
        id: 2,
        type: 'ROUND_ROBIN',
        status: 'ACTIVE',
        participants: [],
        matches: [],
        enriched: true,
      }),
    });

    const tournament = {
      id: 1,
      type: 'TEST_COMPOUND',
      status: 'ACTIVE',
      participants: [],
      matches: [],
      // childTournaments NOT loaded
    };

    const result = await plugin.enrichActiveTournament({ tournament, prisma: mockPrisma });

    expect(mockPrisma.tournament.findMany).toHaveBeenCalledWith({
      where: { parentTournamentId: 1 },
      include: expect.any(Object),
    });
    expect(result.childTournaments).toHaveLength(1);
    expect(result.bracketMatches).toEqual([]);
  });

  it('uses already loaded children', async () => {
    const mockPrisma = {
      tournament: { findMany: jest.fn() },
    };

    mockPlugins.set('ROUND_ROBIN', {
      enrichActiveTournament: jest.fn().mockResolvedValue({
        id: 2,
        type: 'ROUND_ROBIN',
        status: 'ACTIVE',
        participants: [],
        matches: [],
      }),
    });

    const tournament = {
      id: 1,
      type: 'TEST_COMPOUND',
      status: 'ACTIVE',
      participants: [],
      matches: [],
      childTournaments: [
        { id: 2, type: 'ROUND_ROBIN', participants: [], matches: [] },
      ],
    };

    await plugin.enrichActiveTournament({ tournament, prisma: mockPrisma });

    // Should NOT call findMany since children are already loaded
    expect(mockPrisma.tournament.findMany).not.toHaveBeenCalled();
  });

  it('returns empty bracketMatches for compound tournaments', async () => {
    const tournament = {
      id: 1,
      type: 'TEST_COMPOUND',
      status: 'ACTIVE',
      participants: [],
      matches: [],
      childTournaments: [],
    };

    const result = await plugin.enrichActiveTournament({ tournament, prisma: {} });
    expect(result.bracketMatches).toEqual([]);
  });
});

// ─── enrichCompletedTournament ────────────────────────────────────────────

describe('BaseCompoundTournamentPlugin.enrichCompletedTournament', () => {
  const plugin = new TestCompoundPlugin();
  const mockPlugins = (tournamentPluginRegistry as any)._mockPlugins;

  beforeEach(() => {
    mockPlugins.clear();
  });

  it('adds postRatingAtTime to participants', async () => {
    const postRatingMap = new Map<string, number | null>();
    postRatingMap.set('1-10', 1550);
    postRatingMap.set('1-20', 1480);

    const tournament = {
      id: 1,
      type: 'TEST_COMPOUND',
      status: 'COMPLETED',
      participants: [
        { memberId: 10, member: { id: 10, rating: 1500 } },
        { memberId: 20, member: { id: 20, rating: 1500 } },
      ],
      matches: [],
      childTournaments: [],
    };

    const result = await plugin.enrichCompletedTournament({
      tournament,
      postRatingMap,
      prisma: {},
    });

    expect((result.participants[0] as any).postRatingAtTime).toBe(1550);
    expect((result.participants[1] as any).postRatingAtTime).toBe(1480);
  });

  it('falls back to member.rating when postRatingMap has no entry', async () => {
    const postRatingMap = new Map<string, number | null>();

    const tournament = {
      id: 1,
      type: 'TEST_COMPOUND',
      status: 'COMPLETED',
      participants: [
        { memberId: 10, member: { id: 10, rating: 1500 } },
      ],
      matches: [],
      childTournaments: [],
    };

    const result = await plugin.enrichCompletedTournament({
      tournament,
      postRatingMap,
      prisma: {},
    });

    expect((result.participants[0] as any).postRatingAtTime).toBe(1500);
  });

  it('fetches children from DB when not loaded', async () => {
    const mockPrisma = {
      tournament: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const tournament = {
      id: 1,
      type: 'TEST_COMPOUND',
      status: 'COMPLETED',
      participants: [],
      matches: [],
      // childTournaments NOT loaded
    };

    await plugin.enrichCompletedTournament({
      tournament,
      prisma: mockPrisma,
    });

    expect(mockPrisma.tournament.findMany).toHaveBeenCalled();
  });
});

// ─── getSchedule ──────────────────────────────────────────────────────────

describe('BaseCompoundTournamentPlugin.getSchedule', () => {
  const plugin = new TestCompoundPlugin();
  const mockPlugins = (tournamentPluginRegistry as any)._mockPlugins;

  beforeEach(() => {
    mockPlugins.clear();
  });

  it('returns empty childSchedules when no children', async () => {
    const result = await plugin.getSchedule({
      tournament: { childTournaments: undefined },
      prisma: {},
    });
    expect(result).toEqual({ childSchedules: [] });
  });

  it('aggregates schedules from child tournaments', async () => {
    mockPlugins.set('ROUND_ROBIN', {
      getSchedule: jest.fn().mockResolvedValue({ rounds: [1, 2, 3] }),
    });

    const tournament = {
      childTournaments: [
        { id: 2, type: 'ROUND_ROBIN', name: 'Group 1' },
        { id: 3, type: 'ROUND_ROBIN', name: 'Group 2' },
      ],
    };

    const result = await plugin.getSchedule({ tournament, prisma: {} });

    expect(result.childSchedules).toHaveLength(2);
    expect(result.childSchedules[0].tournamentId).toBe(2);
    expect(result.childSchedules[0].name).toBe('Group 1');
    expect(result.childSchedules[0].rounds).toEqual([1, 2, 3]);
  });
});

// ─── getPrintableView ─────────────────────────────────────────────────────

describe('BaseCompoundTournamentPlugin.getPrintableView', () => {
  const plugin = new TestCompoundPlugin();
  const mockPlugins = (tournamentPluginRegistry as any)._mockPlugins;

  beforeEach(() => {
    mockPlugins.clear();
  });

  it('returns empty childViews when no children', async () => {
    const result = await plugin.getPrintableView({
      tournament: {},
      prisma: {},
    });
    expect(result).toEqual({ childViews: [] });
  });

  it('aggregates views from child tournaments', async () => {
    mockPlugins.set('ROUND_ROBIN', {
      getPrintableView: jest.fn().mockResolvedValue({ standings: [] }),
    });

    const tournament = {
      childTournaments: [
        { id: 2, type: 'ROUND_ROBIN', name: 'Group 1' },
      ],
    };

    const result = await plugin.getPrintableView({ tournament, prisma: {} });

    expect(result.childViews).toHaveLength(1);
    expect(result.childViews[0].tournamentId).toBe(2);
    expect(result.childViews[0].standings).toEqual([]);
  });
});
