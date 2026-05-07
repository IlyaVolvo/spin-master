import { Response, NextFunction } from 'express';
import { prisma } from '../index';
import type { AuthRequest } from '../middleware/auth';
import { logger } from './logger';

export async function isAdmin(req: AuthRequest): Promise<boolean> {
  if (req.member && Array.isArray(req.member.roles)) {
    const hasAdminRole = req.member.roles.some(role => String(role).toUpperCase() === 'ADMIN');
    if (hasAdminRole) return true;
  }

  if (!req.memberId) return false;

  try {
    const member = await prisma.member.findUnique({
      where: { id: req.memberId },
      select: { roles: true },
    });
    return member?.roles.some(role => String(role).toUpperCase() === 'ADMIN') || false;
  } catch (error) {
    logger.error('Error checking admin status', {
      error: error instanceof Error ? error.message : String(error),
      memberId: req.memberId,
    });
    return false;
  }
}

export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  const hasAdminAccess = await isAdmin(req);
  if (!hasAdminAccess) {
    return res.status(403).json({ error: 'Administrator access required' });
  }
  return next();
}
