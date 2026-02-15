/**
 * Auth Middleware — Unit Tests
 *
 * Tests authenticateSession middleware:
 * - Session-based authentication
 * - JWT token authentication
 * - Error handling (no token, invalid token, expired token)
 * - Member data population from DB
 */

jest.mock('../../src/index', () => ({
  prisma: {
    member: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import jwt from 'jsonwebtoken';
import { authenticateSession, AuthRequest } from '../../src/middleware/auth';
import { prisma } from '../../src/index';

const mockPrisma = prisma as any;

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeMockReq(overrides: any = {}): any {
  return {
    method: 'GET',
    path: '/test',
    headers: {},
    session: null,
    ...overrides,
  };
}

function makeMockRes(): any {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const mockNext = jest.fn();

// ─── Tests ────────────────────────────────────────────────────────────────

describe('authenticateSession', () => {
  const JWT_SECRET = 'secret'; // default fallback

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.JWT_SECRET;
    delete process.env.SESSION_SECRET;
  });

  describe('session-based authentication', () => {
    it('authenticates via session and sets memberId + member on request', async () => {
      const memberData = { id: 1, email: 'test@test.com', firstName: 'John', lastName: 'Doe', roles: ['MEMBER'] };
      const req = makeMockReq({
        session: { member: memberData },
      });
      const res = makeMockRes();

      await authenticateSession(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((req as AuthRequest).memberId).toBe(1);
      expect((req as AuthRequest).member).toEqual(memberData);
    });

    it('skips to JWT when session has no member', async () => {
      const req = makeMockReq({
        session: {},
        headers: {},
      });
      const res = makeMockRes();

      await authenticateSession(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('skips to JWT when session is null', async () => {
      const req = makeMockReq({
        session: null,
        headers: {},
      });
      const res = makeMockRes();

      await authenticateSession(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('JWT token authentication', () => {
    it('authenticates with valid member JWT token', async () => {
      const token = jwt.sign({ memberId: 5, type: 'member' }, JWT_SECRET);
      const memberData = { id: 5, email: 'jwt@test.com', firstName: 'Jane', lastName: 'Smith', roles: ['MEMBER'] };

      mockPrisma.member.findUnique.mockResolvedValue(memberData);

      const req = makeMockReq({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = makeMockRes();

      await authenticateSession(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((req as AuthRequest).memberId).toBe(5);
      expect((req as AuthRequest).member).toEqual(memberData);
    });

    it('authenticates even when member not found in DB', async () => {
      const token = jwt.sign({ memberId: 99, type: 'member' }, JWT_SECRET);

      mockPrisma.member.findUnique.mockResolvedValue(null);

      const req = makeMockReq({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = makeMockRes();

      await authenticateSession(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((req as AuthRequest).memberId).toBe(99);
      expect((req as AuthRequest).member).toBeUndefined();
    });

    it('authenticates even when DB lookup fails', async () => {
      const token = jwt.sign({ memberId: 5, type: 'member' }, JWT_SECRET);

      mockPrisma.member.findUnique.mockRejectedValue(new Error('DB connection failed'));

      const req = makeMockReq({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = makeMockRes();

      await authenticateSession(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((req as AuthRequest).memberId).toBe(5);
    });

    it('rejects token without type=member', async () => {
      const token = jwt.sign({ userId: 5, type: 'admin' }, JWT_SECRET);

      const req = makeMockReq({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = makeMockRes();

      await authenticateSession(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Invalid token' }));
    });

    it('rejects token without memberId', async () => {
      const token = jwt.sign({ type: 'member' }, JWT_SECRET);

      const req = makeMockReq({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = makeMockRes();

      await authenticateSession(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('rejects invalid/malformed token', async () => {
      const req = makeMockReq({
        headers: { authorization: 'Bearer invalid.token.here' },
      });
      const res = makeMockRes();

      await authenticateSession(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Invalid token' }));
    });

    it('rejects expired token', async () => {
      const token = jwt.sign({ memberId: 5, type: 'member' }, JWT_SECRET, { expiresIn: '-1s' });

      const req = makeMockReq({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = makeMockRes();

      await authenticateSession(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('rejects token signed with wrong secret', async () => {
      const token = jwt.sign({ memberId: 5, type: 'member' }, 'wrong-secret');

      const req = makeMockReq({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = makeMockRes();

      await authenticateSession(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('no authentication provided', () => {
    it('returns 401 when no session and no token', async () => {
      const req = makeMockReq({
        headers: {},
      });
      const res = makeMockRes();

      await authenticateSession(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('returns 401 when authorization header has no Bearer prefix', async () => {
      const req = makeMockReq({
        headers: { authorization: 'some-token-without-bearer' },
      });
      const res = makeMockRes();

      await authenticateSession(req, res, mockNext);

      // split(' ')[1] returns undefined for 'some-token-without-bearer'
      // Actually 'some-token-without-bearer'.split(' ')[1] is undefined
      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('JWT_SECRET environment variable handling', () => {
    it('uses JWT_SECRET env var when set', async () => {
      process.env.JWT_SECRET = 'my-jwt-secret';
      const token = jwt.sign({ memberId: 5, type: 'member' }, 'my-jwt-secret');

      mockPrisma.member.findUnique.mockResolvedValue(null);

      const req = makeMockReq({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = makeMockRes();

      await authenticateSession(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((req as AuthRequest).memberId).toBe(5);
    });

    it('falls back to SESSION_SECRET when JWT_SECRET not set', async () => {
      process.env.SESSION_SECRET = 'my-session-secret';
      const token = jwt.sign({ memberId: 5, type: 'member' }, 'my-session-secret');

      mockPrisma.member.findUnique.mockResolvedValue(null);

      const req = makeMockReq({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = makeMockRes();

      await authenticateSession(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((req as AuthRequest).memberId).toBe(5);
    });

    it('falls back to default "secret" when no env vars set', async () => {
      const token = jwt.sign({ memberId: 5, type: 'member' }, 'secret');

      mockPrisma.member.findUnique.mockResolvedValue(null);

      const req = makeMockReq({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = makeMockRes();

      await authenticateSession(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('JWT_SECRET takes priority over SESSION_SECRET', async () => {
      process.env.JWT_SECRET = 'jwt-secret';
      process.env.SESSION_SECRET = 'session-secret';
      const token = jwt.sign({ memberId: 5, type: 'member' }, 'jwt-secret');

      mockPrisma.member.findUnique.mockResolvedValue(null);

      const req = makeMockReq({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = makeMockRes();

      await authenticateSession(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('session takes priority over JWT', () => {
    it('uses session when both session and JWT are present', async () => {
      const sessionMember = { id: 1, email: 'session@test.com', firstName: 'Session', lastName: 'User', roles: ['MEMBER'] };
      const token = jwt.sign({ memberId: 99, type: 'member' }, JWT_SECRET);

      const req = makeMockReq({
        session: { member: sessionMember },
        headers: { authorization: `Bearer ${token}` },
      });
      const res = makeMockRes();

      await authenticateSession(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((req as AuthRequest).memberId).toBe(1); // Session member, not JWT
      expect((req as AuthRequest).member).toEqual(sessionMember);
    });
  });
});
