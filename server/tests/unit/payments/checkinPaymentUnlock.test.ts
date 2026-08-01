/**
 * Check-in payment unlock token / session gate
 */
import jwt from 'jsonwebtoken';
import {
  clearSessionCheckinPaymentUnlock,
  createCheckinPaymentUnlockToken,
  hasCheckinPaymentUnlock,
  writeSessionCheckinPaymentUnlock,
} from '../../../src/utils/checkinPaymentUnlock';

function makeReq(overrides: {
  session?: Record<string, unknown> | null;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
} = {}): any {
  return {
    session: overrides.session === null ? undefined : (overrides.session ?? {}),
    body: overrides.body ?? {},
    headers: overrides.headers ?? {},
  };
}

describe('checkinPaymentUnlock', () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-checkin-unlock-secret';
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  describe('createCheckinPaymentUnlockToken', () => {
    it('returns a JWT for the member with ~15 minute expiry', () => {
      const before = Date.now();
      const { unlockToken, expiresAt } = createCheckinPaymentUnlockToken(97);
      const after = Date.now();

      expect(expiresAt).toBeGreaterThanOrEqual(before + 14 * 60 * 1000);
      expect(expiresAt).toBeLessThanOrEqual(after + 16 * 60 * 1000);

      const decoded = jwt.verify(unlockToken, 'test-checkin-unlock-secret') as {
        type: string;
        memberId: number;
      };
      expect(decoded).toEqual(
        expect.objectContaining({ type: 'checkin-payment', memberId: 97 }),
      );
    });
  });

  describe('session unlock helpers', () => {
    it('writes and clears session unlock', () => {
      const req = makeReq({ session: {} });
      writeSessionCheckinPaymentUnlock(req, { memberId: 10, expiresAt: Date.now() + 60_000 });
      expect(req.session.kioskPaymentUnlock).toEqual(
        expect.objectContaining({ memberId: 10 }),
      );
      clearSessionCheckinPaymentUnlock(req);
      expect(req.session.kioskPaymentUnlock).toBeUndefined();
    });

    it('no-ops when session is missing', () => {
      const req = makeReq({ session: null });
      expect(() =>
        writeSessionCheckinPaymentUnlock(req, { memberId: 1, expiresAt: Date.now() + 1000 }),
      ).not.toThrow();
      expect(() => clearSessionCheckinPaymentUnlock(req)).not.toThrow();
    });
  });

  describe('hasCheckinPaymentUnlock', () => {
    it('accepts a valid non-expired session unlock for the same member', () => {
      const req = makeReq({
        session: { kioskPaymentUnlock: { memberId: 42, expiresAt: Date.now() + 60_000 } },
      });
      expect(hasCheckinPaymentUnlock(req, 42)).toBe(true);
      expect(hasCheckinPaymentUnlock(req, 99)).toBe(false);
    });

    it('rejects expired session unlock', () => {
      const req = makeReq({
        session: { kioskPaymentUnlock: { memberId: 42, expiresAt: Date.now() - 1 } },
      });
      expect(hasCheckinPaymentUnlock(req, 42)).toBe(false);
    });

    it('accepts unlock token from body for the matching member', () => {
      const { unlockToken } = createCheckinPaymentUnlockToken(7);
      const req = makeReq({ body: { paymentUnlockToken: unlockToken } });
      expect(hasCheckinPaymentUnlock(req, 7)).toBe(true);
      expect(hasCheckinPaymentUnlock(req, 8)).toBe(false);
    });

    it('accepts unlock token from X-Checkin-Payment-Unlock header', () => {
      const { unlockToken } = createCheckinPaymentUnlockToken(11);
      const req = makeReq({
        headers: { 'x-checkin-payment-unlock': unlockToken },
      });
      expect(hasCheckinPaymentUnlock(req, 11)).toBe(true);
    });

    it('rejects missing, wrong-type, or invalid tokens', () => {
      expect(hasCheckinPaymentUnlock(makeReq(), 1)).toBe(false);

      const badType = jwt.sign(
        { type: 'member', memberId: 1 },
        'test-checkin-unlock-secret',
        { expiresIn: 60 },
      );
      expect(
        hasCheckinPaymentUnlock(makeReq({ body: { paymentUnlockToken: badType } }), 1),
      ).toBe(false);

      expect(
        hasCheckinPaymentUnlock(makeReq({ body: { paymentUnlockToken: 'not-a-jwt' } }), 1),
      ).toBe(false);
    });
  });
});
