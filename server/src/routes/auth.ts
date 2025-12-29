import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { body, validationResult } from 'express-validator';
import { prisma } from '../index';
import { logger } from '../utils/logger';

const router = express.Router();

// Member login (email/password) - Session-based
router.post('/member/login', [
  body('email').isEmail(),
  body('password').notEmpty(),
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    const member = await prisma.member.findUnique({
      where: { email },
    });

    if (!member) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if password is empty (admin reset) - allow login but force password setup
    if (member.password === '') {
      // Password is empty, user must set a new password
      // Set mustResetPassword to true and allow login
      await prisma.member.update({
        where: { id: member.id },
        data: { mustResetPassword: true },
      });
      // Continue with login flow - user will be prompted to set password
    } else {
      // Verify password normally
      const isValid = await bcrypt.compare(password, member.password);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
    }

    // Debug: Log member data structure
    logger.debug('Member found for login', { 
      memberId: member.id, 
      email: member.email,
      rolesType: typeof member.roles,
      rolesIsArray: Array.isArray(member.roles),
      rolesValue: member.roles
    });

    // Store member data in session
    // Ensure session exists
    if (!req.session) {
      logger.error('Session not available', { email, sessionType: typeof req.session });
      return res.status(500).json({ error: 'Session not initialized' });
    }
    
    // Prisma returns roles as string array, but ensure they're serializable
    let rolesArray: string[] = [];
    try {
      if (Array.isArray(member.roles)) {
        rolesArray = member.roles.map(role => String(role));
      } else if (member.roles) {
        rolesArray = [String(member.roles)];
      }
    } catch (rolesError) {
      logger.error('Error processing roles', { 
        error: rolesError instanceof Error ? rolesError.message : String(rolesError),
        roles: member.roles 
      });
      rolesArray = [];
    }
    
    logger.debug('About to store session data', { 
      memberId: member.id, 
      email, 
      rolesCount: rolesArray.length,
      sessionId: req.sessionID,
      hasSession: !!req.session
    });
    
    // Store member data in session - use a simple, serializable object
    // Wrap in try-catch so login can still succeed even if session fails
    let sessionStored = false;
    try {
      const sessionMemberData: any = {
        id: Number(member.id),
        email: String(member.email),
        firstName: String(member.firstName),
        lastName: String(member.lastName),
        roles: rolesArray,
      };
      
      // Try to assign to session
      if (req.session) {
        (req.session as any).member = sessionMemberData;
        sessionStored = true;
        logger.debug('Session data assigned successfully', { memberId: member.id });
        
        // Note: express-session will automatically save the session when the response is sent
        // We don't need to manually save it here, but we can if needed for debugging
      } else {
        logger.warn('Session not available for storage', { memberId: member.id });
      }
      
    } catch (sessionError) {
      logger.error('Error storing session data', { 
        error: sessionError instanceof Error ? sessionError.message : String(sessionError),
        stack: sessionError instanceof Error ? sessionError.stack : undefined,
        memberId: member.id
      });
      // Continue - we'll still send the JWT token even if session fails
      sessionStored = false;
    }

    // Also create a JWT token for backward compatibility (optional, can be removed later)
    let token: string;
    try {
      const jwtSecret = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'secret';
      const secretSource = process.env.JWT_SECRET ? 'JWT_SECRET' : (process.env.SESSION_SECRET ? 'SESSION_SECRET' : 'default');
      
      // Create a hash of the secret for verification without exposing it
      const secretHash = crypto.createHash('sha256').update(jwtSecret).digest('hex').substring(0, 16);
      
      // Also hash the actual env vars to verify they're being read correctly
      const jwtSecretHash = process.env.JWT_SECRET ? crypto.createHash('sha256').update(process.env.JWT_SECRET).digest('hex').substring(0, 16) : 'NOT_SET';
      const sessionSecretHash = process.env.SESSION_SECRET ? crypto.createHash('sha256').update(process.env.SESSION_SECRET).digest('hex').substring(0, 16) : 'NOT_SET';
      const defaultSecretHash = crypto.createHash('sha256').update('secret').digest('hex').substring(0, 16);
      
      logger.info('Creating JWT token', {
        memberId: member.id,
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
        usingWeakSecret: jwtSecret === 'your-secret-key-change-in-production'
      });
      
      if (!jwtSecret || jwtSecret === 'your-secret-key-change-in-production' || jwtSecret === 'secret') {
        logger.warn('Using default/weak JWT secret - should be changed in production', { 
          memberId: member.id,
          secretSource: secretSource
        });
      }
      token = jwt.sign(
        { memberId: member.id, type: 'member' },
        jwtSecret,
        { expiresIn: '7d' }
      );
      
      logger.info('JWT token created successfully', {
        memberId: member.id,
        secretSource: secretSource,
        tokenLength: token.length,
        tokenPrefix: token.substring(0, 20) + '...'
      });
    } catch (jwtError) {
      logger.error('Error creating JWT token', { 
        error: jwtError instanceof Error ? jwtError.message : String(jwtError),
        memberId: member.id,
        jwtSecretSet: !!process.env.JWT_SECRET,
        sessionSecretSet: !!process.env.SESSION_SECRET
      });
      // Continue without token - session-based auth should still work
      token = '';
    }

    // Exclude password from response and ensure all fields are serializable
    const { password: _, ...memberWithoutPassword } = member;
    
    // Ensure member object is JSON-serializable
    // Convert all potential non-serializable values to strings/primitives
    const safeMember = {
      id: Number(memberWithoutPassword.id),
      email: String(memberWithoutPassword.email),
      firstName: String(memberWithoutPassword.firstName),
      lastName: String(memberWithoutPassword.lastName),
      birthDate: memberWithoutPassword.birthDate ? new Date(memberWithoutPassword.birthDate).toISOString() : null,
      isActive: Boolean(memberWithoutPassword.isActive),
      rating: memberWithoutPassword.rating !== null ? Number(memberWithoutPassword.rating) : null,
      gender: String(memberWithoutPassword.gender),
      roles: rolesArray, // Already processed as string array
      phone: memberWithoutPassword.phone ? String(memberWithoutPassword.phone) : null,
      address: memberWithoutPassword.address ? String(memberWithoutPassword.address) : null,
      picture: memberWithoutPassword.picture ? String(memberWithoutPassword.picture) : null,
      mustResetPassword: Boolean(memberWithoutPassword.mustResetPassword || false),
      createdAt: memberWithoutPassword.createdAt ? new Date(memberWithoutPassword.createdAt).toISOString() : null,
      updatedAt: memberWithoutPassword.updatedAt ? new Date(memberWithoutPassword.updatedAt).toISOString() : null,
    };
    
    logger.info('Member logged in', { 
      memberId: member.id, 
      email: member.email,
      tokenCreated: !!token,
      tokenLength: token?.length || 0,
    });
    
    // Send response - express-session will automatically save the session
    const response = { 
      token, // Keep for backward compatibility
      member: safeMember,
      sessionId: req.sessionID || null,
    };
    
    logger.info('Sending login response', {
      memberId: member.id,
      hasToken: !!response.token,
      tokenLength: response.token?.length || 0,
      hasMember: !!response.member,
      hasSessionId: !!response.sessionId,
    });
    
    res.json(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    logger.error('Member login error', { 
      error: errorMessage,
      stack: errorStack,
      email: req.body?.email,
      errorType: error?.constructor?.name || typeof error
    });
    
    // Log to console in development for easier debugging
    if (process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development') {
      console.error('Login error details:', error);
    }
    
    res.status(500).json({ 
      error: 'Internal server error',
      message: errorMessage,
      ...(process.env.DEBUG === 'true' && { stack: errorStack })
    });
  }
});

// Member change password (requires member authentication)
router.post('/member/change-password', [
  body('currentPassword').optional(), // Optional if password is empty (admin reset)
  body('newPassword').isLength({ min: 6 }),
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Get memberId from session
    let memberId = req.session?.member?.id;
    
    if (!memberId) {
      // Fallback to JWT token for backward compatibility
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const token = authHeader.split(' ')[1];
      // Use the same secret fallback logic as token creation
      const jwtSecret = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'secret';
      const secretSource = process.env.JWT_SECRET ? 'JWT_SECRET' : (process.env.SESSION_SECRET ? 'SESSION_SECRET' : 'default');
      
      // Create a hash of the secret for verification without exposing it
      const secretHash = crypto.createHash('sha256').update(jwtSecret).digest('hex').substring(0, 16);
      
      logger.info('Verifying JWT token in reset password route', {
        secretSource: secretSource,
        jwtSecretSet: !!process.env.JWT_SECRET,
        sessionSecretSet: !!process.env.SESSION_SECRET,
        secretLength: jwtSecret.length,
        secretHash: secretHash, // Hash to verify same secret is used
        tokenLength: token?.length
      });
      
      const decoded = jwt.verify(token, jwtSecret) as { memberId?: number; type?: string };
      
      if (decoded.type !== 'member' || !decoded.memberId) {
        return res.status(401).json({ error: 'Invalid token type' });
      }

      memberId = decoded.memberId;
    }

    const { currentPassword, newPassword } = req.body;

    const member = await prisma.member.findUnique({
      where: { id: memberId },
    });

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // If password is empty (admin reset), skip current password check
    if (member.password !== '') {
      // Password exists, require current password
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password is required' });
      }
      const isValid = await bcrypt.compare(currentPassword, member.password);
      if (!isValid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
    }
    // If password is empty, allow password change without current password

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.member.update({
      where: { id: memberId },
      data: { 
        password: hashedPassword,
        mustResetPassword: false, // Clear the reset flag after password change
      },
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    logger.error('Member change password error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin reset member password (requires admin authentication) - Session-based
router.post('/member/:id/reset-password', [
  body('newPassword').optional().isLength({ min: 6 }),
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Check if session has admin member
    const sessionMember = req.session?.member;
    
    if (!sessionMember || !sessionMember.roles || !sessionMember.roles.includes('ADMIN')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const memberId = parseInt(req.params.id);
    if (isNaN(memberId)) {
      return res.status(400).json({ error: 'Invalid member ID' });
    }

    const { newPassword } = req.body;
    
    // If newPassword is provided, use it; otherwise, set password to empty string to force setup
    if (newPassword) {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await prisma.member.update({
        where: { id: memberId },
        data: { 
          password: hashedPassword,
          mustResetPassword: false, // Password is set, no need to reset
        },
      });
    } else {
      // Set password to empty string - this will force password setup on next login
      await prisma.member.update({
        where: { id: memberId },
        data: { 
          password: '', // Empty password forces password setup
          mustResetPassword: true, // Force password reset on next login
        },
      });
    }

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    logger.error('Member password reset error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Member logout - destroys session
router.post('/member/logout', async (req: Request, res: Response) => {
  try {
    const memberId = req.session?.member?.id;
    
    req.session.destroy((err) => {
      if (err) {
        logger.error('Session destroy error', { error: err instanceof Error ? err.message : String(err) });
        return res.status(500).json({ error: 'Failed to logout' });
      }
      
      res.clearCookie('spin-master.sid');
      logger.info('Member logged out', { memberId });
      res.json({ message: 'Logged out successfully' });
    });
  } catch (error) {
    logger.error('Logout error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current session info (supports both session and JWT token authentication)
router.get('/member/me', async (req: Request, res: Response) => {
  try {
    let memberId: number | null = null;

    // Check session-based auth first
    if (req.session && req.session.member) {
      memberId = req.session.member.id;
    } else {
      // Fallback to JWT token authentication
      const authHeader = req.headers.authorization;
      if (authHeader) {
        try {
          const token = authHeader.split(' ')[1];
          // Use the same secret fallback logic as token creation
          const jwtSecret = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'secret';
          const decoded = jwt.verify(token, jwtSecret) as { memberId?: number; type?: string };
          
          if (decoded.type === 'member' && decoded.memberId !== undefined) {
            memberId = decoded.memberId;
          }
        } catch (jwtError) {
          // JWT verification failed, continue to return 401
          logger.warn('JWT token verification failed in /member/me', {
            error: jwtError instanceof Error ? jwtError.message : String(jwtError)
          });
        }
      }
    }

    if (memberId !== null) {
      // Fetch fresh member data from database
      const fullMember = await prisma.member.findUnique({
        where: { id: memberId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          roles: true,
          birthDate: true,
          gender: true,
          rating: true,
          isActive: true,
          phone: true,
          address: true,
          picture: true,
        },
      });

      if (!fullMember) {
        // Member was deleted, destroy session if it exists
        if (req.session) {
          req.session.destroy(() => {});
        }
        return res.status(404).json({ error: 'Member not found' });
      }

      return res.json({ member: fullMember });
    }

    return res.status(401).json({ error: 'Not authenticated' });
  } catch (error) {
    logger.error('Get current member error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;



