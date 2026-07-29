import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';
import { prisma } from '../index';

export interface AuthRequest extends Request {
  memberId?: number;
  userId?: number;
  /** Privilege-relinquished public-terminal mode (session or JWT). */
  kioskMode?: boolean;
  member?: {
    id: number;
    email: string | null;
    firstName: string;
    lastName: string;
    roles: string[];
  };
}

// Session-based authentication (for members)
export const authenticateSession = async (req: Request, res: Response, next: NextFunction) => {
  logger.debug('Checking session authentication', {
    method: req.method,
    path: req.path,
    hasAuthorizationHeader: !!req.headers.authorization,
  });

  // Check if session has member data
  if (req.session && req.session.member) {
    const member = req.session.member;
    (req as AuthRequest).memberId = member.id;
    (req as AuthRequest).member = member;
    (req as AuthRequest).kioskMode = req.session.kioskMode === true;
    logger.debug('Session authentication successful', {
      memberId: member.id,
      method: req.method,
      path: req.path,
      kioskMode: (req as AuthRequest).kioskMode === true,
    });
    return next();
  }

  // Fallback to JWT token authentication (for member tokens)
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    logger.warn('No session or token provided', { method: req.method, path: req.path });
    return res.status(401).json({
      error: 'Authentication required. Please log in again.',
      code: 'AUTHENTICATION_REQUIRED',
    });
  }

  try {
    const jwtSecret = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'secret';

    const decoded = jwt.verify(token, jwtSecret) as {
      memberId?: number;
      type?: string;
      kioskMode?: boolean;
    };

    // Handle member token
    if (decoded.type === 'member' && decoded.memberId) {
      (req as AuthRequest).memberId = decoded.memberId;
      (req as AuthRequest).kioskMode = decoded.kioskMode === true;

      // Try to fetch member data from database to populate req.member
      // This helps with role checks without requiring a database lookup in every route
      try {
        const member = await prisma.member.findUnique({
          where: { id: decoded.memberId },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            roles: true,
          },
        });

        if (member) {
          (req as AuthRequest).member = {
            id: member.id,
            email: member.email,
            firstName: member.firstName,
            lastName: member.lastName,
            roles: member.roles as string[],
          };
          logger.debug('JWT member authentication successful', {
            memberId: decoded.memberId,
            method: req.method,
            path: req.path,
            roles: member.roles,
            kioskMode: (req as AuthRequest).kioskMode === true,
          });
        } else {
          logger.warn('JWT member authentication successful but member not found in database', {
            memberId: decoded.memberId,
            method: req.method,
            path: req.path,
          });
        }
      } catch (dbError) {
        // If database lookup fails, still allow authentication with just memberId
        logger.warn('Failed to fetch member data from database', {
          error: dbError instanceof Error ? dbError.message : String(dbError),
          memberId: decoded.memberId,
        });
      }

      return next();
    }

    return res.status(401).json({
      error: 'Invalid token. Please log in again.',
      code: 'INVALID_TOKEN',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorName = error instanceof Error ? error.name : typeof error;
    const isExpired = errorName === 'TokenExpiredError';

    logger.warn('JWT token verification failed', {
      error: errorMessage,
      errorName,
      method: req.method,
      path: req.path,
      diagnostic: isExpired ? 'JWT token expired' : 'Invalid token',
    });
    return res.status(401).json({
      error: isExpired
        ? 'Your session has expired. Please log in again.'
        : 'Invalid token. Please log in again.',
      code: isExpired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
      details: process.env.DEBUG === 'true' ? errorMessage : undefined
    });
  }
};

// Legacy authenticate function (for backward compatibility)
export const authenticate = authenticateSession;
