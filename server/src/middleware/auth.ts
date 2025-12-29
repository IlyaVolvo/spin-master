import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { prisma } from '../index';

export interface AuthRequest extends Request {
  memberId?: number;
  member?: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
    roles: string[];
  };
}

// Session-based authentication (for members)
export const authenticateSession = async (req: Request, res: Response, next: NextFunction) => {
  logger.info('Checking session authentication', {
    method: req.method,
    path: req.path,
    hasAuthorizationHeader: !!req.headers.authorization,
  });

  // Check if session has member data
  if (req.session && req.session.member) {
    const member = req.session.member;
    (req as AuthRequest).memberId = member.id;
    (req as AuthRequest).member = member;
    logger.info('Session authentication successful', { 
      memberId: member.id,
      method: req.method,
      path: req.path,
    });
    return next();
  }

  // Fallback to JWT token authentication (for member tokens)
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    logger.warn('No session or token provided', { method: req.method, path: req.path, headers: Object.keys(req.headers) });
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    // Use the same secret fallback logic as the login route
    const jwtSecret = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'secret';
    const secretSource = process.env.JWT_SECRET ? 'JWT_SECRET' : (process.env.SESSION_SECRET ? 'SESSION_SECRET' : 'default');
    
    // Create a hash of the secret for verification without exposing it
    const secretHash = crypto.createHash('sha256').update(jwtSecret).digest('hex').substring(0, 16);
    
    // Also hash the actual env vars to verify they're being read correctly
    const jwtSecretHash = process.env.JWT_SECRET ? crypto.createHash('sha256').update(process.env.JWT_SECRET).digest('hex').substring(0, 16) : 'NOT_SET';
    const sessionSecretHash = process.env.SESSION_SECRET ? crypto.createHash('sha256').update(process.env.SESSION_SECRET).digest('hex').substring(0, 16) : 'NOT_SET';
    const defaultSecretHash = crypto.createHash('sha256').update('secret').digest('hex').substring(0, 16);
    
    logger.info('Verifying JWT token', {
      method: req.method,
      path: req.path,
      secretSource: secretSource,
      jwtSecretSet: !!process.env.JWT_SECRET,
      sessionSecretSet: !!process.env.SESSION_SECRET,
      jwtSecretLength: process.env.JWT_SECRET?.length || 0,
      sessionSecretLength: process.env.SESSION_SECRET?.length || 0,
      secretLength: jwtSecret.length,
      secretHash: secretHash, // Hash of secret actually used
      jwtSecretHash: jwtSecretHash, // Hash of JWT_SECRET env var (if set)
      sessionSecretHash: sessionSecretHash, // Hash of SESSION_SECRET env var (if set)
      defaultSecretHash: defaultSecretHash, // Hash of default 'secret'
      usingDefault: jwtSecret === 'secret',
      tokenLength: token?.length,
      tokenPrefix: token?.substring(0, 20) + '...'
    });
    
    const decoded = jwt.verify(token, jwtSecret) as { memberId?: number; type?: string };
    
    // Handle member token
    if (decoded.type === 'member' && decoded.memberId) {
      (req as AuthRequest).memberId = decoded.memberId;
      
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
      logger.info('JWT member authentication successful with member data', { 
        memberId: decoded.memberId,
        method: req.method,
        path: req.path,
        roles: member.roles,
        secretSource: secretSource,
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
      
      logger.info('JWT member authentication successful', { 
        memberId: decoded.memberId,
        method: req.method,
        path: req.path,
        secretSource: secretSource,
      });
      return next();
    }

    return res.status(401).json({ error: 'Invalid token' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const jwtSecret = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'secret';
    const secretSource = process.env.JWT_SECRET ? 'JWT_SECRET' : (process.env.SESSION_SECRET ? 'SESSION_SECRET' : 'default');
    
    // Create a hash of the secret for verification without exposing it
    const secretHash = crypto.createHash('sha256').update(jwtSecret).digest('hex').substring(0, 16);
    
    logger.warn('JWT token verification failed', {
      error: errorMessage,
      errorName: error instanceof Error ? error.name : typeof error,
      method: req.method,
      path: req.path,
      hasToken: !!token,
      tokenLength: token?.length,
      tokenPrefix: token?.substring(0, 30) + '...',
      secretSource: secretSource,
      jwtSecretSet: !!process.env.JWT_SECRET,
      sessionSecretSet: !!process.env.SESSION_SECRET,
      secretLength: jwtSecret.length,
      secretHash: secretHash, // Hash to verify same secret is used
      usingDefault: jwtSecret === 'secret',
      diagnostic: 'Token was signed with a different secret than the one used for verification. Compare secretHash between token creation and verification logs.'
    });
    return res.status(401).json({ 
      error: 'Invalid token',
      details: process.env.DEBUG === 'true' ? errorMessage : undefined
    });
  }
};

// Legacy authenticate function (for backward compatibility)
export const authenticate = authenticateSession;


