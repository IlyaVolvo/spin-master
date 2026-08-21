jest.mock('../../src/index', () => ({
  prisma: {
    member: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    memberLifecycleEvent: {
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

jest.mock('../../src/services/socketService', () => ({
  emitToAll: jest.fn(),
}));

jest.mock('../../src/services/playerSocketBroadcast', () => ({
  broadcastMembersUpdated: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/payments/checkInStateCache', () => ({
  invalidateMemberCheckInStub: jest.fn(),
}));

jest.mock('../../src/payments/memberTrial', () => ({
  resolveNewMemberTrialEndsOn: jest.fn(() => new Date('2026-08-26T12:00:00.000Z')),
}));

const mockSendMembershipApplicationEmail = jest.fn().mockResolvedValue(undefined);

jest.mock('../../src/services/mailService', () => {
  const actual = jest.requireActual('../../src/services/mailService');
  return {
    ...actual,
    sendMembershipApplicationEmail: (...args: unknown[]) => mockSendMembershipApplicationEmail(...args),
  };
});

jest.mock('../../src/services/systemConfigService', () => ({
  getSystemConfig: () => ({ branding: { clubName: 'Test Club' } }),
  getPaymentsConfig: () => ({ defaultOnlinePayConsent: false }),
  getAuthPolicyConfig: () => ({ minimumPasswordLength: 6, pinLength: 4 }),
}));

jest.mock('../../src/utils/scorePin', () => ({
  generateScorePin: () => '1234',
  normalizeScorePin: (value: unknown) => (typeof value === 'string' ? value.trim() : ''),
  validateScorePinFormat: (value: unknown) => {
    const pin = typeof value === 'string' ? value.trim() : '';
    if (!/^\d{4}$/.test(pin)) return 'PIN must be exactly 4 digits';
    return null;
  },
}));

import express from 'express';
import request from 'supertest';
import { prisma } from '../../src/index';
import publicMembershipRoutes from '../../src/routes/publicMembership';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/public/membership', publicMembershipRoutes);
  return app;
}

const prismaMock = prisma as unknown as {
  member: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  memberLifecycleEvent: {
    create: jest.Mock;
  };
};

describe('publicMembership routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendMembershipApplicationEmail.mockResolvedValue({ messageId: 'test-id' });
    prismaMock.member.findMany.mockResolvedValue([]);
    prismaMock.member.findFirst.mockResolvedValue(null);
    prismaMock.memberLifecycleEvent.create.mockResolvedValue({ id: 1 });
  });

  it('rejects apply when first/last/email are missing', async () => {
    const res = await request(createApp()).post('/api/public/membership/apply').send({});
    expect(res.status).toBe(400);
    expect(prismaMock.member.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate email for an already-activated member', async () => {
    prismaMock.member.findFirst.mockResolvedValue({
      id: 3,
      email: 'ada@example.com',
      isActive: true,
      emailConfirmedAt: new Date(),
    });
    const res = await request(createApp()).post('/api/public/membership/apply').send({
      firstName: 'Other',
      lastName: 'Person',
      email: 'ada@example.com',
    });
    expect(res.status).toBe(409);
    expect(res.body.fieldErrors.email).toMatch(/email already exists/i);
    expect(prismaMock.member.create).not.toHaveBeenCalled();
    expect(mockSendMembershipApplicationEmail).not.toHaveBeenCalled();
  });

  it('rejects duplicate first and last name', async () => {
    prismaMock.member.findMany.mockResolvedValue([
      { firstName: 'Ada', lastName: 'Lovelace', email: 'someone@example.com' },
    ]);
    const res = await request(createApp()).post('/api/public/membership/apply').send({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'new@example.com',
    });
    expect(res.status).toBe(409);
    expect(res.body.fieldErrors.firstName).toMatch(/name already exists/i);
    expect(prismaMock.member.create).not.toHaveBeenCalled();
  });

  it('creates a waiting member and sends accept/deny email', async () => {
    prismaMock.member.create.mockResolvedValue({
      id: 9,
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      password: '',
      scorePin: '1234',
      qrTokenHash: 'hash',
    });
    const res = await request(createApp()).post('/api/public/membership/apply').send({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
    });
    expect(res.status).toBe(201);
    expect(prismaMock.member.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isActive: false,
          mustResetPassword: true,
          trialEndsOn: null,
          emailConfirmedAt: null,
        }),
      }),
    );
    expect(mockSendMembershipApplicationEmail).toHaveBeenCalled();
    expect(prismaMock.memberLifecycleEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          memberId: 9,
          action: 'APPLY',
          actorType: 'PUBLIC',
        }),
      }),
    );
  });

  it('resends email for an existing waiting application', async () => {
    prismaMock.member.findFirst.mockResolvedValue({
      id: 9,
      email: 'ada@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      isActive: false,
      emailConfirmedAt: null,
    });
    prismaMock.member.update.mockResolvedValue({
      id: 9,
      email: 'ada@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      password: '',
      scorePin: '1234',
      qrTokenHash: 'hash',
    });
    const res = await request(createApp()).post('/api/public/membership/apply').send({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
    });
    expect(res.status).toBe(200);
    expect(prismaMock.member.create).not.toHaveBeenCalled();
    expect(prismaMock.member.update).toHaveBeenCalled();
    expect(mockSendMembershipApplicationEmail).toHaveBeenCalled();
    expect(prismaMock.memberLifecycleEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          memberId: 9,
          action: 'APPLY_RESEND',
          actorType: 'PUBLIC',
        }),
      }),
    );
  });

  it('rolls back the member when email send fails', async () => {
    prismaMock.member.create.mockResolvedValue({ id: 9, email: 'ada@example.com' });
    mockSendMembershipApplicationEmail.mockRejectedValue(new Error('SMTP down'));
    const res = await request(createApp()).post('/api/public/membership/apply').send({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
    });
    expect(res.status).toBe(500);
    expect(prismaMock.member.delete).toHaveBeenCalledWith({ where: { id: 9 } });
  });

  it('denies a waiting application by deleting the member', async () => {
    prismaMock.member.findFirst.mockResolvedValue({
      id: 9,
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      isActive: false,
      emailConfirmedAt: null,
      passwordResetToken: 'tok',
      passwordResetTokenExpiry: new Date(Date.now() + 60_000),
    });
    const res = await request(createApp()).post('/api/public/membership/deny').send({ token: 'tok' });
    expect(res.status).toBe(200);
    expect(prismaMock.member.delete).toHaveBeenCalledWith({ where: { id: 9 } });
    expect(prismaMock.memberLifecycleEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          memberId: 9,
          action: 'DENY',
          actorType: 'PUBLIC',
        }),
      }),
    );
  });

  it('records ACTIVATE when completing membership', async () => {
    prismaMock.member.findFirst.mockResolvedValue({
      id: 9,
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      isActive: false,
      emailConfirmedAt: null,
      passwordResetToken: 'tok',
      passwordResetTokenExpiry: new Date(Date.now() + 60_000),
      roles: ['PLAYER'],
      autoRelinquishPrivileges: null,
    });
    prismaMock.member.update.mockResolvedValue({
      id: 9,
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      isActive: true,
      emailConfirmedAt: new Date(),
      roles: ['PLAYER'],
      autoRelinquishPrivileges: null,
      mustResetPassword: false,
      scorePin: '1234',
    });

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).session = {
        regenerate: (cb: (err?: Error) => void) => cb(),
        save: (cb: (err?: Error) => void) => cb(),
        cookie: {},
      };
      (req as any).sessionID = 'sess-1';
      next();
    });
    app.use('/api/public/membership', publicMembershipRoutes);

    const res = await request(app).post('/api/public/membership/complete').send({
      token: 'tok',
      password: 'secret1',
      scorePin: '1234',
    });
    expect(res.status).toBe(200);
    expect(prismaMock.memberLifecycleEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          memberId: 9,
          action: 'ACTIVATE',
          actorType: 'PUBLIC',
        }),
      }),
    );
  });

  it('does not delete on GET token preview', async () => {
    prismaMock.member.findFirst.mockResolvedValue({
      id: 9,
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      isActive: false,
      emailConfirmedAt: null,
      passwordResetToken: 'tok',
      passwordResetTokenExpiry: new Date(Date.now() + 60_000),
    });
    const res = await request(createApp()).get('/api/public/membership/token').query({ token: 'tok' });
    expect(res.status).toBe(200);
    expect(res.body.firstName).toBe('Ada');
    expect(prismaMock.member.delete).not.toHaveBeenCalled();
  });
});
