import jwt from 'jsonwebtoken';
import type { Request } from 'express';
import type { AuthRequest } from '../middleware/auth';

function getJwtSecret(): string {
  return process.env.JWT_SECRET || process.env.SESSION_SECRET || 'secret';
}

/**
 * Resolve kiosk mode from AuthRequest fields, session, or Bearer JWT.
 * Safe to call from routes that do not run authenticate middleware first.
 */
export function isKioskMode(req: Request | AuthRequest): boolean {
  const authReq = req as AuthRequest;
  if (authReq.kioskMode === true) {
    return true;
  }
  if (req.session?.kioskMode === true) {
    return true;
  }

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      if (!token) return false;
      const decoded = jwt.verify(token, getJwtSecret()) as { kioskMode?: boolean };
      return decoded.kioskMode === true;
    } catch {
      return false;
    }
  }

  return false;
}
