jest.mock('../../src/index', () => ({
  prisma: {},
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockHasAnyAchievementEnabled = jest.fn();
const mockIsAchievementEnabled = jest.fn();
const mockGetEnabledAchievementPlugins = jest.fn();
const mockGetAchievementPlugin = jest.fn();
const mockComputeEnabledCategories = jest.fn();
const mockComputeCategory = jest.fn();
const mockBuildAchievementContext = jest.fn();

jest.mock('../../src/services/systemConfigService', () => ({
  hasAnyAchievementEnabled: (...args: unknown[]) => mockHasAnyAchievementEnabled(...args),
}));

jest.mock('../../src/achievements/registry', () => {
  const actual = jest.requireActual('../../src/achievements/registry');
  return {
    ...actual,
    isAchievementEnabled: (...args: unknown[]) => mockIsAchievementEnabled(...args),
    getEnabledAchievementPlugins: (...args: unknown[]) => mockGetEnabledAchievementPlugins(...args),
    getAchievementPlugin: (...args: unknown[]) => mockGetAchievementPlugin(...args),
    computeEnabledCategories: (...args: unknown[]) => mockComputeEnabledCategories(...args),
    computeCategory: (...args: unknown[]) => mockComputeCategory(...args),
  };
});

jest.mock('../../src/achievements/shared/context', () => ({
  buildAchievementContext: (...args: unknown[]) => mockBuildAchievementContext(...args),
}));

import express from 'express';
import request from 'supertest';
import publicAchievementsRoutes from '../../src/routes/publicAchievements';
import { DEFAULT_ACHIEVEMENTS_EMPTY_MESSAGE } from '../../src/achievements/emptyMessage';
import { mostWinsPlugin } from '../../src/achievements/plugins/mostWins';

function createApp() {
  const app = express();
  app.use('/api/public/achievements', publicAchievementsRoutes);
  return app;
}

describe('publicAchievements routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasAnyAchievementEnabled.mockReturnValue(true);
    mockIsAchievementEnabled.mockReturnValue(true);
    mockGetEnabledAchievementPlugins.mockReturnValue([mostWinsPlugin]);
    mockGetAchievementPlugin.mockReturnValue(mostWinsPlugin);
    mockBuildAchievementContext.mockResolvedValue({
      scope: { type: 'period', period: 'month', from: null, to: null },
      prisma: {},
      matches: [],
      participants: [],
      ratingHistory: [],
      tournamentsById: new Map(),
      rootTournamentIds: [],
      membersById: new Map(),
    });
    mockComputeEnabledCategories.mockResolvedValue([
      {
        id: 'most_wins',
        title: 'Most wins',
        entries: [
          {
            rank: 1,
            member: { id: 1, firstName: 'Ada', lastName: 'L', rating: 1500 },
            value: 3,
            label: '3 wins',
          },
        ],
      },
    ]);
    mockComputeCategory.mockResolvedValue({
      id: 'most_wins',
      title: 'Most wins',
      entries: [
        {
          rank: 1,
          member: { id: 1, firstName: 'Ada', lastName: 'L', rating: 1500 },
          value: 3,
          label: '3 wins',
        },
      ],
    });
  });

  it('returns 404 when no achievement categories are enabled', async () => {
    mockHasAnyAchievementEnabled.mockReturnValue(false);
    const res = await request(createApp()).get('/api/public/achievements?period=month');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Achievements not available');
  });

  it('returns 400 for invalid scope combinations', async () => {
    const res = await request(createApp()).get(
      '/api/public/achievements?tournamentId=1&period=week',
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not both/i);
  });

  it('returns combined categories for enabled plugins', async () => {
    const res = await request(createApp()).get('/api/public/achievements?period=month');
    expect(res.status).toBe(200);
    expect(res.body.categories).toHaveLength(1);
    expect(res.body.categories[0].id).toBe('most_wins');
    expect(res.body.emptyMessage).toBeNull();
  });

  it('returns emptyMessage when combined board has no entries', async () => {
    mockComputeEnabledCategories.mockResolvedValue([]);
    const res = await request(createApp()).get('/api/public/achievements?period=forever');
    expect(res.status).toBe(200);
    expect(res.body.categories).toEqual([]);
    expect(res.body.emptyMessage.text).toBe(DEFAULT_ACHIEVEMENTS_EMPTY_MESSAGE);
  });

  it('returns a single category by id', async () => {
    const res = await request(createApp()).get(
      '/api/public/achievements/most_wins?period=month',
    );
    expect(res.status).toBe(200);
    expect(res.body.category.id).toBe('most_wins');
    expect(res.body.emptyMessage).toBeNull();
  });

  it('returns 404 for disabled category id', async () => {
    mockIsAchievementEnabled.mockReturnValue(false);
    const res = await request(createApp()).get(
      '/api/public/achievements/most_wins?period=month',
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 for unknown category id', async () => {
    const res = await request(createApp()).get(
      '/api/public/achievements/not_a_real_category?period=month',
    );
    expect(res.status).toBe(404);
  });

  it('returns emptyMessage for empty single category', async () => {
    mockComputeCategory.mockResolvedValue(null);
    const res = await request(createApp()).get(
      '/api/public/achievements/most_wins?period=month',
    );
    expect(res.status).toBe(200);
    expect(res.body.category.entries).toEqual([]);
    expect(res.body.emptyMessage.text).toBe(DEFAULT_ACHIEVEMENTS_EMPTY_MESSAGE);
  });
});
