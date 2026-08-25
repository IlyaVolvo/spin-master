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

const mockIsPresentBoardEnabled = jest.fn();
const mockLoadPresentMembers = jest.fn();
const mockLoadPublicHostDuty = jest.fn();
const mockGetPresenceBoardVersion = jest.fn();
const mockGetClubDate = jest.fn();

jest.mock('../../src/services/systemConfigService', () => ({
  isPresentBoardEnabled: (...args: unknown[]) => mockIsPresentBoardEnabled(...args),
}));

jest.mock('../../src/payments/presentMembers', () => ({
  loadPresentMembers: (...args: unknown[]) => mockLoadPresentMembers(...args),
}));

jest.mock('../../src/payments/publicHostDuty', () => ({
  loadPublicHostDuty: (...args: unknown[]) => mockLoadPublicHostDuty(...args),
}));

jest.mock('../../src/payments/presenceBoardVersion', () => ({
  getPresenceBoardVersion: (...args: unknown[]) => mockGetPresenceBoardVersion(...args),
}));

jest.mock('../../src/utils/clubDate', () => ({
  getClubDate: (...args: unknown[]) => mockGetClubDate(...args),
}));

import express from 'express';
import request from 'supertest';
import publicPresenceRoutes from '../../src/routes/publicPresence';

function createApp() {
  const app = express();
  app.use('/api/public/present', publicPresenceRoutes);
  return app;
}

describe('publicPresence routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsPresentBoardEnabled.mockReturnValue(true);
    mockGetClubDate.mockReturnValue('2026-08-25');
    mockGetPresenceBoardVersion.mockReturnValue(7);
    mockLoadPublicHostDuty.mockResolvedValue([
      {
        label: 'Morning 10:00–14:00',
        startTime: '10:00',
        endTime: '14:00',
        status: 'arrived',
        hostName: 'Polly Wordlot',
        memberId: 318,
      },
      {
        label: 'Evening 18:00–21:00',
        startTime: '18:00',
        endTime: '21:00',
        status: 'not_arrived',
        hostName: null,
        memberId: null,
      },
    ]);
    mockLoadPresentMembers.mockResolvedValue({
      clubDate: '2026-08-25',
      presentCount: 2,
      members: [
        {
          memberId: 318,
          firstName: 'Polly',
          lastName: 'Wordlot',
          rating: 1200,
          checkInAt: '2026-08-25T18:02:00.000Z',
        },
        {
          memberId: 42,
          firstName: 'Ada',
          lastName: 'Lovelace',
          rating: 1500,
          checkInAt: '2026-08-25T18:10:00.000Z',
        },
      ],
    });
  });

  it('returns 404 when present board is disabled', async () => {
    mockIsPresentBoardEnabled.mockReturnValue(false);
    const res = await request(createApp()).get('/api/public/present');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Present board not available');
  });

  it('returns present members and host duty without internal ids', async () => {
    const res = await request(createApp()).get('/api/public/present');
    expect(res.status).toBe(200);
    expect(res.body.clubDate).toBe('2026-08-25');
    expect(res.body.version).toBe(7);
    expect(res.body.presentCount).toBe(1);
    expect(res.body.hosts).toEqual([
      {
        label: 'Morning 10:00–14:00',
        startTime: '10:00',
        endTime: '14:00',
        status: 'arrived',
        hostName: 'Polly Wordlot',
      },
      {
        label: 'Evening 18:00–21:00',
        startTime: '18:00',
        endTime: '21:00',
        status: 'not_arrived',
        hostName: null,
      },
    ]);
    expect(res.body.members).toEqual([
      {
        firstName: 'Ada',
        lastName: 'Lovelace',
        checkInAt: '2026-08-25T18:10:00.000Z',
      },
    ]);
  });

  it('returns version probe when enabled', async () => {
    const res = await request(createApp()).get('/api/public/present/version');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ clubDate: '2026-08-25', version: 7 });
  });

  it('returns 404 for version probe when disabled', async () => {
    mockIsPresentBoardEnabled.mockReturnValue(false);
    const res = await request(createApp()).get('/api/public/present/version');
    expect(res.status).toBe(404);
  });
});
