jest.mock('../../src/index', () => ({
  prisma: {
    member: {
      findMany: jest.fn(),
    },
    memberLifecycleEvent: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    auditInfo: jest.fn(),
  },
}));

jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    const rolesHeader = req.headers['x-test-roles'];
    const roles =
      typeof rolesHeader === 'string' && rolesHeader.length > 0
        ? rolesHeader.split(',').map((r: string) => r.trim())
        : [];
    if (roles.length === 0) {
      return _res.status(401).json({ error: 'Authentication required' });
    }
    req.memberId = 1;
    req.member = {
      id: 1,
      email: 'admin@example.com',
      firstName: 'Admin',
      lastName: 'User',
      roles,
    };
    next();
  },
}));

jest.mock('../../src/services/systemConfigService', () => ({
  getClubPlansConfig: jest.fn(() => ({})),
  updateSystemConfig: jest.fn(),
  getPaymentsConfig: jest.fn(() => ({})),
  getSystemConfig: jest.fn(() => ({})),
}));

jest.mock('../../src/services/socketService', () => ({
  emitPaymentUpdated: jest.fn(),
  emitToAll: jest.fn(),
}));

jest.mock('../../src/payments/resolvePlan', () => ({
  resolvePlanForMember: jest.fn(),
  planChargeAmountCents: jest.fn(),
}));

jest.mock('../../src/payments/entitlementQueue', () => ({
  computeFutureReimburseCents: jest.fn(),
  getFutureEntitlement: jest.fn(),
  refreshCurrentEntitlement: jest.fn(),
  serializeEntitlement: jest.fn(),
  endEntitlement: jest.fn(),
}));

jest.mock('../../src/payments/planPurchaseRules', () => ({
  planAllowsMemberPurchase: jest.fn(),
}));

jest.mock('../../src/utils/planDuration', () => ({
  computeValidTo: jest.fn(),
}));

jest.mock('../../src/payments/memberTrial', () => ({
  isMemberInTrialPeriod: jest.fn(),
  trialEndsOnToYmd: jest.fn(),
  trialPlanStartYmd: jest.fn(),
}));

jest.mock('../../src/payments/confirmPayment', () => ({
  confirmPayment: jest.fn(),
}));

jest.mock('../../src/payments/autoCheckout', () => ({
  runAutoCheckout: jest.fn(),
  runCloseClub: jest.fn(),
}));

jest.mock('../../src/payments/attendanceLogFilters', () => ({
  attendanceStatusWhere: jest.fn(() => ({})),
  parseAttendanceStatusFilter: jest.fn(() => null),
}));

jest.mock('../../src/utils/clubDate', () => ({
  getClubDate: jest.fn(() => '2026-08-20'),
  getClubTimezone: jest.fn(() => 'America/Los_Angeles'),
  clubLocalDayRangeUtc: jest.fn(),
}));

jest.mock('../../src/utils/paymentLoginEligibility', () => ({
  memberHasPaymentLogin: jest.fn(),
}));

jest.mock('../../src/payments/checkInToggle', () => ({
  memberContextFromStub: jest.fn(),
  toggleVisit: jest.fn(),
}));

jest.mock('../../src/payments/checkInStateCache', () => ({
  getCachedMemberCheckInStub: jest.fn(),
  invalidateCurrentEntitlement: jest.fn(),
  setCachedMemberCheckInStub: jest.fn(),
}));

jest.mock('../../src/payments/presenceBoardVersion', () => ({
  getPresenceBoardVersion: jest.fn(() => 1),
}));

jest.mock('../../src/payments/getActivePaymentProvider', () => ({
  memberCanPayOnline: jest.fn(),
}));

jest.mock('../../src/utils/scorePin', () => ({
  scorePinsEqual: jest.fn(),
}));

import express from 'express';
import request from 'supertest';
import { prisma } from '../../src/index';
import clubRoutes from '../../src/routes/club';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/club', clubRoutes);
  return app;
}

const prismaMock = prisma as unknown as {
  member: { findMany: jest.Mock };
  memberLifecycleEvent: { findMany: jest.Mock; create: jest.Mock };
};

describe('GET /api/club/admin/membership-events', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.member.findMany.mockResolvedValue([]);
    prismaMock.memberLifecycleEvent.findMany.mockResolvedValue([]);
  });

  it('requires admin', async () => {
    const res = await request(createApp())
      .get('/api/club/admin/membership-events')
      .set('x-test-roles', 'PLAYER');
    expect(res.status).toBe(403);
    expect(prismaMock.memberLifecycleEvent.findMany).not.toHaveBeenCalled();
  });

  it('returns newest-first events for admin', async () => {
    const newer = new Date('2026-08-20T18:00:00.000Z');
    const older = new Date('2026-08-19T12:00:00.000Z');
    prismaMock.memberLifecycleEvent.findMany.mockResolvedValue([
      {
        id: 2,
        memberId: 9,
        occurredAt: newer,
        action: 'ACTIVATE',
        actorType: 'PUBLIC',
        actorMemberId: null,
        summary: 'Ada Lovelace activated membership',
        details: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
      },
      {
        id: 1,
        memberId: 9,
        occurredAt: older,
        action: 'APPLY',
        actorType: 'PUBLIC',
        actorMemberId: null,
        summary: 'Membership application created for Ada Lovelace',
        details: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
      },
    ]);
    prismaMock.member.findMany.mockResolvedValue([
      { id: 9, firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
    ]);

    const res = await request(createApp())
      .get('/api/club/admin/membership-events')
      .set('x-test-roles', 'ADMIN');

    expect(res.status).toBe(200);
    expect(prismaMock.memberLifecycleEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { occurredAt: 'desc' },
        take: 500,
      }),
    );
    expect(res.body.events).toHaveLength(2);
    expect(res.body.events[0].id).toBe(2);
    expect(res.body.events[0].action).toBe('ACTIVATE');
    expect(res.body.events[0].memberName).toBe('Ada Lovelace');
    expect(res.body.events[0].actorName).toBe('Public');
    expect(res.body.events[1].id).toBe(1);
  });
});
