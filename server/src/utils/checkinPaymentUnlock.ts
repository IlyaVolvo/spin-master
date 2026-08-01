import jwt from 'jsonwebtoken';
import type { Request } from 'express';
import type { AuthRequest } from '../middleware/auth';

const UNLOCK_TTL_SEC = 15 * 60;

function getJwtSecret(): string {
  return process.env.JWT_SECRET || process.env.SESSION_SECRET || 'secret';
}

export type CheckinPaymentUnlock = {
  memberId: number;
  expiresAt: number;
};

export function createCheckinPaymentUnlockToken(memberId: number): {
  unlockToken: string;
  expiresAt: number;
} {
  const expiresAt = Date.now() + UNLOCK_TTL_SEC * 1000;
  const unlockToken = jwt.sign(
    {
      type: 'checkin-payment',
      memberId,
    },
    getJwtSecret(),
    { expiresIn: UNLOCK_TTL_SEC },
  );
  return { unlockToken, expiresAt };
}

export function writeSessionCheckinPaymentUnlock(
  req: Request,
  unlock: CheckinPaymentUnlock,
): void {
  if (!req.session) return;
  req.session.kioskPaymentUnlock = unlock;
}

export function clearSessionCheckinPaymentUnlock(req: Request): void {
  if (!req.session) return;
  delete req.session.kioskPaymentUnlock;
}

/**
 * True when staff has unlocked payment for this member via password
 * (session flag and/or unlockToken in body/header).
 */
export function hasCheckinPaymentUnlock(
  req: Request | AuthRequest,
  memberId: number,
): boolean {
  const now = Date.now();
  const sessionUnlock = req.session?.kioskPaymentUnlock;
  if (
    sessionUnlock &&
    sessionUnlock.memberId === memberId &&
    typeof sessionUnlock.expiresAt === 'number' &&
    sessionUnlock.expiresAt > now
  ) {
    return true;
  }

  const authReq = req as AuthRequest & { body?: { paymentUnlockToken?: unknown } };
  const fromBody =
    typeof authReq.body?.paymentUnlockToken === 'string'
      ? authReq.body.paymentUnlockToken
      : null;
  const fromHeaderRaw = req.headers['x-checkin-payment-unlock'];
  const fromHeader = typeof fromHeaderRaw === 'string' ? fromHeaderRaw : null;
  const token = fromBody || fromHeader;
  if (!token) return false;

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as {
      type?: string;
      memberId?: number;
    };
    return decoded.type === 'checkin-payment' && decoded.memberId === memberId;
  } catch {
    return false;
  }
}
