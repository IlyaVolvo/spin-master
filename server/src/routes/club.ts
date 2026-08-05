import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../index';
import { logger } from '../utils/logger';
import { getClubPlansConfig, updateSystemConfig, getPaymentsConfig } from '../services/systemConfigService';
import { scorePinsEqual } from '../utils/scorePin';
import { resolvePlanForMember, planChargeAmountCents } from '../payments/resolvePlan';
import {
  computeFutureReimburseCents,
  getFutureEntitlement,
  refreshCurrentEntitlement,
  serializeEntitlement,
  endEntitlement,
} from '../payments/entitlementQueue';
import { planAllowsMemberPurchase } from '../payments/planPurchaseRules';
import { computeValidTo } from '../utils/planDuration';
import {
  isMemberInTrialPeriod,
  trialEndsOnToYmd,
  trialPlanStartYmd,
} from '../payments/memberTrial';
import { confirmPayment } from '../payments/confirmPayment';
import { emitPaymentUpdated } from '../services/socketService';
import { runAutoCheckout, runCloseClub } from '../payments/autoCheckout';
import {
  attendanceStatusWhere,
  parseAttendanceStatusFilter,
} from '../payments/attendanceLogFilters';
import { getClubDate, getClubTimezone, clubLocalDayRangeUtc } from '../utils/clubDate';
import { memberHasPaymentLogin } from '../utils/paymentLoginEligibility';
import {
  memberContextFromStub,
  toggleVisit,
} from '../payments/checkInToggle';
import {
  getCachedMemberCheckInStub,
  invalidateCurrentEntitlement,
  setCachedMemberCheckInStub,
  type MemberCheckInStub,
} from '../payments/checkInStateCache';
import { getPresenceBoardVersion } from '../payments/presenceBoardVersion';

const router = express.Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Check if user has ADMIN or ORGANIZER role */
function isAdminOrOrganizer(req: AuthRequest): boolean {
  const roles = req.member?.roles || [];
  return roles.includes('ADMIN') || roles.includes('ORGANIZER');
}

function isAdmin(req: AuthRequest): boolean {
  return (req.member?.roles || []).includes('ADMIN');
}

/**
 * Get the active (CURRENT) entitlement for a member.
 * Checks expiration and exhaustion, marks ENDED if needed.
 */
async function getActiveEntitlement(memberId: number) {
  return refreshCurrentEntitlement(memberId);
}

// ─── Public Endpoints (no auth) ──────────────────────────────────────────────

/** GET /api/club/public-config — returns club timezone */
router.get('/public-config', (_req: Request, res: Response) => {
  res.json({ clubTimezone: getClubTimezone() });
});

/**
 * POST /api/club/scan — QR kiosk endpoint (no auth required)
 * Body: { "qrToken": "<hash>" }
 */
router.post('/scan', async (req: Request, res: Response) => {
  try {
    const { qrToken } = req.body;
    if (!qrToken || typeof qrToken !== 'string') {
      return res.status(400).json({ error: 'qrToken is required' });
    }

    // Look up member by QR token hash
    const member = await prisma.member.findUnique({
      where: { qrTokenHash: qrToken },
      select: { id: true, firstName: true, lastName: true, isActive: true },
    });

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    if (!member.isActive) {
      return res.status(403).json({ error: 'Member account is inactive' });
    }

    const result = await toggleVisit(member.id, 'SCAN');

    if (result.action === 'PAYMENT_REQUIRED') {
      return res.status(402).json({
        action: result.action,
        message: result.warning,
        charged: result.charged,
        entitlement: result.entitlement,
        member: { firstName: member.firstName, lastName: member.lastName },
      });
    }

    res.json({
      action: result.action,
      visit: result.visit,
      warning: result.warning,
      charged: result.charged,
      entitlement: result.entitlement,
      member: { firstName: member.firstName, lastName: member.lastName },
    });
  } catch (error) {
    logger.error('Error processing scan', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/club/members?q= — public directory for check-in kiosk (active members, names only)
 */
router.get('/members', async (req: Request, res: Response) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length < 1) {
      return res.json({ members: [] });
    }

    const tokens = q.split(/\s+/).filter(Boolean).slice(0, 5);
    const andFilters = tokens.map((token) => ({
      OR: [
        { firstName: { contains: token, mode: 'insensitive' as const } },
        { lastName: { contains: token, mode: 'insensitive' as const } },
      ],
    }));

    const members = await prisma.member.findMany({
      where: {
        isActive: true,
        AND: andFilters,
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 40,
    });

    res.json({ members });
  } catch (error) {
    logger.error('Error searching club members', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/club/pin-verify — validate score PIN without creating a visit
 * Body: { memberId, scorePin }
 * Used when the only actionable choice is Buy a plan.
 */
router.post('/pin-verify', async (req: Request, res: Response) => {
  try {
    const memberId = Number(req.body?.memberId);
    const scorePin = req.body?.scorePin;
    if (!Number.isInteger(memberId) || memberId < 1) {
      return res.status(400).json({ error: 'memberId is required' });
    }
    if (typeof scorePin !== 'string' || !scorePin.trim()) {
      return res.status(400).json({ error: 'scorePin is required' });
    }

    let member: MemberCheckInStub | undefined = getCachedMemberCheckInStub(memberId);
    if (!member) {
      const loaded = await prisma.member.findUnique({
        where: { id: memberId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          isActive: true,
          scorePin: true,
          email: true,
          password: true,
          trialEndsOn: true,
        },
      });
      if (!loaded) {
        return res.status(401).json({ error: 'Invalid PIN' });
      }
      member = loaded;
      setCachedMemberCheckInStub(member);
    }

    if (!scorePinsEqual(scorePin, member.scorePin)) {
      return res.status(401).json({ error: 'Invalid PIN' });
    }
    if (!member.isActive) {
      return res.status(403).json({ error: 'Member account is inactive' });
    }

    res.json({
      ok: true,
      paymentLoginAvailable: memberHasPaymentLogin(member),
      member: { firstName: member.firstName, lastName: member.lastName },
    });
  } catch (error) {
    logger.error('Error verifying PIN', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/club/pin-toggle — score-PIN check-in/out (no session required)
 * Body: { memberId, scorePin }
 */
router.post('/pin-toggle', async (req: Request, res: Response) => {
  try {
    const memberId = Number(req.body?.memberId);
    const scorePin = req.body?.scorePin;
    if (!Number.isInteger(memberId) || memberId < 1) {
      return res.status(400).json({ error: 'memberId is required' });
    }
    if (typeof scorePin !== 'string' || !scorePin.trim()) {
      return res.status(400).json({ error: 'scorePin is required' });
    }

    let member: MemberCheckInStub | undefined = getCachedMemberCheckInStub(memberId);
    if (!member) {
      const loaded = await prisma.member.findUnique({
        where: { id: memberId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          isActive: true,
          scorePin: true,
          email: true,
          password: true,
          trialEndsOn: true,
        },
      });
      if (!loaded) {
        return res.status(401).json({ error: 'Invalid PIN' });
      }
      member = loaded;
      setCachedMemberCheckInStub(member);
    }

    if (!scorePinsEqual(scorePin, member.scorePin)) {
      return res.status(401).json({ error: 'Invalid PIN' });
    }

    if (!member.isActive) {
      return res.status(403).json({ error: 'Member account is inactive' });
    }

    const eventTournamentId =
      req.body?.eventTournamentId != null ? Number(req.body.eventTournamentId) : undefined;
    const eventMode =
      req.body?.eventMode === 'register_and_pay' || req.body?.eventMode === 'event_check_in'
        ? req.body.eventMode
        : undefined;

    const paymentLoginAvailable = memberHasPaymentLogin(member);

    let result;
    let eventMeta: {
      eventPaymentId?: number;
      registrationStatus?: string;
      usedEventCheckIn?: boolean;
    } = {};

    if (Number.isInteger(eventTournamentId) && eventMode === 'register_and_pay') {
      const { registerPayEventAndCheckIn } = await import('../payments/registerPayEventAndCheckIn');
      const paid = await registerPayEventAndCheckIn({
        memberId: member.id,
        tournamentId: eventTournamentId!,
        closedBy: 'MANUAL',
      });
      result = paid.checkIn;
      eventMeta = {
        eventPaymentId: paid.eventPaymentId,
        registrationStatus: paid.registrationStatus,
        usedEventCheckIn: paid.usedEventCheckIn,
      };

      // Event registration does not require a club plan. If check-in is still blocked,
      // return success for the event fee and surface the club-check-in requirement separately.
      if (result.action === 'PAYMENT_REQUIRED') {
        return res.status(200).json({
          action: 'EVENT_REGISTERED',
          message:
            'Event fee recorded and registration completed. Club check-in still requires a plan, trial, or visit payment (event check-in window is not open, or event coverage does not apply).',
          charged: false,
          entitlement: result.entitlement,
          courtesy: false,
          canPay: result.canPay,
          paymentLoginAvailable,
          paymentInProgress: result.paymentInProgress,
          checkInBlocked: true,
          checkInWarning: result.warning,
          member: { firstName: member.firstName, lastName: member.lastName },
          ...eventMeta,
        });
      }
    } else {
      result = await toggleVisit(
        member.id,
        'MANUAL',
        memberContextFromStub(member),
        Number.isInteger(eventTournamentId) ? { eventTournamentId } : undefined,
      );
    }

    if (result.action === 'PAYMENT_REQUIRED') {
      return res.status(402).json({
        action: result.action,
        message: result.warning,
        charged: result.charged,
        entitlement: result.entitlement,
        courtesy: result.courtesy,
        canPay: result.canPay,
        paymentLoginAvailable,
        paymentInProgress: result.paymentInProgress,
        member: { firstName: member.firstName, lastName: member.lastName },
        ...eventMeta,
      });
    }

    res.json({
      action: result.action,
      visit: result.visit,
      warning: result.warning,
      charged: result.charged,
      entitlement: result.entitlement,
      courtesy: result.courtesy,
      canPay: result.canPay,
      paymentLoginAvailable,
      paymentInProgress: result.paymentInProgress,
      member: { firstName: member.firstName, lastName: member.lastName },
      ...eventMeta,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Error processing pin-toggle', { error: message });
    const status =
      message.includes('Event') ||
      message.includes('registration') ||
      message.includes('maximum') ||
      message.includes('deadline')
        ? 400
        : 500;
    res.status(status).json({ error: message });
  }
});

// ─── Cron Endpoints (no session auth; protected by x-club-cron-secret) ───────

/**
 * POST /api/club/cron/auto-checkout
 * Closes stale open visits (clubDate < today club-local), stamping checkOutAt at each day's club close.
 * Protected by x-club-cron-secret header.
 * Body (optional): { "clubDate": "YYYY-MM-DD" } — targeted single-day run; omit for all stale open visits.
 */
router.post('/cron/auto-checkout', async (req: Request, res: Response) => {
  try {
    const cronSecret = process.env.CLUB_CRON_SECRET;
    const providedSecret = req.headers['x-club-cron-secret'];

    if (cronSecret && providedSecret !== cronSecret) {
      return res.status(403).json({ error: 'Invalid cron secret' });
    }

    const clubDate =
      typeof req.body?.clubDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.clubDate.trim())
        ? req.body.clubDate.trim()
        : undefined;
    const result = await runAutoCheckout(clubDate ? { clubDate } : undefined);
    res.json(result);
  } catch (error) {
    logger.error('Error during auto-checkout', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/club/cron/payment-reminders — preemptive entitlement reminder emails
 */
router.post('/cron/payment-reminders', async (req: Request, res: Response) => {
  try {
    const cronSecret = process.env.CLUB_CRON_SECRET;
    const providedSecret = req.headers['x-club-cron-secret'];
    if (cronSecret && providedSecret !== cronSecret) {
      return res.status(403).json({ error: 'Invalid cron secret' });
    }

    const { sendPreemptivePaymentReminders } = await import('../payments/reminderCron');
    const result = await sendPreemptivePaymentReminders();
    res.json(result);
  } catch (error) {
    logger.error('Error sending payment reminders', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/club/cron/reconcile-payments — backup confirm for PENDING payments
 */
router.post('/cron/reconcile-payments', async (req: Request, res: Response) => {
  try {
    const cronSecret = process.env.CLUB_CRON_SECRET;
    const providedSecret = req.headers['x-club-cron-secret'];
    if (cronSecret && providedSecret !== cronSecret) {
      return res.status(403).json({ error: 'Invalid cron secret' });
    }

    const { reconcilePendingPayments } = await import('../payments/reconcilePending');
    const result = await reconcilePendingPayments();
    res.json(result);
  } catch (error) {
    logger.error('Error reconciling payments', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/club/cron/midnight — promote future entitlements + auto-renew
 */
router.post('/cron/midnight', async (req: Request, res: Response) => {
  try {
    const cronSecret = process.env.CLUB_CRON_SECRET;
    const providedSecret = req.headers['x-club-cron-secret'];
    if (cronSecret && providedSecret !== cronSecret) {
      return res.status(403).json({ error: 'Invalid cron secret' });
    }

    const { runClubMidnightJobs } = await import('../payments/midnightJobs');
    const result = await runClubMidnightJobs({
      clubDate: typeof req.body?.clubDate === 'string' ? req.body.clubDate : undefined,
    });
    res.json(result);
  } catch (error) {
    logger.error('Error running club midnight jobs', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Authenticated Endpoints ─────────────────────────────────────────────────

router.use(authenticate);

/** POST /api/club/self/toggle — logged-in member self check-in/out */
router.post('/self/toggle', async (req: AuthRequest, res: Response) => {
  try {
    const memberId = req.memberId;
    if (!memberId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const eventTournamentId =
      req.body?.eventTournamentId != null ? Number(req.body.eventTournamentId) : undefined;
    const eventMode =
      req.body?.eventMode === 'register_and_pay' || req.body?.eventMode === 'event_check_in'
        ? req.body.eventMode
        : undefined;

    let result;
    if (Number.isInteger(eventTournamentId) && eventMode === 'register_and_pay') {
      const { registerPayEventAndCheckIn } = await import('../payments/registerPayEventAndCheckIn');
      const paid = await registerPayEventAndCheckIn({
        memberId,
        tournamentId: eventTournamentId!,
        closedBy: 'MANUAL',
      });
      result = paid.checkIn;
    } else {
      result = await toggleVisit(
        memberId,
        'MANUAL',
        null,
        Number.isInteger(eventTournamentId) ? { eventTournamentId } : undefined,
      );
    }

    if (result.action === 'PAYMENT_REQUIRED') {
      return res.status(402).json({
        action: result.action,
        message: result.warning,
      });
    }

    res.json({
      action: result.action,
      visit: result.visit,
      warning: result.warning,
      charged: result.charged,
      entitlement: result.entitlement,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    logger.error('Error toggling visit', { error: message });
    const status =
      message.includes('Event') ||
      message.includes('registered') ||
      message.includes('not open') ||
      message.includes('registration') ||
      message.includes('deadline') ||
      message.includes('maximum')
        ? 400
        : 500;
    res.status(status).json({ error: message });
  }
});

/** GET /api/club/event-checkin-options — unified check-in choices (regular + events + buy plan) */
router.get('/event-checkin-options', async (req: AuthRequest, res: Response) => {
  try {
    const rawMemberId = req.query.memberId != null ? Number(req.query.memberId) : req.memberId;
    const memberId = Number(rawMemberId);
    if (!Number.isInteger(memberId) || memberId < 1) {
      return res.status(400).json({ error: 'memberId required' });
    }
    const isAdmin = (req.member?.roles || []).includes('ADMIN') || (req.member?.roles || []).includes('ORGANIZER');
    if (!isAdmin && req.memberId !== memberId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { listCheckInOptions } = await import('../payments/listCheckInOptions');
    const options = await listCheckInOptions(memberId);
    res.json({ options });
  } catch (error) {
    logger.error('Error listing check-in options', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /api/club/kiosk/today-status/version — cheap presence-board sync probe */
router.get('/kiosk/today-status/version', async (_req: AuthRequest, res: Response) => {
  res.json({
    clubDate: getClubDate(),
    version: getPresenceBoardVersion(),
  });
});

/** GET /api/club/kiosk/today-status — bulk presence flags for Players check-in kiosk */
router.get('/kiosk/today-status', async (req: AuthRequest, res: Response) => {
  try {
    const clubDate = getClubDate();
    const visits = await prisma.clubVisit.findMany({
      where: {
        rejectedAt: null,
        OR: [{ clubDate }, { checkOutAt: null }],
      },
      select: {
        memberId: true,
        clubDate: true,
        checkInAt: true,
        checkOutAt: true,
        eventTournamentId: true,
        eventTournament: { select: { id: true, name: true } },
      },
      orderBy: { checkInAt: 'desc' },
    });

    const byMember = new Map<
      number,
      {
        present: boolean;
        visitedToday: boolean;
        lastCheckInAt: string | null;
        eventTournamentId: number | null;
        eventName: string | null;
      }
    >();

    for (const visit of visits) {
      const existing = byMember.get(visit.memberId);
      if (!existing) {
        const isOpen = visit.checkOutAt == null;
        byMember.set(visit.memberId, {
          present: isOpen,
          visitedToday: visit.clubDate === clubDate,
          lastCheckInAt: visit.checkInAt.toISOString(),
          eventTournamentId: isOpen ? visit.eventTournamentId : null,
          eventName: isOpen ? (visit.eventTournament?.name ?? null) : null,
        });
        continue;
      }
      if (visit.checkOutAt == null) {
        existing.present = true;
        if (existing.eventTournamentId == null && visit.eventTournamentId != null) {
          existing.eventTournamentId = visit.eventTournamentId;
          existing.eventName = visit.eventTournament?.name ?? null;
        }
      }
      if (visit.clubDate === clubDate) existing.visitedToday = true;
    }

    const members = Array.from(byMember.entries()).map(([memberId, status]) => ({
      memberId,
      present: status.present,
      visitedToday: status.visitedToday,
      lastCheckInAt: status.lastCheckInAt,
      eventTournamentId: status.eventTournamentId,
      eventName: status.eventName,
    }));

    res.json({ clubDate, version: getPresenceBoardVersion(), members });
  } catch (error) {
    logger.error('Error loading kiosk today-status', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /api/club/kiosk/present — currently present members + who visited today */
router.get('/kiosk/present', async (req: AuthRequest, res: Response) => {
  try {
    const clubDate = getClubDate();
    const visits = await prisma.clubVisit.findMany({
      where: {
        rejectedAt: null,
        OR: [{ clubDate }, { checkOutAt: null }],
      },
      select: {
        memberId: true,
        clubDate: true,
        checkInAt: true,
        checkOutAt: true,
        member: { select: { id: true, firstName: true, lastName: true, rating: true } },
      },
      orderBy: { checkInAt: 'desc' },
    });

    const visitedTodayIds = Array.from(
      new Set(visits.filter((v) => v.clubDate === clubDate).map((v) => v.memberId)),
    );
    const openByMember = new Map<
      number,
      {
        memberId: number;
        firstName: string;
        lastName: string;
        rating: number | null;
        lastCheckInAt: string;
      }
    >();

    for (const visit of visits) {
      if (visit.checkOutAt != null) continue;
      if (openByMember.has(visit.memberId)) continue;
      openByMember.set(visit.memberId, {
        memberId: visit.member.id,
        firstName: visit.member.firstName,
        lastName: visit.member.lastName,
        rating: visit.member.rating ?? null,
        lastCheckInAt: visit.checkInAt.toISOString(),
      });
    }

    const present = Array.from(openByMember.values()).sort((a, b) =>
      a.lastCheckInAt < b.lastCheckInAt ? 1 : a.lastCheckInAt > b.lastCheckInAt ? -1 : 0,
    );

    res.json({
      clubDate,
      presentCount: present.length,
      present,
      visitedTodayIds,
    });
  } catch (error) {
    logger.error('Error loading kiosk present list', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /api/club/self/today — get today's visits for logged-in member */
router.get('/self/today', async (req: AuthRequest, res: Response) => {
  try {
    const memberId = req.memberId;
    if (!memberId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const clubDate = getClubDate();
    const visits = await prisma.clubVisit.findMany({
      where: { memberId, clubDate },
      orderBy: { checkInAt: 'asc' },
    });

    const openVisit = await prisma.clubVisit.findFirst({
      where: { memberId, checkOutAt: null, rejectedAt: null },
      orderBy: { checkInAt: 'desc' },
      select: { id: true },
    });

    const entitlement = await getActiveEntitlement(memberId);

    res.json({
      clubDate,
      visits,
      present: Boolean(openVisit),
      entitlement: entitlement ? {
        id: entitlement.id,
        type: entitlement.type,
        active: entitlement.active,
        validTo: entitlement.validTo,
        visitsRemaining: entitlement.visitsRemaining,
      } : null,
    });
  } catch (error) {
    logger.error('Error getting today visits', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Admin Endpoints ─────────────────────────────────────────────────────────

/** GET /api/club/admin/entitlements — list entitlements (optionally filtered by memberId) */
router.get('/admin/entitlements', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminOrOrganizer(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const memberId = req.query.memberId ? parseInt(req.query.memberId as string) : undefined;
    const where = memberId ? { memberId } : {};

    const entitlements = await prisma.clubEntitlement.findMany({
      where,
      include: { member: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });

    res.json(entitlements);
  } catch (error) {
    logger.error('Error listing entitlements', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/club/admin/entitlements — create an entitlement for a member.
 * Supports two modes:
 *   1. Plan-based: { memberId, planId | familyKey, discountType?, discountValue? }
 *   2. Legacy:     { memberId, type, startsAt?, expiresAt?, visitsTotal?, pricePaid? }
 */
router.post('/admin/entitlements', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminOrOrganizer(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { memberId } = req.body;
    if (!memberId) {
      return res.status(400).json({ error: 'memberId is required' });
    }

    // At most one CURRENT + one FUTURE
    const current = await refreshCurrentEntitlement(Number(memberId));
    const future = await getFutureEntitlement(Number(memberId));
    if (current && future) {
      return res.status(400).json({
        error: 'Member already has current and future entitlements',
      });
    }

    // ── Plan-based creation ──
    if (req.body.planId || req.body.familyKey) {
      const { planId, familyKey, discountType, discountValue } = req.body;

      const member = await prisma.member.findUnique({
        where: { id: Number(memberId) },
        select: { segment: true },
      });
      if (!member) {
        return res.status(404).json({ error: 'Member not found' });
      }

      let plan;
      if (planId) {
        plan = await prisma.clubPlan.findUnique({ where: { id: Number(planId) } });
        if (!plan || !plan.isActive) {
          return res.status(400).json({ error: 'Plan not found or inactive' });
        }
      } else {
        try {
          plan = await resolvePlanForMember(String(familyKey).trim(), member.segment);
        } catch (err) {
          return res.status(400).json({
            error: err instanceof Error ? err.message : 'Plan not found',
          });
        }
      }

      const basePriceCents = planChargeAmountCents(plan);

      let discountAmount = 0;
      if (discountType === 'PERCENT' && typeof discountValue === 'number') {
        discountAmount = Math.round(basePriceCents * Math.min(discountValue, 100) / 100);
      } else if (discountType === 'FIXED' && typeof discountValue === 'number') {
        discountAmount = Math.min(discountValue, basePriceCents);
      }
      const finalPrice = basePriceCents - discountAmount;

      const status = current ? 'FUTURE' : 'CURRENT';
      const validFrom =
        status === 'FUTURE' && current?.validTo ? new Date(current.validTo) : new Date();
      let entitlementType: 'MONTHLY' | 'YEARLY' | 'VISIT_PACK';
      let validTo: Date | null = null;
      let visitsRemaining: number | null = null;
      let visitsTotal: number | null = null;

      if (plan.kind === 'VISIT') {
        entitlementType = 'VISIT_PACK';
        visitsRemaining = plan.visitCount || 0;
        visitsTotal = visitsRemaining;
      } else {
        const unit = plan.durationUnit || 'MONTH';
        const value = plan.durationValue || 1;
        entitlementType = unit === 'YEAR' ? 'YEARLY' : 'MONTHLY';
        validTo = computeValidTo(validFrom, unit, value);
      }

      const entitlement = await prisma.clubEntitlement.create({
        data: {
          memberId,
          type: entitlementType,
          status,
          active: true,
          validFrom,
          validTo,
          visitsRemaining,
          visitsTotal,
          amountPaidCents: finalPrice,
          familyKey: plan.familyKey,
          planId: plan.id,
          planSegment: plan.segment,
          label: plan.name,
        },
      });

      if (status === 'FUTURE') {
        await prisma.member.update({
          where: { id: Number(memberId) },
          data: { autoRenewEnabled: false, autoRenewFamilyKey: null },
        });
      }

      if (finalPrice > 0) {
        await prisma.clubPayment.create({
          data: {
            memberId,
            amountCents: finalPrice,
            purpose: `${plan.name} (${plan.segment}) plan purchase`,
            status: 'SUCCEEDED',
          },
        });
      }

      invalidateCurrentEntitlement(Number(memberId));
      return res.status(201).json(entitlement);
    }

    // ── Legacy creation (backward compat) ──
    const { type, startsAt, expiresAt, visitsTotal, pricePaid } = req.body;

    if (!type) {
      return res.status(400).json({ error: 'planId or type is required' });
    }

    const validTypes = ['YEARLY', 'MONTHLY', 'VISIT_PACK', 'PAY_PER_VISIT_EXTERNAL'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
    }

    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { clubDiscount: true },
    });
    const discount = member?.clubDiscount || 0;
    const price = pricePaid || 0;
    const discountAmount = Math.round((price * discount) / 100);
    const finalPrice = price - discountAmount;

    const status = current ? 'FUTURE' : 'CURRENT';
    const validFrom = startsAt ? new Date(startsAt) : new Date();

    const entitlement = await prisma.clubEntitlement.create({
      data: {
        memberId,
        type,
        status,
        active: true,
        validFrom,
        validTo: expiresAt ? new Date(expiresAt) : null,
        visitsRemaining: type === 'VISIT_PACK' ? visitsTotal || 0 : null,
        visitsTotal: type === 'VISIT_PACK' ? visitsTotal || 0 : null,
        amountPaidCents: finalPrice,
      },
    });

    if (status === 'FUTURE') {
      await prisma.member.update({
        where: { id: Number(memberId) },
        data: { autoRenewEnabled: false, autoRenewFamilyKey: null },
      });
    }

    if (finalPrice > 0) {
      await prisma.clubPayment.create({
        data: {
          memberId,
          amountCents: finalPrice,
          purpose: `${type} plan purchase`,
          status: 'SUCCEEDED',
        },
      });
    }

    invalidateCurrentEntitlement(Number(memberId));
    res.status(201).json(entitlement);
  } catch (error) {
    logger.error('Error creating entitlement', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/club/admin/record-per-visit-payment — record per-visit payment for a member on a given date */
router.post('/admin/record-per-visit-payment', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminOrOrganizer(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { memberId, amount, clubDate, externalRef } = req.body;

    if (!memberId) {
      return res.status(400).json({ error: 'memberId is required' });
    }

    const targetDate = clubDate || getClubDate();

    // Find the member's PAY_PER_VISIT entitlement
    const entitlement = await prisma.clubEntitlement.findFirst({
      where: { memberId, type: 'PAY_PER_VISIT_EXTERNAL', active: true },
    });

    if (!entitlement) {
      return res.status(400).json({ error: 'Member does not have an active PAY_PER_VISIT_EXTERNAL entitlement' });
    }

    const payment = await prisma.clubPayment.create({
      data: {
        memberId,
        amountCents: amount || 0,
        purpose: `per-visit payment for ${targetDate}`,
        status: 'SUCCEEDED',
        externalRef: externalRef || null,
      },
    });

    res.status(201).json(payment);
  } catch (error) {
    logger.error('Error recording per-visit payment', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Plan Management (Admin) ────────────────────────────────────────────────

const PLAN_KINDS = ['TIME', 'VISIT'] as const;
const DURATION_UNITS = ['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR'] as const;

function slugifyFamilyKey(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'plan';
}

/** GET /api/club/admin/plans — list all plans */
router.get('/admin/plans', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminOrOrganizer(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const activeOnly = req.query.active === 'true';
    const where = activeOnly ? { isActive: true } : {};

    const plans = await prisma.clubPlan.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { familyKey: 'asc' }, { segment: 'asc' }],
    });

    res.json(plans);
  } catch (error) {
    logger.error('Error listing plans', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/club/admin/plans — create a plan row (one familyKey + segment) */
router.post('/admin/plans', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminOrOrganizer(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const {
      name,
      kind,
      segment: rawSegment,
      familyKey: rawFamilyKey,
      priceCents,
      currency,
      durationUnit,
      durationValue,
      visitCount,
      sortOrder,
    } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!PLAN_KINDS.includes(kind)) {
      return res.status(400).json({ error: 'kind must be TIME or VISIT' });
    }

    const segment =
      typeof rawSegment === 'string' && rawSegment.trim()
        ? (rawSegment.trim() === 'Normal' ? 'Regular' : rawSegment.trim())
        : 'Regular';
    const familyKey =
      typeof rawFamilyKey === 'string' && rawFamilyKey.trim()
        ? slugifyFamilyKey(rawFamilyKey)
        : slugifyFamilyKey(name);

    if (kind === 'TIME') {
      if (!DURATION_UNITS.includes(durationUnit)) {
        return res.status(400).json({ error: `durationUnit must be one of: ${DURATION_UNITS.join(', ')}` });
      }
      if (!Number.isInteger(durationValue) || durationValue < 1) {
        return res.status(400).json({ error: 'durationValue must be a positive integer' });
      }
    } else if (!Number.isInteger(visitCount) || visitCount < 1) {
      return res.status(400).json({ error: 'visitCount must be a positive integer' });
    }

    const cents = Number.isInteger(priceCents) ? priceCents : Math.round(Number(priceCents) || 0);
    if (!Number.isInteger(cents) || cents < 1) {
      return res.status(400).json({ error: 'priceCents must be an integer greater than 0' });
    }

    const siblings = await prisma.clubPlan.findMany({ where: { familyKey } });
    if (siblings.length > 0) {
      const siblingKind = siblings[0].kind;
      if (siblingKind !== kind) {
        return res.status(400).json({ error: `Family "${familyKey}" already uses kind ${siblingKind}` });
      }
    }
    if (segment !== 'Regular') {
      const hasRegular = siblings.some((p) => p.segment === 'Regular');
      if (!hasRegular) {
        return res.status(400).json({
          error: `Create a Regular plan for family "${familyKey}" before adding segment "${segment}"`,
        });
      }
    }

    const plan = await prisma.clubPlan.create({
      data: {
        name: name.trim(),
        familyKey,
        kind,
        segment,
        priceCents: cents,
        currency: typeof currency === 'string' && currency.trim() ? currency.trim() : 'USD',
        durationUnit: kind === 'TIME' ? durationUnit : null,
        durationValue: kind === 'TIME' ? durationValue : null,
        visitCount: kind === 'VISIT' ? visitCount : null,
        sortOrder: Number.isInteger(sortOrder) ? sortOrder : 0,
      },
    });

    res.status(201).json(plan);
  } catch (error: unknown) {
    const prismaCode = (error as { code?: string })?.code;
    if (prismaCode === 'P2002') {
      return res.status(400).json({ error: 'A plan with this familyKey and segment already exists' });
    }
    logger.error('Error creating plan', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** PUT /api/club/admin/plans/:id — update a plan */
router.put('/admin/plans/:id', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminOrOrganizer(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const planId = parseInt(req.params.id);
    if (isNaN(planId)) {
      return res.status(400).json({ error: 'Invalid plan ID' });
    }

    const existing = await prisma.clubPlan.findUnique({ where: { id: planId } });
    if (!existing) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    const data: Record<string, unknown> = {};
    if (req.body.name !== undefined) {
      if (typeof req.body.name !== 'string' || !req.body.name.trim()) {
        return res.status(400).json({ error: 'name must be a non-empty string' });
      }
      data.name = req.body.name.trim();
    }
    if (req.body.isActive !== undefined) data.isActive = Boolean(req.body.isActive);
    if (req.body.sortOrder !== undefined) data.sortOrder = req.body.sortOrder;
    if (req.body.priceCents !== undefined) {
      const cents = Number.isInteger(req.body.priceCents)
        ? req.body.priceCents
        : Math.round(Number(req.body.priceCents) || 0);
      if (!Number.isInteger(cents) || cents < 1) {
        return res.status(400).json({ error: 'priceCents must be an integer greater than 0' });
      }
      data.priceCents = cents;
    }
    if (req.body.currency !== undefined && typeof req.body.currency === 'string') {
      data.currency = req.body.currency.trim() || 'USD';
    }
    if (req.body.segment !== undefined) {
      const seg = String(req.body.segment).trim();
      data.segment = seg === 'Normal' ? 'Regular' : seg;
    }
    if (req.body.familyKey !== undefined) {
      data.familyKey = slugifyFamilyKey(String(req.body.familyKey));
    }
    if (req.body.kind !== undefined) {
      if (!PLAN_KINDS.includes(req.body.kind)) {
        return res.status(400).json({ error: 'kind must be TIME or VISIT' });
      }
      data.kind = req.body.kind;
    }

    const nextKind = (data.kind as string) || existing.kind;
    if (nextKind === 'TIME') {
      if (req.body.durationUnit !== undefined) {
        if (!DURATION_UNITS.includes(req.body.durationUnit)) {
          return res.status(400).json({ error: `durationUnit must be one of: ${DURATION_UNITS.join(', ')}` });
        }
        data.durationUnit = req.body.durationUnit;
      }
      if (req.body.durationValue !== undefined) {
        if (!Number.isInteger(req.body.durationValue) || req.body.durationValue < 1) {
          return res.status(400).json({ error: 'durationValue must be a positive integer' });
        }
        data.durationValue = req.body.durationValue;
      }
      data.visitCount = null;
    } else {
      if (req.body.visitCount !== undefined) {
        if (!Number.isInteger(req.body.visitCount) || req.body.visitCount < 1) {
          return res.status(400).json({ error: 'visitCount must be a positive integer' });
        }
        data.visitCount = req.body.visitCount;
      }
      data.durationUnit = null;
      data.durationValue = null;
    }

    const nextFamily = (data.familyKey as string) || existing.familyKey;
    const nextSegment = (data.segment as string) || existing.segment;
    const nextActive = data.isActive !== undefined ? Boolean(data.isActive) : existing.isActive;

    if (nextSegment !== 'Regular') {
      const regular = await prisma.clubPlan.findFirst({
        where: { familyKey: nextFamily, segment: 'Regular', NOT: { id: planId } },
      });
      const selfIsRegularMoving = existing.segment === 'Regular' && nextSegment !== 'Regular';
      if (!regular || selfIsRegularMoving) {
        // If this row was the Regular and is changing segment, require another Regular
        const stillHasRegular =
          regular != null || (nextSegment === 'Regular' && !selfIsRegularMoving);
        if (!stillHasRegular) {
          return res.status(400).json({
            error: `Family "${nextFamily}" must keep a Regular plan`,
          });
        }
      }
    }

    if (existing.segment === 'Regular' && (nextSegment !== 'Regular' || nextActive === false)) {
      const otherActive = await prisma.clubPlan.count({
        where: {
          familyKey: existing.familyKey,
          isActive: true,
          NOT: { id: planId },
        },
      });
      if (otherActive > 0 && (nextSegment !== 'Regular' || nextActive === false)) {
        const remainingRegular = await prisma.clubPlan.findFirst({
          where: {
            familyKey: nextFamily,
            segment: 'Regular',
            isActive: true,
            NOT: { id: planId },
          },
        });
        if (!remainingRegular) {
          return res.status(400).json({
            error: 'Cannot remove or deactivate the only Regular plan while other variants exist',
          });
        }
      }
    }

    const updated = await prisma.clubPlan.update({
      where: { id: planId },
      data,
    });

    // Keep shared family display name / sort in sync when Regular is edited
    if (updated.segment === 'Regular' && (data.name !== undefined || data.sortOrder !== undefined)) {
      await prisma.clubPlan.updateMany({
        where: { familyKey: updated.familyKey, NOT: { id: updated.id } },
        data: {
          ...(data.name !== undefined ? { name: updated.name } : {}),
          ...(data.sortOrder !== undefined ? { sortOrder: updated.sortOrder } : {}),
        },
      });
    }

    res.json(updated);
  } catch (error: unknown) {
    const prismaCode = (error as { code?: string })?.code;
    if (prismaCode === 'P2002') {
      return res.status(400).json({ error: 'A plan with this familyKey and segment already exists' });
    }
    logger.error('Error updating plan', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** DELETE /api/club/admin/plans/:id — soft-delete (deactivate) a plan */
router.delete('/admin/plans/:id', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminOrOrganizer(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const planId = parseInt(req.params.id);
    if (isNaN(planId)) {
      return res.status(400).json({ error: 'Invalid plan ID' });
    }

    const existing = await prisma.clubPlan.findUnique({ where: { id: planId } });
    if (!existing) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    if (existing.segment === 'Regular') {
      const otherActive = await prisma.clubPlan.count({
        where: { familyKey: existing.familyKey, isActive: true, NOT: { id: planId } },
      });
      if (otherActive > 0) {
        return res.status(400).json({
          error: 'Deactivate other segment variants before deactivating the Regular plan',
        });
      }
    }

    const updated = await prisma.clubPlan.update({
      where: { id: planId },
      data: { isActive: false },
    });

    res.json(updated);
  } catch (error) {
    logger.error('Error deactivating plan', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /api/club/admin/plan-config — get plan segments + formula from SystemConfig */
router.get('/admin/plan-config', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminOrOrganizer(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    res.json(getClubPlansConfig());
  } catch (error) {
    logger.error('Error getting plan config', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** PUT /api/club/admin/plan-config — update plan segments + formula */
router.put('/admin/plan-config', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminOrOrganizer(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const updated = await updateSystemConfig({ clubPlans: req.body });
    res.json(updated.clubPlans);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('clubPlans.')) {
      return res.status(400).json({ error: error.message });
    }
    logger.error('Error updating plan config', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /api/club/admin/plan-price-suggestion — calculate suggested price from formula */
router.get('/admin/plan-price-suggestion', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminOrOrganizer(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const visitCount = parseInt(req.query.visitCount as string);
    const rawCategory = (req.query.category as string) || (req.query.segment as string) || 'Regular';
    const category = rawCategory === 'Normal' ? 'Regular' : rawCategory;

    if (isNaN(visitCount) || visitCount < 1) {
      return res.status(400).json({ error: 'visitCount must be a positive integer' });
    }

    const config = getClubPlansConfig();
    const formulaParams = config.visitPricingFormula[category];

    if (!formulaParams) {
      return res.status(400).json({ error: `No formula parameters found for segment "${category}"` });
    }

    // Formula: pricePerVisit = basePricePerVisit × (1/visitCount)^exponent
    const pricePerVisitCents = Math.round(
      formulaParams.basePricePerVisitCents * Math.pow(1 / visitCount, formulaParams.exponent)
    );
    const totalPriceCents = pricePerVisitCents * visitCount;

    res.json({
      visitCount,
      category,
      segment: category,
      pricePerVisitCents,
      totalPriceCents,
      formula: {
        basePricePerVisitCents: formulaParams.basePricePerVisitCents,
        exponent: formulaParams.exponent,
      },
    });
  } catch (error) {
    logger.error('Error calculating price suggestion', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/club/admin/close-club
 * Admin bulk checkout of everyone still present. closedBy=AUTO.
 * Body: { "password": "<admin login password>", "checkOutAt"?: "<ISO datetime>" }
 * Password is required (current admin member). checkOutAt defaults to now.
 */
router.post('/admin/close-club', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const adminId = req.member?.id;
    if (!adminId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const admin = await prisma.member.findUnique({
      where: { id: adminId },
      select: { id: true, password: true, isActive: true },
    });
    if (!admin || !admin.isActive) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!admin.password) {
      return res.status(403).json({ error: 'Password is not set for this account' });
    }
    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    let checkOutAt: Date | undefined;
    if (req.body?.checkOutAt != null && req.body.checkOutAt !== '') {
      if (typeof req.body.checkOutAt !== 'string') {
        return res.status(400).json({ error: 'checkOutAt must be an ISO datetime string' });
      }
      checkOutAt = new Date(req.body.checkOutAt);
      if (Number.isNaN(checkOutAt.getTime())) {
        return res.status(400).json({ error: 'Invalid checkOutAt' });
      }
    }

    const result = await runCloseClub(checkOutAt ? { checkOutAt } : undefined);
    res.json(result);
  } catch (error) {
    logger.error('Error during close club', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /api/club/admin/courtesy-visits — list uncleared courtesy visits */
router.get('/admin/courtesy-visits', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminOrOrganizer(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const visits = await prisma.clubVisit.findMany({
      where: { isCourtesy: true, courtesyClearedAt: null },
      include: {
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            courtesySuspended: true,
          },
        },
      },
      orderBy: { checkInAt: 'desc' },
      take: 500,
    });
    res.json({ visits });
  } catch (error) {
    logger.error('Error listing courtesy visits', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/club/admin/members/:id/courtesy-suspend — body: { suspended: boolean } */
router.post('/admin/members/:id/courtesy-suspend', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminOrOrganizer(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const memberId = Number(req.params.id);
    if (!Number.isInteger(memberId) || memberId < 1) {
      return res.status(400).json({ error: 'Invalid member id' });
    }
    const suspended = Boolean(req.body?.suspended);
    const member = await prisma.member.update({
      where: { id: memberId },
      data: { courtesySuspended: suspended },
      select: { id: true, firstName: true, lastName: true, courtesySuspended: true },
    });
    res.json({ member });
  } catch (error) {
    logger.error('Error updating courtesy suspend', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Member Plan Screen APIs ─────────────────────────────────────────────────

function canAccessMemberPlan(req: AuthRequest, memberId: number): boolean {
  if (req.memberId === memberId) return true;
  return isAdminOrOrganizer(req);
}

/** GET /api/club/members/:id/plan — current/future/credit/auto-renew summary */
router.get('/members/:id/plan', async (req: AuthRequest, res: Response) => {
  try {
    const memberId = Number(req.params.id);
    if (!Number.isInteger(memberId) || memberId < 1) {
      return res.status(400).json({ error: 'Invalid member id' });
    }
    if (!canAccessMemberPlan(req, memberId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        segment: true,
        purchaseCreditCents: true,
        autoRenewEnabled: true,
        autoRenewFamilyKey: true,
        onlinePayConsent: true,
        courtesySuspended: true,
        trialEndsOn: true,
      },
    });
    if (!member) return res.status(404).json({ error: 'Member not found' });

    const current = await refreshCurrentEntitlement(memberId);
    const future = await getFutureEntitlement(memberId);
    const pendingPayment = await prisma.clubPayment.findFirst({
      where: { memberId, status: 'PENDING' },
      orderBy: { recordedAt: 'desc' },
    });

    const paymentHistory = await prisma.clubPayment.findMany({
      where: { memberId },
      orderBy: { recordedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        recordedAt: true,
        amountCents: true,
        listAmountCents: true,
        creditAppliedCents: true,
        status: true,
        provider: true,
        purpose: true,
        metadata: true,
      },
    });

    const futureReimburseCents = future ? computeFutureReimburseCents(future) : 0;
    // Auto-renew is incompatible with a queued future plan; clear if still set
    const effectiveAutoRenew = member.autoRenewEnabled && !future;
    if (member.autoRenewEnabled && future) {
      await prisma.member.update({
        where: { id: memberId },
        data: { autoRenewEnabled: false, autoRenewFamilyKey: null },
      });
    }

    const canPurchase = planAllowsMemberPurchase({
      hasCurrent: Boolean(current),
      hasFuture: Boolean(future),
      autoRenewEnabled: effectiveAutoRenew,
      hasPendingPayment: Boolean(pendingPayment),
    });

    const clubDate = getClubDate();
    const inTrial = isMemberInTrialPeriod(member.trialEndsOn, clubDate);
    const trialEndsOnYmd = trialEndsOnToYmd(member.trialEndsOn);
    const hasEmail = Boolean(member.email?.trim());
    const onlinePayConsent = member.onlinePayConsent === true;
    const effectiveCanPayOnline = hasEmail && onlinePayConsent;

    res.json({
      member: {
        id: member.id,
        firstName: member.firstName,
        lastName: member.lastName,
        email: member.email,
        segment: member.segment,
        courtesySuspended: member.courtesySuspended,
      },
      current: serializeEntitlement(current),
      future: serializeEntitlement(future),
      purchaseCreditCents: member.purchaseCreditCents,
      autoRenewEnabled: effectiveAutoRenew,
      autoRenewFamilyKey: effectiveAutoRenew ? member.autoRenewFamilyKey : null,
      futureReimburseCents,
      canPurchase,
      onlinePayConsent,
      effectiveCanPayOnline,
      inTrial,
      trialEndsOn: trialEndsOnYmd,
      trialPlanStartsOn: inTrial ? trialPlanStartYmd(member.trialEndsOn) : null,
      pendingPayment: pendingPayment
        ? {
            id: pendingPayment.id,
            status: pendingPayment.status,
            amountCents: pendingPayment.amountCents,
            listAmountCents: pendingPayment.listAmountCents,
            creditAppliedCents: pendingPayment.creditAppliedCents,
            purpose: pendingPayment.purpose,
            provider: pendingPayment.provider,
          }
        : null,
      payments: paymentHistory.map((p) => {
        const meta =
          p.metadata && typeof p.metadata === 'object' && !Array.isArray(p.metadata)
            ? (p.metadata as Record<string, unknown>)
            : {};
        const creditFromMeta =
          typeof meta.creditAppliedCents === 'number' && Number.isFinite(meta.creditAppliedCents)
            ? Math.max(0, Math.floor(meta.creditAppliedCents))
            : 0;
        const listFromMeta =
          typeof meta.listAmountCents === 'number' && Number.isFinite(meta.listAmountCents)
            ? Math.max(0, Math.floor(meta.listAmountCents))
            : null;
        const creditAppliedCents =
          p.creditAppliedCents > 0 ? p.creditAppliedCents : creditFromMeta;
        const listAmountCents =
          p.listAmountCents > 0
            ? p.listAmountCents
            : listFromMeta != null
              ? listFromMeta
              : p.amountCents + creditAppliedCents;
        return {
          id: p.id,
          recordedAt: p.recordedAt.toISOString(),
          amountCents: p.amountCents,
          listAmountCents,
          creditAppliedCents,
          status: p.status,
          provider: p.provider,
          purpose: p.purpose,
        };
      }),
    });
  } catch (error) {
    logger.error('Error getting member plan', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/club/members/:id/plan/credit — admin set purchase credit */
router.post('/members/:id/plan/credit', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminOrOrganizer(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const memberId = Number(req.params.id);
    if (!Number.isInteger(memberId) || memberId < 1) {
      return res.status(400).json({ error: 'Invalid member id' });
    }
    const credit = Math.max(0, Math.floor(Number(req.body?.purchaseCreditCents)));
    if (!Number.isFinite(credit)) {
      return res.status(400).json({ error: 'purchaseCreditCents is required' });
    }
    const member = await prisma.member.update({
      where: { id: memberId },
      data: { purchaseCreditCents: credit },
      select: { id: true, purchaseCreditCents: true },
    });
    res.json({ member });
  } catch (error) {
    logger.error('Error setting purchase credit', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/club/members/:id/plan/reimburse-future — proportional credit + end future */
router.post('/members/:id/plan/reimburse-future', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminOrOrganizer(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const memberId = Number(req.params.id);
    if (!Number.isInteger(memberId) || memberId < 1) {
      return res.status(400).json({ error: 'Invalid member id' });
    }

    const future = await getFutureEntitlement(memberId);
    if (!future) {
      return res.status(400).json({ error: 'No future entitlement to reimburse' });
    }

    const creditAdd = computeFutureReimburseCents(future);
    await endEntitlement(future.id);
    const member = await prisma.member.update({
      where: { id: memberId },
      data: {
        purchaseCreditCents: { increment: creditAdd },
      },
      select: { id: true, purchaseCreditCents: true },
    });

    res.json({
      reimbursedCents: creditAdd,
      endedEntitlementId: future.id,
      purchaseCreditCents: member.purchaseCreditCents,
    });
  } catch (error) {
    logger.error('Error reimbursing future entitlement', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** PATCH /api/club/members/:id/plan/auto-renew — set/clear auto-renew preference */
router.patch('/members/:id/plan/auto-renew', async (req: AuthRequest, res: Response) => {
  try {
    const memberId = Number(req.params.id);
    if (!Number.isInteger(memberId) || memberId < 1) {
      return res.status(400).json({ error: 'Invalid member id' });
    }
    if (!canAccessMemberPlan(req, memberId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const enabled = Boolean(req.body?.enabled);
    let familyKey =
      typeof req.body?.familyKey === 'string' ? req.body.familyKey.trim() : null;

    if (enabled) {
      const memberCheck = await prisma.member.findUnique({
        where: { id: memberId },
        select: { email: true, onlinePayConsent: true },
      });
      if (!memberCheck?.email?.trim()) {
        return res.status(400).json({ error: 'Auto-renew requires a member email address' });
      }
      if (!memberCheck.onlinePayConsent) {
        return res.status(400).json({
          error: 'Auto-renew requires consent to pay online',
        });
      }
      const current = await refreshCurrentEntitlement(memberId);
      if (!current) {
        return res.status(400).json({ error: 'Auto-renew requires a current plan' });
      }
      const future = await getFutureEntitlement(memberId);
      if (future) {
        return res.status(400).json({
          error: 'Auto-renew cannot be enabled while a future plan is queued',
        });
      }
      if (!familyKey) {
        const memberExisting = await prisma.member.findUnique({
          where: { id: memberId },
          select: { autoRenewFamilyKey: true },
        });
        familyKey = memberExisting?.autoRenewFamilyKey || current.familyKey || null;
      }
      if (!familyKey) {
        return res.status(400).json({ error: 'familyKey is required to enable auto-renew' });
      }
    }

    const member = await prisma.member.update({
      where: { id: memberId },
      data: {
        autoRenewEnabled: enabled,
        autoRenewFamilyKey: enabled ? familyKey : null,
      },
      select: {
        id: true,
        autoRenewEnabled: true,
        autoRenewFamilyKey: true,
      },
    });
    res.json({ member });
  } catch (error) {
    logger.error('Error updating auto-renew', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /api/club/admin/members/search?q= — Admin locate members by name or ID */
router.get('/admin/members/search', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length < 1) {
      return res.json({ members: [] });
    }

    const asId = /^\d+$/.test(q) ? Number(q) : NaN;
    const tokens = q.split(/\s+/).filter(Boolean).slice(0, 5);
    const nameFilters = tokens.map((token) => ({
      OR: [
        { firstName: { contains: token, mode: 'insensitive' as const } },
        { lastName: { contains: token, mode: 'insensitive' as const } },
      ],
    }));

    const members = await prisma.member.findMany({
      where: {
        OR: [
          ...(Number.isInteger(asId) && asId > 0 ? [{ id: asId }] : []),
          ...(nameFilters.length > 0 ? [{ AND: nameFilters }] : []),
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isActive: true,
        segment: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 40,
    });

    res.json({
      members: members.map((m) => ({
        id: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        email: m.email,
        isActive: m.isActive,
        segment: m.segment,
      })),
    });
  } catch (error) {
    logger.error('Error searching members for payments admin', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /api/club/admin/visits — attendance log, newest first; optional `q`, `memberId`, `from`, `to`, `status=present,out,rejected` */
router.get('/admin/visits', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const parseYmd = (raw: unknown): string | null => {
      if (typeof raw !== 'string') return null;
      const t = raw.trim();
      return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
    };
    const dateFrom = parseYmd(req.query.from);
    const dateTo = parseYmd(req.query.to);
    const statusFilter = parseAttendanceStatusFilter(req.query);
    const memberIdRaw = req.query.memberId != null ? Number(req.query.memberId) : NaN;
    const memberIdFilter =
      Number.isInteger(memberIdRaw) && memberIdRaw >= 1 ? memberIdRaw : null;
    const tokens = q.split(/\s+/).filter(Boolean).slice(0, 5);
    const nameFilters = tokens.map((token) => ({
      OR: [
        { firstName: { contains: token, mode: 'insensitive' as const } },
        { lastName: { contains: token, mode: 'insensitive' as const } },
      ],
    }));

    const clubDateFilter =
      dateFrom || dateTo
        ? {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          }
        : undefined;

    const statusWhere = attendanceStatusWhere(statusFilter);

    const visits = await prisma.clubVisit.findMany({
      where: {
        ...statusWhere,
        ...(memberIdFilter != null ? { memberId: memberIdFilter } : {}),
        ...(clubDateFilter ? { clubDate: clubDateFilter } : {}),
        ...(nameFilters.length > 0
          ? {
              member: {
                AND: nameFilters,
              },
            }
          : {}),
      },
      orderBy: { checkInAt: 'desc' },
      take: 500,
      include: {
        member: {
          select: { id: true, firstName: true, lastName: true },
        },
        eventTournament: {
          select: { id: true, name: true },
        },
      },
    });

    const { resolveVisitAdmissionBasis } = await import('../payments/visitAdmissionBasis');

    res.json({
      visits: visits.map((v) => ({
        id: v.id,
        memberId: v.memberId,
        memberName: `${v.member.firstName} ${v.member.lastName}`.trim(),
        clubDate: v.clubDate,
        checkInAt: v.checkInAt.toISOString(),
        checkOutAt: v.checkOutAt ? v.checkOutAt.toISOString() : null,
        closedBy: v.closedBy,
        isCourtesy: v.isCourtesy,
        dailyPaymentApplied: v.dailyPaymentApplied,
        courtesyClearedAt: v.courtesyClearedAt ? v.courtesyClearedAt.toISOString() : null,
        rejectedAt: v.rejectedAt ? v.rejectedAt.toISOString() : null,
        rejectionReason: v.rejectionReason,
        eventTournamentId: v.eventTournamentId,
        eventName: v.eventTournament?.name ?? null,
        admissionBasis: resolveVisitAdmissionBasis({
          rejectedAt: v.rejectedAt,
          isCourtesy: v.isCourtesy,
          dailyPaymentApplied: v.dailyPaymentApplied,
          eventTournamentId: v.eventTournamentId,
          eventName: v.eventTournament?.name ?? null,
          admissionBasis: v.admissionBasis,
        }),
      })),
    });
  } catch (error) {
    logger.error('Error listing club visits', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /api/club/admin/payments — all payments, newest first; optional `q`, `from`, `to` (YYYY-MM-DD) */
router.get('/admin/payments', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const parseYmd = (raw: unknown): string | null => {
      if (typeof raw !== 'string') return null;
      const t = raw.trim();
      return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
    };
    const dateFrom = parseYmd(req.query.from);
    const dateTo = parseYmd(req.query.to);
    const tokens = q.split(/\s+/).filter(Boolean).slice(0, 5);
    const nameFilters = tokens.map((token) => ({
      OR: [
        { firstName: { contains: token, mode: 'insensitive' as const } },
        { lastName: { contains: token, mode: 'insensitive' as const } },
      ],
    }));

    const recordedAtFilter = clubLocalDayRangeUtc(dateFrom, dateTo);

    const payments = await prisma.clubPayment.findMany({
      where: {
        ...(Object.keys(recordedAtFilter).length > 0 ? { recordedAt: recordedAtFilter } : {}),
        ...(nameFilters.length > 0
          ? {
              member: {
                AND: nameFilters,
              },
            }
          : {}),
      },
      orderBy: { recordedAt: 'desc' },
      take: 500,
      include: {
        member: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    res.json({
      payments: payments.map((p) => {
        const meta =
          p.metadata && typeof p.metadata === 'object' && !Array.isArray(p.metadata)
            ? (p.metadata as Record<string, unknown>)
            : {};
        const creditFromMeta =
          typeof meta.creditAppliedCents === 'number' && Number.isFinite(meta.creditAppliedCents)
            ? Math.max(0, Math.floor(meta.creditAppliedCents))
            : 0;
        const listFromMeta =
          typeof meta.listAmountCents === 'number' && Number.isFinite(meta.listAmountCents)
            ? Math.max(0, Math.floor(meta.listAmountCents))
            : null;
        const creditAppliedCents =
          p.creditAppliedCents > 0 ? p.creditAppliedCents : creditFromMeta;
        const listAmountCents =
          p.listAmountCents > 0
            ? p.listAmountCents
            : listFromMeta != null
              ? listFromMeta
              : p.amountCents + creditAppliedCents;
        const startDate =
          typeof meta.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(meta.startDate.trim())
            ? meta.startDate.trim()
            : null;
        const product =
          meta.product && typeof meta.product === 'object' && !Array.isArray(meta.product)
            ? (meta.product as Record<string, unknown>)
            : null;
        const planLabel =
          (typeof meta.familyKey === 'string' && meta.familyKey.trim()) ||
          (product && typeof product.familyKey === 'string' && product.familyKey.trim()) ||
          null;

        return {
          id: p.id,
          memberId: p.memberId,
          memberName: `${p.member.firstName} ${p.member.lastName}`.trim(),
          amountCents: p.amountCents,
          listAmountCents,
          creditAppliedCents,
          purpose: p.purpose,
          planLabel,
          effectiveDate: startDate,
          provider: p.provider,
          status: p.status,
          recordedAt: p.recordedAt.toISOString(),
        };
      }),
    });
  } catch (error) {
    logger.error('Error listing club payments', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /api/club/admin/payments/pending — Admin cash (default) pending queue */
router.get('/admin/payments/pending', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const providerFilter =
      typeof req.query.provider === 'string' && req.query.provider.trim()
        ? req.query.provider.trim()
        : 'cash';

    const payments = await prisma.clubPayment.findMany({
      where: {
        status: 'PENDING',
        ...(providerFilter === 'all' ? {} : { provider: providerFilter }),
      },
      orderBy: { recordedAt: 'asc' },
      take: 100,
      include: {
        member: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    res.json({
      payments: payments.map((p) => {
        const meta =
          p.metadata && typeof p.metadata === 'object' && !Array.isArray(p.metadata)
            ? (p.metadata as Record<string, unknown>)
            : {};
        const creditFromMeta =
          typeof meta.creditAppliedCents === 'number' && Number.isFinite(meta.creditAppliedCents)
            ? Math.max(0, Math.floor(meta.creditAppliedCents))
            : 0;
        const listFromMeta =
          typeof meta.listAmountCents === 'number' && Number.isFinite(meta.listAmountCents)
            ? Math.max(0, Math.floor(meta.listAmountCents))
            : null;
        const creditAppliedCents =
          p.creditAppliedCents > 0 ? p.creditAppliedCents : creditFromMeta;
        const listAmountCents =
          p.listAmountCents > 0
            ? p.listAmountCents
            : listFromMeta != null
              ? listFromMeta
              : p.amountCents + creditAppliedCents;
        const startDate =
          typeof meta.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(meta.startDate.trim())
            ? meta.startDate.trim()
            : null;
        const product =
          meta.product && typeof meta.product === 'object' && !Array.isArray(meta.product)
            ? (meta.product as Record<string, unknown>)
            : null;
        const planLabel =
          (typeof meta.familyKey === 'string' && meta.familyKey.trim()) ||
          (product && typeof product.familyKey === 'string' && product.familyKey.trim()) ||
          null;

        return {
          id: p.id,
          memberId: p.memberId,
          memberName: `${p.member.firstName} ${p.member.lastName}`.trim(),
          amountCents: p.amountCents,
          listAmountCents,
          creditAppliedCents,
          purpose: p.purpose,
          planLabel,
          effectiveDate: startDate,
          provider: p.provider,
          status: p.status,
          recordedAt: p.recordedAt.toISOString(),
          externalRef: p.externalRef,
        };
      }),
    });
  } catch (error) {
    logger.error('Error listing pending payments', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/club/admin/payments/:id/clear — Admin clears PENDING cash */
router.post('/admin/payments/:id/clear', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const paymentId = Number(req.params.id);
    if (!Number.isInteger(paymentId) || paymentId < 1) {
      return res.status(400).json({ error: 'Invalid payment id' });
    }

    const payment = await prisma.clubPayment.findUnique({ where: { id: paymentId } });
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (payment.status !== 'PENDING') {
      return res.status(400).json({ error: 'Payment is not pending' });
    }
    if (payment.provider !== 'cash') {
      return res.status(400).json({ error: 'Only cash payments can be cleared here' });
    }
    if (!payment.externalRef) {
      return res.status(400).json({ error: 'Payment is missing external reference' });
    }

    const result = await confirmPayment({
      providerId: 'cash',
      externalRef: payment.externalRef,
      status: 'SUCCEEDED',
      amountCents: payment.amountCents,
      raw: { clearedByAdminId: req.memberId },
    });

    res.json({ ok: true, ...result });
  } catch (error) {
    logger.error('Error clearing cash payment', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/club/admin/payments/:id/cancel — Admin cancels PENDING cash */
router.post('/admin/payments/:id/cancel', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const paymentId = Number(req.params.id);
    if (!Number.isInteger(paymentId) || paymentId < 1) {
      return res.status(400).json({ error: 'Invalid payment id' });
    }

    const payment = await prisma.clubPayment.findUnique({ where: { id: paymentId } });
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (payment.status !== 'PENDING') {
      return res.status(400).json({ error: 'Payment is not pending' });
    }
    if (payment.provider !== 'cash') {
      return res.status(400).json({ error: 'Only cash payments can be cancelled here' });
    }

    if (payment.externalRef) {
      await confirmPayment({
        providerId: 'cash',
        externalRef: payment.externalRef,
        status: 'CANCELLED',
        amountCents: payment.amountCents,
        raw: { cancelledByAdminId: req.memberId },
      });
    } else {
      const cancelled = await prisma.clubPayment.update({
        where: { id: payment.id },
        data: { status: 'CANCELLED' },
      });
      emitPaymentUpdated({
        id: cancelled.id,
        memberId: cancelled.memberId,
        status: 'CANCELLED',
        amountCents: cancelled.amountCents,
        provider: cancelled.provider,
        purpose: cancelled.purpose,
      });
    }

    res.json({ ok: true });
  } catch (error) {
    logger.error('Error cancelling cash payment', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
