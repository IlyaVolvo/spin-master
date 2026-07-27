import jwt from 'jsonwebtoken';
import type { Request } from 'express';
import type { AuthRequest } from '../middleware/auth';

export const KIOSK_KINDS = ['checkin', 'browse', 'tournamentScore'] as const;
export type KioskKind = (typeof KIOSK_KINDS)[number];

export type KioskClaims = {
  kioskMode: boolean;
  kioskKind?: KioskKind;
  kioskTournamentId?: number;
};

function getJwtSecret(): string {
  return process.env.JWT_SECRET || process.env.SESSION_SECRET || 'secret';
}

export function isKioskKind(value: unknown): value is KioskKind {
  return typeof value === 'string' && (KIOSK_KINDS as readonly string[]).includes(value);
}

function readJwtKioskClaims(req: Request): KioskClaims | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const token = authHeader.split(' ')[1];
    if (!token) return null;
    const decoded = jwt.verify(token, getJwtSecret()) as {
      kioskMode?: boolean;
      kioskKind?: string;
      kioskTournamentId?: number;
    };
    if (decoded.kioskMode !== true) {
      return { kioskMode: false };
    }
    return {
      kioskMode: true,
      kioskKind: isKioskKind(decoded.kioskKind) ? decoded.kioskKind : undefined,
      kioskTournamentId:
        typeof decoded.kioskTournamentId === 'number' && Number.isFinite(decoded.kioskTournamentId)
          ? decoded.kioskTournamentId
          : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve kiosk mode from AuthRequest fields, session, or Bearer JWT.
 * Safe to call from routes that do not run authenticate middleware first.
 */
export function isKioskMode(req: Request | AuthRequest): boolean {
  return getKioskClaims(req).kioskMode;
}

export function getKioskClaims(req: Request | AuthRequest): KioskClaims {
  const authReq = req as AuthRequest;
  if (authReq.kioskMode === true) {
    return {
      kioskMode: true,
      kioskKind: isKioskKind(authReq.kioskKind) ? authReq.kioskKind : undefined,
      kioskTournamentId:
        typeof authReq.kioskTournamentId === 'number' ? authReq.kioskTournamentId : undefined,
    };
  }
  if (req.session?.kioskMode === true) {
    return {
      kioskMode: true,
      kioskKind: isKioskKind(req.session.kioskKind) ? req.session.kioskKind : undefined,
      kioskTournamentId:
        typeof req.session.kioskTournamentId === 'number' ? req.session.kioskTournamentId : undefined,
    };
  }
  return readJwtKioskClaims(req) ?? { kioskMode: false };
}

export function getKioskKind(req: Request | AuthRequest): KioskKind | undefined {
  return getKioskClaims(req).kioskKind;
}

/** Auto-relinquish default kind: browse if Organizer, else checkin if Admin. */
export function defaultKioskKindForRoles(roles: string[]): KioskKind | null {
  const upper = roles.map((r) => String(r).toUpperCase());
  if (upper.includes('ORGANIZER')) return 'browse';
  if (upper.includes('ADMIN')) return 'checkin';
  return null;
}

export function memberHasRole(roles: string[] | undefined, role: string): boolean {
  if (!Array.isArray(roles)) return false;
  const want = role.toUpperCase();
  return roles.some((r) => String(r).toUpperCase() === want);
}
