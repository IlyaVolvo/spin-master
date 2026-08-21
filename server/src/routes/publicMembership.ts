import { createHash, randomBytes } from 'crypto';
import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { Gender, MemberRole } from '@prisma/client';
import { prisma } from '../index';
import { APP_NAME } from '../brand';
import { logger } from '../utils/logger';
import { checkMemberDuplicates } from '../utils/memberDuplicates';
import { isValidEmailFormat, isValidMemberName, normalizeMemberEmail } from '../utils/memberValidation';
import { generateScorePin, normalizeScorePin, validateScorePinFormat } from '../utils/scorePin';
import { stripSensitiveMemberFields } from '../utils/memberSerialization';
import { emitToAll } from '../services/socketService';
import { getAuthPolicyConfig, getPaymentsConfig, getSystemConfig } from '../services/systemConfigService';
import { resolveNewMemberTrialEndsOn } from '../payments/memberTrial';
import { invalidateMemberCheckInStub } from '../payments/checkInStateCache';
import { broadcastMembersUpdated } from '../services/playerSocketBroadcast';
import {
  MEMBERSHIP_APPLICATION_TOKEN_TTL_DAYS,
  buildMembershipAcceptLink,
  buildMembershipDenyLink,
  sendMembershipApplicationEmail,
} from '../services/mailService';
import {
  memberDisplayName,
  memberLifecycleIdentityDetails,
  recordMemberLifecycleEvent,
} from '../services/memberLifecycleLog';
import {
  getAutoRelinquishIdleMinutes,
  resolveAutoRelinquishPrivileges,
  shouldAutoEnterKioskMode,
} from '../utils/autoRelinquish';
import { defaultKioskKindForRoles, type KioskKind } from '../utils/kioskMode';

const router = express.Router();

function generateQrTokenHash(): string {
  return createHash('sha256')
    .update(`${randomBytes(32).toString('hex')}:${Date.now()}:${Math.random()}`)
    .digest('hex');
}

function generateMembershipToken(): string {
  return randomBytes(32).toString('hex');
}

function getMembershipTokenExpiryDate(): Date {
  return new Date(Date.now() + MEMBERSHIP_APPLICATION_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function getJwtSecret(): string {
  return process.env.JWT_SECRET || process.env.SESSION_SECRET || 'secret';
}

function passwordMeetsPolicy(value: unknown): boolean {
  const { minimumPasswordLength } = getAuthPolicyConfig();
  if (typeof value !== 'string' || value.length < minimumPasswordLength) {
    throw new Error(`Password must be at least ${minimumPasswordLength} characters long`);
  }
  return true;
}

function isWaitingApplication(member: {
  isActive: boolean;
  emailConfirmedAt: Date | null;
}): boolean {
  return member.isActive === false && member.emailConfirmedAt == null;
}

async function findMemberByMembershipToken(token: string) {
  if (!token) return null;
  return prisma.member.findFirst({
    where: { passwordResetToken: token },
  });
}

function tokenStatus(member: {
  isActive: boolean;
  emailConfirmedAt: Date | null;
  passwordResetToken: string | null;
  passwordResetTokenExpiry: Date | null;
}): 'waiting' | 'expired' | 'activated' | 'invalid' {
  if (!member.passwordResetToken || !member.passwordResetTokenExpiry) {
    return 'invalid';
  }
  if (!isWaitingApplication(member)) {
    return 'activated';
  }
  if (member.passwordResetTokenExpiry.getTime() < Date.now()) {
    return 'expired';
  }
  return 'waiting';
}

function clubDisplayName(): string {
  const configured = getSystemConfig().branding?.clubName?.trim();
  return configured || APP_NAME;
}

async function establishSession(req: Request, member: {
  id: number;
  email: string | null;
  firstName: string;
  lastName: string;
  roles: unknown;
  autoRelinquishPrivileges?: boolean | null;
}): Promise<{ token: string; kioskMode: boolean; kioskKind: KioskKind | null }> {
  const rolesArray = Array.isArray(member.roles) ? member.roles.map((role) => String(role)) : [];
  const autoOverrideOnLogin = member.autoRelinquishPrivileges ?? null;
  const loginKioskMode = shouldAutoEnterKioskMode({
    roles: rolesArray,
    autoRelinquishPrivileges: autoOverrideOnLogin,
  });
  const loginKioskKind = loginKioskMode ? defaultKioskKindForRoles(rolesArray) : null;

  if (!req.session) {
    throw new Error('Session not initialized');
  }

  req.session.member = {
    id: Number(member.id),
    email: member.email ? String(member.email) : null,
    firstName: String(member.firstName),
    lastName: String(member.lastName),
    roles: rolesArray,
  };
  req.session.kioskMode = loginKioskMode;
  if (loginKioskMode && loginKioskKind) {
    req.session.kioskKind = loginKioskKind;
    delete req.session.kioskTournamentId;
  } else {
    delete req.session.kioskKind;
    delete req.session.kioskTournamentId;
  }

  await new Promise<void>((resolve, reject) => {
    req.session!.save((err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  const payload: Record<string, unknown> = { memberId: member.id, type: 'member' };
  if (loginKioskMode) {
    payload.kioskMode = true;
    if (loginKioskKind) payload.kioskKind = loginKioskKind;
  }
  const token = jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
  return { token, kioskMode: loginKioskMode, kioskKind: loginKioskKind };
}

function serializeLoginMember(
  member: {
    id: number;
    email: string | null;
    firstName: string;
    lastName: string;
    birthDate: Date | null;
    isActive: boolean;
    emailConfirmedAt: Date | null;
    rating: number | null;
    gender: string;
    roles: unknown;
    phone: string | null;
    address: string | null;
    picture: string | null;
    mustResetPassword: boolean;
    createdAt: Date;
    updatedAt: Date;
    autoRelinquishPrivileges?: boolean | null;
    password: string;
  },
  options: { kioskMode: boolean; kioskKind: KioskKind | null },
) {
  const rolesArray = Array.isArray(member.roles) ? member.roles.map((role) => String(role)) : [];
  const autoOverrideOnLogin = member.autoRelinquishPrivileges ?? null;
  return {
    id: Number(member.id),
    email: String(member.email),
    firstName: String(member.firstName),
    lastName: String(member.lastName),
    birthDate: member.birthDate ? new Date(member.birthDate).toISOString() : null,
    isActive: Boolean(member.isActive),
    emailConfirmedAt: member.emailConfirmedAt ? new Date(member.emailConfirmedAt).toISOString() : null,
    rating: member.rating !== null ? Number(member.rating) : null,
    gender: String(member.gender),
    roles: rolesArray,
    phone: member.phone ? String(member.phone) : null,
    address: member.address ? String(member.address) : null,
    picture: member.picture ? String(member.picture) : null,
    mustResetPassword: Boolean(member.mustResetPassword),
    hasPassword: member.password !== '',
    createdAt: member.createdAt ? new Date(member.createdAt).toISOString() : null,
    updatedAt: member.updatedAt ? new Date(member.updatedAt).toISOString() : null,
    kioskMode: options.kioskMode,
    ...(options.kioskMode && options.kioskKind ? { kioskKind: options.kioskKind } : {}),
    autoRelinquishPrivilegesOverride: autoOverrideOnLogin,
    autoRelinquishPrivileges: resolveAutoRelinquishPrivileges(autoOverrideOnLogin),
    autoRelinquishIdleMinutes: getAutoRelinquishIdleMinutes(),
  };
}

router.post(
  '/apply',
  [
    body('firstName').isString().trim().notEmpty(),
    body('lastName').isString().trim().notEmpty(),
    body('email').isString().trim().notEmpty(),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'First name, last name, and email are required', errors: errors.array() });
      }

      const firstName = String(req.body.firstName).trim();
      const lastName = String(req.body.lastName).trim();
      const emailInput = String(req.body.email).trim();

      if (!isValidMemberName(firstName) || !isValidMemberName(lastName)) {
        return res.status(400).json({ error: 'Please enter a valid first and last name' });
      }
      if (!isValidEmailFormat(emailInput)) {
        return res.status(400).json({ error: 'Please enter a valid email address' });
      }

      const email = normalizeMemberEmail(emailInput);
      const existingByEmail = await prisma.member.findFirst({
        where: { email },
      });
      if (existingByEmail && !isWaitingApplication(existingByEmail)) {
        return res.status(409).json({
          error: 'A member with this email already exists',
          fieldErrors: { email: 'A member with this email already exists' },
        });
      }

      const duplicateCheck = await checkMemberDuplicates(prisma, {
        firstName,
        lastName,
        email,
        excludeMemberId: existingByEmail?.id,
      });
      if (duplicateCheck.duplicateName || (!existingByEmail && duplicateCheck.duplicateEmail)) {
        const fieldErrors: Record<string, string> = {};
        const messages: string[] = [];
        if (!existingByEmail && duplicateCheck.duplicateEmail) {
          fieldErrors.email = 'A member with this email already exists';
          messages.push('A member with this email already exists');
        }
        if (duplicateCheck.duplicateName) {
          fieldErrors.firstName = 'A member with this name already exists';
          fieldErrors.lastName = 'A member with this name already exists';
          messages.push('A member with this name already exists');
        }
        if (messages.length > 0) {
          return res.status(409).json({
            error: messages.join('. '),
            fieldErrors,
          });
        }
      }

      const passwordResetToken = generateMembershipToken();
      const passwordResetTokenExpiry = getMembershipTokenExpiryDate();

      const member = existingByEmail
        ? await prisma.member.update({
            where: { id: existingByEmail.id },
            data: {
              firstName,
              lastName,
              mustResetPassword: true,
              passwordResetToken,
              passwordResetTokenExpiry,
              isActive: false,
              emailConfirmedAt: null,
            },
          })
        : await prisma.member.create({
            data: {
              firstName,
              lastName,
              email,
              gender: Gender.NOT_SPECIFIED,
              password: '',
              roles: [MemberRole.PLAYER],
              segment: 'Regular',
              onlinePayConsent: getPaymentsConfig().defaultOnlinePayConsent === true,
              trialEndsOn: null,
              qrTokenHash: generateQrTokenHash(),
              scorePin: generateScorePin(),
              autoRelinquishPrivileges: null,
              isActive: false,
              emailConfirmedAt: null,
              mustResetPassword: true,
              passwordResetToken,
              passwordResetTokenExpiry,
              tournamentNotificationsEnabled: false,
            },
          });

      try {
        const mailed = await sendMembershipApplicationEmail({
          toEmail: email,
          firstName,
          clubName: clubDisplayName(),
          acceptLink: buildMembershipAcceptLink(passwordResetToken),
          denyLink: buildMembershipDenyLink(passwordResetToken),
          expiresAt: passwordResetTokenExpiry,
        });
        logger.info('Membership application email accepted by SMTP', {
          memberId: member.id,
          email,
          messageId: mailed.messageId,
          response: mailed.response,
          resent: Boolean(existingByEmail),
        });
      } catch (emailError) {
        if (!existingByEmail) {
          await prisma.member.delete({ where: { id: member.id } });
        }
        logger.error('Membership application email failed; rolling back member', {
          memberId: member.id,
          email,
          error: emailError instanceof Error ? emailError.message : String(emailError),
        });
        return res.status(500).json({ error: 'Could not send confirmation email. Please try again later.' });
      }

      if (!existingByEmail) {
        emitToAll('player:created', {
          player: stripSensitiveMemberFields(member),
          timestamp: Date.now(),
        });
      } else {
        emitToAll('player:updated', {
          player: stripSensitiveMemberFields(member),
          timestamp: Date.now(),
        });
      }

      const displayName = memberDisplayName({ firstName, lastName, email });
      await recordMemberLifecycleEvent({
        memberId: member.id,
        action: existingByEmail ? 'APPLY_RESEND' : 'APPLY',
        actorType: 'PUBLIC',
        summary: existingByEmail
          ? `Membership application email resent for ${displayName}`
          : `Membership application created for ${displayName}`,
        details: memberLifecycleIdentityDetails({ firstName, lastName, email }),
      });

      logger.info(
        existingByEmail ? 'Public membership application email resent' : 'Public membership application created',
        { memberId: member.id, email },
      );
      return res.status(existingByEmail ? 200 : 201).json({
        message: 'Check your email to accept or deny this membership application. Links expire in 7 days.',
      });
    } catch (error) {
      logger.error('Public membership apply error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.get('/token', async (req: Request, res: Response) => {
  try {
    const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    if (!token) {
      return res.status(400).json({ error: 'Invalid or expired link' });
    }
    const member = await findMemberByMembershipToken(token);
    if (!member) {
      return res.status(400).json({ error: 'Invalid or expired link' });
    }
    const status = tokenStatus(member);
    if (status === 'expired') {
      return res.status(400).json({ error: 'This link has expired. Contact the club if you still want to join.' });
    }
    if (status === 'activated') {
      return res.status(409).json({ error: 'This membership has already been activated' });
    }
    if (status !== 'waiting') {
      return res.status(400).json({ error: 'Invalid or expired link' });
    }
    return res.json({
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      expiresAt: member.passwordResetTokenExpiry?.toISOString() ?? null,
    });
  } catch (error) {
    logger.error('Public membership token preview error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/complete',
  [
    body('token').isString().trim().notEmpty(),
    body('password').custom(passwordMeetsPolicy),
    body('scorePin').isString().trim().notEmpty(),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const first = errors.array()[0];
        const message =
          first && 'msg' in first && typeof first.msg === 'string' ? first.msg : 'Invalid password or PIN';
        return res.status(400).json({ error: message, errors: errors.array() });
      }

      const token = String(req.body.token).trim();
      const password = String(req.body.password);
      const pinError = validateScorePinFormat(req.body.scorePin);
      if (pinError) {
        return res.status(400).json({ error: pinError });
      }
      const scorePin = normalizeScorePin(req.body.scorePin);

      const member = await findMemberByMembershipToken(token);
      if (!member) {
        return res.status(400).json({ error: 'Invalid or expired link' });
      }
      const status = tokenStatus(member);
      if (status === 'activated') {
        return res.status(409).json({ error: 'This membership has already been activated' });
      }
      if (status === 'expired') {
        return res.status(400).json({ error: 'This link has expired. Contact the club if you still want to join.' });
      }
      if (status !== 'waiting') {
        return res.status(400).json({ error: 'Invalid or expired link' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const trialEndsOn = resolveNewMemberTrialEndsOn();
      const updated = await prisma.member.update({
        where: { id: member.id },
        data: {
          password: hashedPassword,
          scorePin,
          isActive: true,
          emailConfirmedAt: new Date(),
          mustResetPassword: false,
          passwordResetToken: null,
          passwordResetTokenExpiry: null,
          trialEndsOn,
        },
      });
      invalidateMemberCheckInStub(updated.id);
      await broadcastMembersUpdated(prisma, [updated.id]);

      await recordMemberLifecycleEvent({
        memberId: updated.id,
        action: 'ACTIVATE',
        actorType: 'PUBLIC',
        summary: `${memberDisplayName(updated)} activated membership`,
        details: memberLifecycleIdentityDetails(updated),
      });

      let sessionAuth: { token: string; kioskMode: boolean; kioskKind: KioskKind | null };
      try {
        sessionAuth = await establishSession(req, updated);
      } catch (sessionError) {
        logger.error('Membership complete session failed', {
          memberId: updated.id,
          error: sessionError instanceof Error ? sessionError.message : String(sessionError),
        });
        return res.status(500).json({ error: 'Account was activated but sign-in failed. Please log in.' });
      }

      logger.info('Public membership application completed', { memberId: updated.id, email: updated.email });
      return res.json({
        token: sessionAuth.token,
        member: serializeLoginMember(updated, sessionAuth),
        sessionId: req.sessionID || null,
      });
    } catch (error) {
      logger.error('Public membership complete error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.post(
  '/deny',
  [body('token').isString().trim().notEmpty()],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Invalid or expired link' });
      }
      const token = String(req.body.token).trim();
      const member = await findMemberByMembershipToken(token);
      if (!member) {
        return res.status(400).json({ error: 'Invalid or expired link' });
      }
      const status = tokenStatus(member);
      if (status === 'activated') {
        return res.status(409).json({ error: 'This membership has already been activated' });
      }
      if (status === 'expired') {
        return res.status(400).json({ error: 'This link has expired. Contact the club if you still want to cancel.' });
      }
      if (status !== 'waiting') {
        return res.status(400).json({ error: 'Invalid or expired link' });
      }

      await recordMemberLifecycleEvent({
        memberId: member.id,
        action: 'DENY',
        actorType: 'PUBLIC',
        summary: `${memberDisplayName(member)} denied membership application`,
        details: memberLifecycleIdentityDetails(member),
      });

      await prisma.member.delete({ where: { id: member.id } });
      invalidateMemberCheckInStub(member.id);
      emitToAll('player:deleted', {
        playerId: member.id,
        timestamp: Date.now(),
      });
      logger.info('Public membership application denied and deleted', {
        memberId: member.id,
        email: member.email,
      });
      return res.json({ message: 'Application cancelled' });
    } catch (error) {
      logger.error('Public membership deny error', {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;
