import type { Response, NextFunction } from 'express';
import { prisma } from '../index';
import type { AuthRequest } from '../middleware/auth';
import { isAdmin } from './adminAccess';
import { isKioskMode } from './kioskMode';

function rolesOf(req: AuthRequest): string[] {
  return (req.member?.roles || []).map((r) => String(r).toUpperCase());
}

export function hasCoachRole(req: AuthRequest): boolean {
  if (isKioskMode(req)) return false;
  return rolesOf(req).includes('COACH');
}

export function hasPlayerRole(req: AuthRequest): boolean {
  if (isKioskMode(req)) return false;
  return rolesOf(req).includes('PLAYER');
}

export async function isCoach(req: AuthRequest): Promise<boolean> {
  if (isKioskMode(req)) return false;
  if (hasCoachRole(req)) return true;
  if (!req.memberId) return false;
  const member = await prisma.member.findUnique({
    where: { id: req.memberId },
    select: { roles: true },
  });
  return Boolean(member?.roles.some((role) => String(role).toUpperCase() === 'COACH'));
}

export async function canManageCoachProfile(req: AuthRequest, coachMemberId: number): Promise<boolean> {
  if (await isAdmin(req)) return true;
  return (await isCoach(req)) && req.memberId === coachMemberId;
}

export async function requireCoachOrAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if ((await isAdmin(req)) || (await isCoach(req))) {
    return next();
  }
  return res.status(403).json({ error: 'Coach or administrator access required' });
}

export function actorTypeFor(req: AuthRequest): 'ADMIN' | 'COACH' | 'PLAYER' {
  const roles = rolesOf(req);
  if (roles.includes('ADMIN') && !isKioskMode(req)) return 'ADMIN';
  if (roles.includes('COACH')) return 'COACH';
  return 'PLAYER';
}
