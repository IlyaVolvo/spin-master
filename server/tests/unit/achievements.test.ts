import {
  getMatchWinnerId,
  isCountableCompetitiveMatch,
  isForfeitMatch,
} from '../../src/achievements/shared/matchWinner';
import { parseAchievementScope } from '../../src/achievements/shared/scope';
import { rankEntries } from '../../src/achievements/shared/ranking';
import { mostWinsPlugin } from '../../src/achievements/plugins/mostWins';
import { biggestUpsetPlugin } from '../../src/achievements/plugins/biggestUpset';
import type { AchievementContext, AchievementPublicMember } from '../../src/achievements/types';
import { validateSystemConfig } from '../../src/services/systemConfigService';

describe('achievement matchWinner helpers', () => {
  it('resolves forfeit winner before sets', () => {
    expect(
      getMatchWinnerId({
        member1Id: 1,
        member2Id: 2,
        player1Sets: 3,
        player2Sets: 0,
        player1Forfeit: true,
        player2Forfeit: false,
      }),
    ).toBe(2);
  });

  it('excludes forfeits from countable competitive matches', () => {
    expect(
      isCountableCompetitiveMatch({
        member1Id: 1,
        member2Id: 2,
        player1Sets: 0,
        player2Sets: 0,
        player1Forfeit: true,
        player2Forfeit: false,
      }),
    ).toBe(false);
    expect(isForfeitMatch({ player1Forfeit: true })).toBe(true);
  });
});

describe('parseAchievementScope', () => {
  it('rejects tournament combined with period', () => {
    const result = parseAchievementScope({ tournamentId: '3', period: 'week' });
    expect(result.ok).toBe(false);
  });

  it('parses period presets', () => {
    const result = parseAchievementScope({ period: 'forever' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scope.type).toBe('period');
      if (result.scope.type === 'period') {
        expect(result.scope.period).toBe('forever');
        expect(result.scope.from).toBeNull();
      }
    }
  });
});

describe('publicAccess achievements config', () => {
  it('defaults all achievement display counts to 0', () => {
    const config = validateSystemConfig({});
    expect(config.publicAccess.achievements.biggest_upset).toBe(0);
    expect(config.publicAccess.achievements.most_wins).toBe(0);
  });

  it('accepts per-category display counts and migrates legacy booleans', () => {
    const config = validateSystemConfig({
      publicAccess: { achievements: { most_wins: 5, biggest_upset: true, most_active: false } },
    });
    expect(config.publicAccess.achievements.most_wins).toBe(5);
    expect(config.publicAccess.achievements.biggest_upset).toBe(10);
    expect(config.publicAccess.achievements.most_active).toBe(0);
  });
});

function member(id: number): AchievementPublicMember {
  return { id, firstName: `P${id}`, lastName: 'Test', rating: 1500 };
}

function baseCtx(overrides: Partial<AchievementContext> = {}): AchievementContext {
  const membersById = new Map([
    [1, member(1)],
    [2, member(2)],
  ]);
  return {
    scope: { type: 'period', period: 'month', from: null, to: null },
    prisma: {},
    matches: [],
    participants: [],
    ratingHistory: [],
    tournamentsById: new Map(),
    rootTournamentIds: [],
    membersById,
    ...overrides,
  };
}

describe('mostWinsPlugin', () => {
  it('counts non-forfeit wins only', () => {
    const ctx = baseCtx({
      matches: [
        {
          id: 1,
          tournamentId: 10,
          rootTournamentId: 10,
          member1Id: 1,
          member2Id: 2,
          player1Sets: 3,
          player2Sets: 1,
          player1Forfeit: false,
          player2Forfeit: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          tournamentId: 10,
          rootTournamentId: 10,
          member1Id: 1,
          member2Id: 2,
          player1Sets: 0,
          player2Sets: 0,
          player1Forfeit: false,
          player2Forfeit: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    const entries = mostWinsPlugin.compute(ctx) as ReturnType<typeof rankEntries>;
    expect(entries).toHaveLength(1);
    expect(entries[0].member.id).toBe(1);
    expect(entries[0].value).toBe(1);
  });
});

describe('biggestUpsetPlugin', () => {
  it('ranks upset wins by pre-match rating gap for the underdog winner', () => {
    const ctx = baseCtx({
      participants: [
        {
          tournamentId: 10,
          rootTournamentId: 10,
          memberId: 1,
          playerRatingAtTime: 1200,
          member: member(1),
        },
        {
          tournamentId: 10,
          rootTournamentId: 10,
          memberId: 2,
          playerRatingAtTime: 1600,
          member: member(2),
        },
      ],
      matches: [
        {
          id: 5,
          tournamentId: 10,
          rootTournamentId: 10,
          member1Id: 1,
          member2Id: 2,
          player1Sets: 3,
          player2Sets: 2,
          player1Forfeit: false,
          player2Forfeit: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    const entries = biggestUpsetPlugin.compute(ctx) as ReturnType<typeof rankEntries>;
    expect(entries[0].member.id).toBe(1);
    expect(entries[0].opponent?.id).toBe(2);
    expect(entries[0].value).toBe(400);
    expect(entries[0].winnerRatingBefore).toBe(1200);
    expect(entries[0].loserRatingBefore).toBe(1600);
    expect(entries[0].label).toBe('400');
  });

  it('ignores forfeit wins', () => {
    const ctx = baseCtx({
      participants: [
        {
          tournamentId: 10,
          rootTournamentId: 10,
          memberId: 1,
          playerRatingAtTime: 1200,
          member: member(1),
        },
        {
          tournamentId: 10,
          rootTournamentId: 10,
          memberId: 2,
          playerRatingAtTime: 1600,
          member: member(2),
        },
      ],
      matches: [
        {
          id: 5,
          tournamentId: 10,
          rootTournamentId: 10,
          member1Id: 1,
          member2Id: 2,
          player1Sets: 0,
          player2Sets: 0,
          player1Forfeit: false,
          player2Forfeit: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    const entries = biggestUpsetPlugin.compute(ctx) as ReturnType<typeof rankEntries>;
    expect(entries).toHaveLength(0);
  });
});
