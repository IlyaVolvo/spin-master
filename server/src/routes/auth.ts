import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { body, validationResult } from 'express-validator';
import { prisma } from '../index';
import { logger } from '../utils/logger';
import { normalizeMemberEmail } from '../utils/memberValidation';
import { getAuthPolicyConfig } from '../services/systemConfigService';
import type { AuthRequest } from '../middleware/auth';
import { isKioskMode } from '../utils/kioskMode';
import { isAdmin } from '../utils/adminAccess';
import { isOrganizer } from '../utils/organizerAccess';
import {
  getAutoRelinquishIdleMinutes,
  resolveAutoRelinquishPrivileges,
  shouldAutoEnterKioskMode,
} from '../utils/autoRelinquish';

const router = express.Router();

function getJwtSecret(): string {
  return process.env.JWT_SECRET || process.env.SESSION_SECRET || 'secret';
}

function signMemberToken(memberId: number, kioskMode: boolean): string {
  return jwt.sign(
    { memberId, type: 'member', ...(kioskMode ? { kioskMode: true } : {}) },
    getJwtSecret(),
    { expiresIn: '7d' }
  );
}

function saveSessionAsync(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!req.session) {
      resolve();
      return;
    }
    req.session.save((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function asBool(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function parseSmtpPort(value: string | undefined, fallback = 587): number {
  if (!value) return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid SMTP_PORT: ${value}`);
  }
  return port;
}

function getClientBaseUrl(): string {
  return (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function generatePasswordResetToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function getPasswordResetExpiryDate(): Date {
  const { passwordResetTokenTtlHours } = getAuthPolicyConfig();
  return new Date(Date.now() + passwordResetTokenTtlHours * 60 * 60 * 1000);
}

function passwordMeetsPolicy(value: unknown): boolean {
  const { minimumPasswordLength } = getAuthPolicyConfig();
  if (typeof value !== 'string' || value.length < minimumPasswordLength) {
    throw new Error(`Password must be at least ${minimumPasswordLength} characters long`);
  }
  return true;
}

function buildResetLink(email: string, token: string): string {
  return `${getClientBaseUrl()}/login?reset=1&email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
}

async function sendPasswordResetEmail(params: {
  toEmail: string;
  firstName: string;
  resetLink: string;
  expiresAt: Date;
}): Promise<void> {
  const host = process.env.SMTP_HOST?.trim();
  const port = parseSmtpPort(process.env.SMTP_PORT, 587);
  const secure = process.env.SMTP_SECURE ? asBool(process.env.SMTP_SECURE) : port === 465;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim() || user;

  if (!host) {
    throw new Error('SMTP_HOST is not set. Unable to send password reset email.');
  }
  if (!from) {
    throw new Error('SMTP_FROM or SMTP_USER must be set. Unable to send password reset email.');
  }
  if ((user && !pass) || (!user && pass)) {
    throw new Error('SMTP_USER and SMTP_PASS must both be provided when using SMTP auth.');
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
    requireTLS: asBool(process.env.SMTP_REQUIRE_TLS, false),
    ignoreTLS: asBool(process.env.SMTP_IGNORE_TLS, false),
    tls: {
      rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED
        ? asBool(process.env.SMTP_TLS_REJECT_UNAUTHORIZED)
        : true,
    },
  });

  await transporter.verify();

  const subject = 'Spin Master Password Reset';
  const text = [
    `Hi ${params.firstName},`,
    '',
    'A password reset was requested for your Spin Master account.',
    'Use the link below to reset your password:',
    params.resetLink,
    '',
    `This link expires at ${params.expiresAt.toISOString()}.`,
    'If you did not request this reset, please ignore this email.',
  ].join('\n');

  const html = `
    <p>Hi ${params.firstName},</p>
    <p>A password reset was requested for your Spin Master account.</p>
    <p><a href="${params.resetLink}">Reset your password</a></p>
    <p>This link expires at <strong>${params.expiresAt.toISOString()}</strong>.</p>
    <p>If you did not request this reset, you can ignore this email.</p>
  `;

  await transporter.sendMail({
    from,
    to: params.toEmail,
    subject,
    text,
    html,
  });
}

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
    const loginEmail = normalizeMemberEmail(typeof email === 'string' ? email : '');

    const member = await prisma.member.findUnique({
      where: { email: loginEmail },
    });

    if (!member) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!member.isActive) {
      return res.status(403).json({ error: 'Member account is inactive' });
    }

    if (!member.email) {
      return res
        .status(403)
        .json({ error: 'This account has no email on file and cannot log in. Contact an administrator.' });
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
    
    // Store member data in session - ensure it's properly saved before proceeding
    let sessionStored = false;
    const autoOverrideOnLogin =
      (member as { autoRelinquishPrivileges?: boolean | null }).autoRelinquishPrivileges ?? null;
    const loginKioskMode = shouldAutoEnterKioskMode({
      roles: rolesArray,
      autoRelinquishPrivileges: autoOverrideOnLogin,
    });
    try {
      const sessionMemberData: any = {
        id: Number(member.id),
        email: String(member.email),
        firstName: String(member.firstName),
        lastName: String(member.lastName),
        roles: rolesArray,
      };
      
      // Ensure session exists and store data
      if (req.session) {
        req.session.member = sessionMemberData;
        req.session.kioskMode = loginKioskMode;
        
        // Wait for session to be saved before proceeding
        await new Promise<void>((resolve, reject) => {
          req.session!.save((err) => {
            if (err) {
              logger.error('Session save failed', { 
                error: err.message,
                memberId: member.id
              });
              reject(err);
            } else {
              sessionStored = true;
              logger.debug('Session saved successfully', { memberId: member.id, kioskMode: loginKioskMode });
              resolve();
            }
          });
        });
      } else {
        logger.warn('Session not available for storage', { memberId: member.id });
      }
      
    } catch (sessionError) {
      logger.error('Error storing session data', { 
        error: sessionError instanceof Error ? sessionError.message : String(sessionError),
        stack: sessionError instanceof Error ? sessionError.stack : undefined,
        memberId: member.id
      });
      // If session fails, we cannot continue with login
      return res.status(500).json({ error: 'Session storage failed' });
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
      token = signMemberToken(member.id, loginKioskMode);
      
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

    // Exclude password / PIN from response and ensure all fields are serializable
    const { password: _, scorePin: __pin, ...memberWithoutPassword } = member as typeof member & {
      scorePin?: string;
      autoRelinquishPrivileges?: boolean | null;
    };
    const memberRecord = memberWithoutPassword as typeof memberWithoutPassword & {
      emailConfirmedAt?: Date | null;
      autoRelinquishPrivileges?: boolean | null;
    };
    
    // Ensure member object is JSON-serializable
    // Convert all potential non-serializable values to strings/primitives
    const safeMember = {
      id: Number(memberRecord.id),
      email: String(memberRecord.email),
      firstName: String(memberRecord.firstName),
      lastName: String(memberRecord.lastName),
      birthDate: memberRecord.birthDate ? new Date(memberRecord.birthDate).toISOString() : null,
      isActive: Boolean(memberRecord.isActive),
      emailConfirmedAt: memberRecord.emailConfirmedAt ? new Date(memberRecord.emailConfirmedAt).toISOString() : null,
      rating: memberRecord.rating !== null ? Number(memberRecord.rating) : null,
      gender: String(memberRecord.gender),
      roles: rolesArray, // Already processed as string array
      phone: memberRecord.phone ? String(memberRecord.phone) : null,
      address: memberRecord.address ? String(memberRecord.address) : null,
      picture: memberRecord.picture ? String(memberRecord.picture) : null,
      mustResetPassword: Boolean(memberRecord.mustResetPassword || false),
      hasPassword: member.password !== '',
      createdAt: memberRecord.createdAt ? new Date(memberRecord.createdAt).toISOString() : null,
      updatedAt: memberRecord.updatedAt ? new Date(memberRecord.updatedAt).toISOString() : null,
      kioskMode: loginKioskMode,
      autoRelinquishPrivilegesOverride: autoOverrideOnLogin,
      autoRelinquishPrivileges: resolveAutoRelinquishPrivileges(autoOverrideOnLogin),
      autoRelinquishIdleMinutes: getAutoRelinquishIdleMinutes(),
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

// Forgot password - generate reset token and send email
router.post('/member/forgot-password', [
  body('email').isEmail(),
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body as { email: string };
    const normalizedEmail = normalizeMemberEmail(email);

    const member = await prisma.member.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, firstName: true },
    });

    if (!member) {
      // Prevent email enumeration
      return res.json({ message: 'If this email exists, a reset link has been sent.' });
    }

    const addressForEmail = member.email ?? normalizedEmail;

    const token = generatePasswordResetToken();
    const expiresAt = getPasswordResetExpiryDate();
    const resetLink = buildResetLink(addressForEmail, token);

    await prisma.member.update({
      where: { id: member.id },
      data: {
        passwordResetToken: token,
        passwordResetTokenExpiry: expiresAt,
        mustResetPassword: true,
      },
    });

    await sendPasswordResetEmail({
      toEmail: addressForEmail,
      firstName: member.firstName,
      resetLink,
      expiresAt,
    });

    logger.info('Forgot password email sent', {
      memberId: member.id,
      email: addressForEmail,
      expiresAt: expiresAt.toISOString(),
    });

    return res.json({
      message: 'If this email exists, a reset link has been sent.',
      ...(process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development'
        ? { resetToken: token }
        : {}),
    });
  } catch (error) {
    logger.error('Forgot password error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Keep same shape to avoid account enumeration leaks
    return res.json({ message: 'If this email exists, a reset link has been sent.' });
  }
});

// Reset password with token
router.post('/member/reset-password-with-token', [
  body('email').isEmail(),
  body('token').notEmpty(),
  body('newPassword').custom(passwordMeetsPolicy),
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, token, newPassword } = req.body as {
      email: string;
      token: string;
      newPassword: string;
    };

    const normalizedEmail = normalizeMemberEmail(email);

    const member = await prisma.member.findFirst({
      where: { passwordResetToken: token },
      select: {
        id: true,
        email: true,
        passwordResetToken: true,
        passwordResetTokenExpiry: true,
      },
    });

    if (!member || !member.passwordResetToken || !member.passwordResetTokenExpiry || member.passwordResetTokenExpiry.getTime() < Date.now()) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    if (member.email !== normalizedEmail) {
      logger.warn('Reset token used with non-matching email input', {
        memberId: member.id,
        tokenEmail: member.email,
        providedEmail: normalizedEmail,
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.member.update({
      where: { id: member.id },
      data: {
        password: hashedPassword,
        isActive: true,
        emailConfirmedAt: new Date(),
        mustResetPassword: false,
        passwordResetToken: null,
        passwordResetTokenExpiry: null,
      } as any,
    });

    logger.info('Password reset via token successful', { memberId: member.id });
    return res.json({ message: 'Password has been reset successfully' });
  } catch (error) {
    logger.error('Reset password with token error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Member change password (requires member authentication)
router.post('/member/validate-current-password', [
  body('currentPassword').optional(),
], async (req: Request, res: Response) => {
  try {
    if (isKioskMode(req)) {
      return res.status(403).json({ error: 'Password changes are not available in kiosk mode. Ask a system administrator to reset the password.' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    let memberId = req.session?.member?.id;

    if (!memberId) {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const token = authHeader.split(' ')[1];
      if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      try {
        const jwtSecret = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'secret';
        const decoded = jwt.verify(token, jwtSecret) as { memberId?: number; type?: string };

        if (decoded.type !== 'member' || !decoded.memberId) {
          return res.status(401).json({ error: 'Invalid token type' });
        }

        memberId = decoded.memberId;
      } catch (jwtError) {
        logger.warn('Validate current password JWT verification failed', {
          error: jwtError instanceof Error ? jwtError.message : String(jwtError),
        });
        return res.status(401).json({ error: 'Authentication required' });
      }
    }

    const member = await prisma.member.findUnique({ where: { id: memberId } });
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // If password is empty (admin-reset scenario), no current password validation is required.
    if (member.password === '') {
      return res.json({ valid: true });
    }

    const currentPassword = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
    if (!currentPassword) {
      return res.json({ valid: false, error: 'Current password is required' });
    }

    const isValid = await bcrypt.compare(currentPassword, member.password);
    if (!isValid) {
      return res.json({ valid: false, error: 'Current password is incorrect' });
    }

    return res.json({ valid: true });
  } catch (error) {
    logger.error('Validate current password error', { error: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Member change password (requires member authentication)
router.post('/member/change-password', [
  body('currentPassword').optional(), // Optional if password is empty (admin reset)
  body('newPassword').custom(passwordMeetsPolicy),
], async (req: Request, res: Response) => {
  try {
    if (isKioskMode(req)) {
      return res.status(403).json({ error: 'Password changes are not available in kiosk mode. Ask a system administrator to reset the password.' });
    }

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
        isActive: true,
        emailConfirmedAt: new Date(),
        mustResetPassword: false, // Clear the reset flag after password change
      } as any,
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    logger.error('Member change password error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin reset member password (requires admin authentication) - Session-based
router.post('/member/:id/reset-password', [
  body('email').optional().isEmail(),
  body('newPassword').optional().custom(passwordMeetsPolicy),
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Admin auth check: support both session-based auth and JWT fallback
    const sessionMember = req.session?.member;
    const hasSessionAdmin = !!(sessionMember && Array.isArray(sessionMember.roles) && sessionMember.roles.includes('ADMIN'));

    let hasAdminAccess = hasSessionAdmin;

    if (!hasAdminAccess) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        try {
          const token = authHeader.split(' ')[1];
          const jwtSecret = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'secret';
          const decoded = jwt.verify(token, jwtSecret) as { memberId?: number; type?: string };

          if (decoded.type === 'member' && decoded.memberId !== undefined) {
            const requester = await prisma.member.findUnique({
              where: { id: decoded.memberId },
              select: { roles: true, isActive: true },
            });

            hasAdminAccess = !!(requester && requester.isActive && Array.isArray(requester.roles) && requester.roles.includes('ADMIN'));
          }
        } catch (jwtError) {
          logger.warn('Admin reset password JWT verification failed', {
            error: jwtError instanceof Error ? jwtError.message : String(jwtError),
          });
        }
      }
    }

    if (!hasAdminAccess) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const memberId = parseInt(req.params.id);
    if (isNaN(memberId)) {
      return res.status(400).json({ error: 'Invalid member ID' });
    }

    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, email: true, firstName: true },
    });

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    const { newPassword } = req.body;
    const requestedEmail = req.body.email ? String(req.body.email).trim().toLowerCase() : null;
    
    // If newPassword is provided, set it directly; otherwise force password setup and email reset link
    if (newPassword) {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await prisma.member.update({
        where: { id: memberId },
        data: { 
          password: hashedPassword,
          mustResetPassword: false, // Password is set, no need to reset
          passwordResetToken: null,
          passwordResetTokenExpiry: null,
        },
      });

      return res.json({ message: 'Password reset successfully' });
    } else {
      // Set password to empty string and send reset link for immediate setup
      const token = generatePasswordResetToken();
      const expiresAt = getPasswordResetExpiryDate();
      const recipientEmail = requestedEmail || member.email;
      if (!recipientEmail) {
        return res.status(400).json({
          error: 'This member has no email address. Add an email before sending a password setup link.',
        });
      }
      const resetLink = buildResetLink(recipientEmail, token);

      await prisma.member.update({
        where: { id: memberId },
        data: { 
          password: '', // Empty password forces password setup
          mustResetPassword: true, // Force password reset on next login
          passwordResetToken: token,
          passwordResetTokenExpiry: expiresAt,
        },
      });

      try {
        await sendPasswordResetEmail({
          toEmail: recipientEmail,
          firstName: member.firstName,
          resetLink,
          expiresAt,
        });
      } catch (emailError) {
        logger.error('Admin reset password email send failed', {
          memberId,
          email: recipientEmail,
          error: emailError instanceof Error ? emailError.message : String(emailError),
        });

        return res.status(500).json({
          error: 'Password was reset but failed to send reset email. Check SMTP settings.',
          ...(process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development'
            ? { resetToken: token }
            : {}),
        });
      }

      return res.json({
        message: `Password reset successfully and reset link email sent to ${recipientEmail}`,
        ...(process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development'
          ? { resetToken: token }
          : {}),
      });
    }
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
    let kioskMode = false;

    // Check session-based auth first
    if (req.session && req.session.member) {
      memberId = req.session.member.id;
      kioskMode = req.session.kioskMode === true;
    } else {
      // Fallback to JWT token authentication
      const authHeader = req.headers.authorization;
      if (authHeader) {
        try {
          const token = authHeader.split(' ')[1];
          // Use the same secret fallback logic as token creation
          const jwtSecret = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'secret';
          const decoded = jwt.verify(token, jwtSecret) as {
            memberId?: number;
            type?: string;
            kioskMode?: boolean;
          };
          
          if (decoded.type === 'member' && decoded.memberId !== undefined) {
            memberId = decoded.memberId;
            kioskMode = decoded.kioskMode === true;
          }
        } catch (jwtError) {
          const isExpired = jwtError instanceof Error && jwtError.name === 'TokenExpiredError';
          logger.warn('JWT token verification failed in /member/me', {
            error: jwtError instanceof Error ? jwtError.message : String(jwtError),
            errorName: jwtError instanceof Error ? jwtError.name : typeof jwtError,
          });
          return res.status(401).json({
            error: isExpired
              ? 'Your session has expired. Please log in again.'
              : 'Invalid token. Please log in again.',
            code: isExpired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
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
          mustResetPassword: true,
          tournamentNotificationsEnabled: true,
          emailConfirmedAt: true,
          password: true,
          autoRelinquishPrivileges: true,
        },
      });

      if (!fullMember) {
        // Member was deleted, destroy session if it exists
        if (req.session) {
          req.session.destroy(() => {});
        }
        return res.status(404).json({ error: 'Member not found' });
      }

      const { password, autoRelinquishPrivileges: autoOverride, ...memberWithoutPassword } = fullMember;
      return res.json({
        member: {
          ...memberWithoutPassword,
          birthDate: memberWithoutPassword.birthDate
            ? new Date(memberWithoutPassword.birthDate).toISOString()
            : null,
          emailConfirmedAt: memberWithoutPassword.emailConfirmedAt
            ? new Date(memberWithoutPassword.emailConfirmedAt).toISOString()
            : null,
          hasPassword: password !== '',
          kioskMode,
          autoRelinquishPrivilegesOverride: autoOverride,
          autoRelinquishPrivileges: resolveAutoRelinquishPrivileges(autoOverride),
          autoRelinquishIdleMinutes: getAutoRelinquishIdleMinutes(),
        },
      });
    }

    return res.status(401).json({
      error: 'Not authenticated. Please log in again.',
      code: 'AUTHENTICATION_REQUIRED',
    });
  } catch (error) {
    logger.error('Get current member error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Relinquish Organizer/Admin privileges for public-terminal (kiosk) use.
 * Session stays authenticated as the same member with elevated actions disabled.
 */
router.post('/member/relinquish-privileges', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    let memberId = req.session?.member?.id ?? authReq.memberId;

    if (!memberId) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        try {
          const decoded = jwt.verify(authHeader.split(' ')[1], getJwtSecret()) as {
            memberId?: number;
            type?: string;
            kioskMode?: boolean;
          };
          if (decoded.type === 'member' && decoded.memberId) {
            memberId = decoded.memberId;
            authReq.memberId = decoded.memberId;
            authReq.kioskMode = decoded.kioskMode === true;
          }
        } catch {
          return res.status(401).json({ error: 'Authentication required' });
        }
      }
    }

    if (!memberId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (isKioskMode(authReq) || req.session?.kioskMode === true) {
      return res.status(400).json({ error: 'Already in kiosk mode' });
    }

    // Populate roles for elevated check if needed
    if (!authReq.member) {
      const member = await prisma.member.findUnique({
        where: { id: memberId },
        select: { id: true, email: true, firstName: true, lastName: true, roles: true },
      });
      if (!member) {
        return res.status(404).json({ error: 'Member not found' });
      }
      authReq.member = {
        id: member.id,
        email: member.email,
        firstName: member.firstName,
        lastName: member.lastName,
        roles: member.roles as string[],
      };
      authReq.memberId = member.id;
    }

    const elevated = (await isOrganizer(authReq)) || (await isAdmin(authReq));
    if (!elevated) {
      return res.status(403).json({ error: 'Only organizers or administrators can enter kiosk mode' });
    }

    if (req.session) {
      if (!req.session.member && authReq.member) {
        req.session.member = {
          id: authReq.member.id,
          email: authReq.member.email,
          firstName: authReq.member.firstName,
          lastName: authReq.member.lastName,
          roles: authReq.member.roles,
        };
      }
      req.session.kioskMode = true;
      await saveSessionAsync(req);
    }

    const token = signMemberToken(memberId, true);
    return res.json({
      kioskMode: true,
      token,
      message: 'Privileges relinquished. Enter your password to restore.',
    });
  } catch (error) {
    logger.error('Relinquish privileges error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Restore elevated privileges after kiosk mode by confirming the member password.
 */
router.post('/member/restore-privileges', [
  body('password').notEmpty(),
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const authReq = req as AuthRequest;
    let memberId = req.session?.member?.id ?? authReq.memberId;
    let inKiosk = req.session?.kioskMode === true || authReq.kioskMode === true;

    if (!memberId) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        try {
          const decoded = jwt.verify(authHeader.split(' ')[1], getJwtSecret()) as {
            memberId?: number;
            type?: string;
            kioskMode?: boolean;
          };
          if (decoded.type === 'member' && decoded.memberId) {
            memberId = decoded.memberId;
            inKiosk = decoded.kioskMode === true;
          }
        } catch {
          return res.status(401).json({ error: 'Authentication required' });
        }
      }
    }

    if (!memberId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!inKiosk) {
      return res.status(400).json({ error: 'Not in kiosk mode' });
    }

    const member = await prisma.member.findUnique({ where: { id: memberId } });
    if (!member || !member.isActive) {
      return res.status(404).json({ error: 'Member not found' });
    }

    if (member.password === '') {
      return res.status(403).json({
        error: 'Password is not set. Ask a system administrator to reset the password.',
      });
    }

    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const valid = await bcrypt.compare(password, member.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    if (req.session) {
      req.session.kioskMode = false;
      await saveSessionAsync(req);
    }

    const token = signMemberToken(memberId, false);
    return res.json({
      kioskMode: false,
      token,
      message: 'Privileges restored',
      autoRelinquishPrivileges: resolveAutoRelinquishPrivileges(member.autoRelinquishPrivileges),
      autoRelinquishIdleMinutes: getAutoRelinquishIdleMinutes(),
    });
  } catch (error) {
    logger.error('Restore privileges error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;



