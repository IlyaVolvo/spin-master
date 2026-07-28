import express, { Request, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../index';
import { logger } from '../utils/logger';
import { getClubPlansConfig, updateSystemConfig, getPaymentsConfig } from '../services/systemConfigService';
import { scorePinsEqual } from '../utils/scorePin';
import {
  evaluateCourtesy,
  ensureCourtesyObligation,
  notifyAdminsOfCourtesy,
} from '../payments/courtesy';
import { resolvePlanForMember, planChargeAmountCents } from '../payments/resolvePlan';
import { computeValidTo } from '../utils/planDuration';

const router = express.Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getClubTimezone(): string {
  return process.env.CLUB_TIMEZONE || 'UTC';
}

/** Returns the club-local date string "YYYY-MM-DD" for a given instant. */
function getClubDate(date: Date = new Date()): string {
  return date.toLocaleDateString('en-CA', { timeZone: getClubTimezone() }); // en-CA gives YYYY-MM-DD
}

/** Check if user has ADMIN or ORGANIZER role */
function isAdminOrOrganizer(req: AuthRequest): boolean {
  const roles = req.member?.roles || [];
  return roles.includes('ADMIN') || roles.includes('ORGANIZER');
}

/**
 * Get the active entitlement for a member.
 * Checks expiration and exhaustion, auto-updates status if needed.
 */
async function getActiveEntitlement(memberId: number) {
  const entitlement = await prisma.clubEntitlement.findFirst({
    where: { memberId, active: true },
    orderBy: { createdAt: 'desc' },
  });

  if (!entitlement) return null;

  const now = new Date();

  // Check time-based expiration
  if (entitlement.validTo && entitlement.validTo <= now) {
    await prisma.clubEntitlement.update({
      where: { id: entitlement.id },
      data: { active: false },
    });
    return null;
  }

  // Check visit pack exhaustion
  if (entitlement.type === 'VISIT_PACK' && entitlement.visitsRemaining !== null && entitlement.visitsRemaining <= 0) {
    await prisma.clubEntitlement.update({
      where: { id: entitlement.id },
      data: { active: false },
    });
    return null;
  }

  return entitlement;
}

/**
 * Build an expiry warning message if the entitlement is near expiration.
 * Returns null if no warning needed.
 */
function getExpiryWarning(entitlement: {
  type: string;
  validTo: Date | null;
  visitsRemaining: number | null;
}): string | null {
  const reminders = getPaymentsConfig().reminders;
  if (!reminders.checkInBannerEnabled) return null;

  if (entitlement.type === 'VISIT_PACK') {
    if (
      entitlement.visitsRemaining !== null &&
      entitlement.visitsRemaining <= reminders.visitPackVisitsRemaining
    ) {
      return `Only ${entitlement.visitsRemaining} visit(s) remaining on your plan.`;
    }
  } else if (entitlement.validTo) {
    const daysLeft = Math.ceil((entitlement.validTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= reminders.periodDaysBeforeExpiry) {
      return `Your plan expires in ${daysLeft} day(s).`;
    }
  }

  return null;
}

async function tryCourtesyCheckIn(
  memberId: number,
  clubDate: string,
  paymentRequiredMessage: string,
) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { firstName: true, lastName: true, email: true },
  });
  const canPay = Boolean(member?.email);

  const courtesy = await evaluateCourtesy(memberId);
  if (!courtesy.allowed) {
    return {
      action: 'PAYMENT_REQUIRED' as const,
      visit: null,
      warning: courtesy.message || paymentRequiredMessage,
      charged: false,
      entitlement: null,
      courtesy: false,
      canPay,
      paymentInProgress: false,
    };
  }

  const visit = await prisma.clubVisit.create({
    data: {
      memberId,
      clubDate,
      dailyPaymentApplied: false,
      isCourtesy: true,
    },
  });
  await ensureCourtesyObligation(memberId, visit.id);

  const memberName = member ? `${member.firstName} ${member.lastName}`.trim() : `Member ${memberId}`;
  await notifyAdminsOfCourtesy({
    memberId,
    memberName,
    message: courtesy.message,
  });

  const pending = await prisma.clubPayment.findFirst({
    where: { memberId, status: 'PENDING' },
    orderBy: { recordedAt: 'desc' },
  });

  return {
    action: 'CHECK_IN' as const,
    visit,
    warning: courtesy.message,
    charged: false,
    entitlement: null,
    courtesy: true,
    canPay,
    paymentInProgress: Boolean(pending?.externalRef),
  };
}

/**
 * Core check-in/check-out logic for a member.
 * Returns the visit and status info.
 * First check-in of the club-local day may debit entitlement; later check-ins are free.
 */
async function toggleVisit(memberId: number, closedByMethod: 'SCAN' | 'MANUAL') {
  const clubDate = getClubDate();

  // Find open visit (no checkOutAt) for today
  const openVisit = await prisma.clubVisit.findFirst({
    where: { memberId, clubDate, checkOutAt: null },
    orderBy: { checkInAt: 'desc' },
  });

  if (openVisit) {
    // CHECK-OUT: close the open visit
    const updatedVisit = await prisma.clubVisit.update({
      where: { id: openVisit.id },
      data: { checkOutAt: new Date(), closedBy: closedByMethod },
    });
    const entitlement = await getActiveEntitlement(memberId);
    return {
      action: 'CHECK_OUT' as const,
      visit: updatedVisit,
      warning: null,
      charged: false,
      entitlement: entitlement
        ? {
            type: entitlement.type,
            visitsRemaining: entitlement.visitsRemaining,
            validTo: entitlement.validTo,
          }
        : null,
      courtesy: openVisit.isCourtesy,
      canPay: false,
      paymentInProgress: false,
    };
  }

  // CHECK-IN: determine if this is the first visit of the day
  const existingVisitsToday = await prisma.clubVisit.count({
    where: { memberId, clubDate },
  });
  const isFirstVisitOfDay = existingVisitsToday === 0;

  let dailyPaymentApplied = false;
  let warning: string | null = null;

  if (isFirstVisitOfDay) {
    // Get active entitlement and apply payment logic
    const entitlement = await getActiveEntitlement(memberId);

    if (!entitlement) {
      return tryCourtesyCheckIn(
        memberId,
        clubDate,
        'No active plan. Please purchase a plan or contact staff.',
      );
    }

    // Check entitlement type
    switch (entitlement.type) {
      case 'YEARLY':
      case 'MONTHLY':
        // Time-based: covered for the day, record zero-amount ledger
        dailyPaymentApplied = true;
        await prisma.clubPayment.create({
          data: {
            memberId,
            amountCents: 0,
            provider: 'manual',
            purpose: `Covered visit (${entitlement.type})`,
            status: 'SUCCEEDED',
          },
        });
        break;

      case 'VISIT_PACK':
        // Decrement visits remaining
        if (entitlement.visitsRemaining !== null && entitlement.visitsRemaining > 0) {
          dailyPaymentApplied = true;
          await prisma.clubEntitlement.update({
            where: { id: entitlement.id },
            data: { visitsRemaining: entitlement.visitsRemaining - 1 },
          });
          await prisma.clubPayment.create({
            data: {
              memberId,
              amountCents: 0,
              provider: 'manual',
              purpose: `Visit pack debit (${entitlement.visitsRemaining - 1} remaining)`,
              status: 'SUCCEEDED',
            },
          });
        } else {
          return tryCourtesyCheckIn(
            memberId,
            clubDate,
            'Visit pack exhausted. Please purchase a new plan.',
          );
        }
        break;

      case 'PAY_PER_VISIT_EXTERNAL':
        // Check if staff has already recorded payment for today
        const todayPayment = await prisma.clubPayment.findFirst({
          where: {
            memberId,
            status: 'SUCCEEDED',
            recordedAt: {
              gte: new Date(clubDate + 'T00:00:00'),
            },
            purpose: { contains: 'per-visit' },
          },
        });
        if (!todayPayment) {
          // No courtesy for PPV
          const member = await prisma.member.findUnique({
            where: { id: memberId },
            select: { email: true },
          });
          return {
            action: 'PAYMENT_REQUIRED' as const,
            visit: null,
            warning: 'Per-visit payment required. Please pay at the front desk or start checkout.',
            charged: false,
            entitlement: null,
            courtesy: false,
            canPay: Boolean(member?.email),
            paymentInProgress: false,
          };
        }
        dailyPaymentApplied = true;
        break;
    }

    // Build expiry warning
    const refreshedEntitlement = await prisma.clubEntitlement.findUnique({ where: { id: entitlement.id } });
    if (refreshedEntitlement) {
      warning = getExpiryWarning(refreshedEntitlement);
    }
  }

  // Create the visit record
  const visit = await prisma.clubVisit.create({
    data: {
      memberId,
      clubDate,
      dailyPaymentApplied,
    },
  });

  const entitlementAfter = await getActiveEntitlement(memberId);
  if (!warning && entitlementAfter) {
    warning = getExpiryWarning(entitlementAfter);
  }

  const pendingCheckout = await prisma.clubPayment.findFirst({
    where: { memberId, status: 'PENDING', externalRef: { not: null } },
  });

  return {
    action: 'CHECK_IN' as const,
    visit,
    warning,
    charged: dailyPaymentApplied,
    entitlement: entitlementAfter
      ? {
          type: entitlementAfter.type,
          visitsRemaining: entitlementAfter.visitsRemaining,
          validTo: entitlementAfter.validTo,
        }
      : null,
    courtesy: false,
    canPay: false,
    paymentInProgress: Boolean(pendingCheckout),
  };
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

    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, firstName: true, lastName: true, isActive: true, scorePin: true },
    });

    if (!member) {
      return res.status(401).json({ error: 'Invalid PIN' });
    }

    if (!scorePinsEqual(scorePin, member.scorePin)) {
      return res.status(401).json({ error: 'Invalid PIN' });
    }

    if (!member.isActive) {
      return res.status(403).json({ error: 'Member account is inactive' });
    }

    const result = await toggleVisit(member.id, 'MANUAL');

    if (result.action === 'PAYMENT_REQUIRED') {
      return res.status(402).json({
        action: result.action,
        message: result.warning,
        charged: result.charged,
        entitlement: result.entitlement,
        courtesy: result.courtesy,
        canPay: result.canPay,
        paymentInProgress: result.paymentInProgress,
        member: { firstName: member.firstName, lastName: member.lastName },
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
      paymentInProgress: result.paymentInProgress,
      member: { firstName: member.firstName, lastName: member.lastName },
    });
  } catch (error) {
    logger.error('Error processing pin-toggle', {
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

    const result = await toggleVisit(memberId, 'MANUAL');

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
    logger.error('Error toggling visit', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /api/club/kiosk/today-status — bulk presence flags for Players check-in kiosk */
router.get('/kiosk/today-status', async (req: AuthRequest, res: Response) => {
  try {
    const clubDate = getClubDate();
    const visits = await prisma.clubVisit.findMany({
      where: { clubDate },
      select: { memberId: true, checkInAt: true, checkOutAt: true },
      orderBy: { checkInAt: 'desc' },
    });

    const byMember = new Map<
      number,
      { present: boolean; visitedToday: boolean; lastCheckInAt: string | null }
    >();

    for (const visit of visits) {
      const existing = byMember.get(visit.memberId);
      if (!existing) {
        byMember.set(visit.memberId, {
          present: visit.checkOutAt == null,
          visitedToday: true,
          lastCheckInAt: visit.checkInAt.toISOString(),
        });
      } else if (visit.checkOutAt == null) {
        existing.present = true;
      }
    }

    const members = Array.from(byMember.entries()).map(([memberId, status]) => ({
      memberId,
      present: status.present,
      visitedToday: status.visitedToday,
      lastCheckInAt: status.lastCheckInAt,
    }));

    res.json({ clubDate, members });
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
      where: { clubDate },
      select: {
        memberId: true,
        checkInAt: true,
        checkOutAt: true,
        member: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { checkInAt: 'desc' },
    });

    const visitedTodayIds = Array.from(new Set(visits.map((v) => v.memberId)));
    const openByMember = new Map<
      number,
      { memberId: number; firstName: string; lastName: string; lastCheckInAt: string }
    >();

    for (const visit of visits) {
      if (visit.checkOutAt != null) continue;
      if (openByMember.has(visit.memberId)) continue;
      openByMember.set(visit.memberId, {
        memberId: visit.member.id,
        firstName: visit.member.firstName,
        lastName: visit.member.lastName,
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

    const entitlement = await getActiveEntitlement(memberId);

    res.json({
      clubDate,
      visits,
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

    // Check member doesn't already have an active entitlement
    const existingCount = await prisma.clubEntitlement.count({
      where: { memberId, active: true },
    });
    if (existingCount >= 1) {
      return res.status(400).json({ error: 'Member already has an active entitlement. Cancel it first or wait for expiration.' });
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

      const validFrom = new Date();
      let entitlementType: 'MONTHLY' | 'YEARLY' | 'VISIT_PACK';
      let validTo: Date | null = null;
      let visitsRemaining: number | null = null;

      if (plan.kind === 'VISIT') {
        entitlementType = 'VISIT_PACK';
        visitsRemaining = plan.visitCount || 0;
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
          active: true,
          validFrom,
          validTo,
          visitsRemaining,
          planId: plan.id,
          planSegment: plan.segment,
        },
      });

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

    // Apply member's discount
    const member = await prisma.member.findUnique({ where: { id: memberId }, select: { clubDiscount: true } });
    const discount = member?.clubDiscount || 0;
    const price = pricePaid || 0;
    const discountAmount = Math.round(price * discount / 100);
    const finalPrice = price - discountAmount;

    const entitlement = await prisma.clubEntitlement.create({
      data: {
        memberId,
        type,
        active: true,
        validFrom: startsAt ? new Date(startsAt) : new Date(),
        validTo: expiresAt ? new Date(expiresAt) : null,
        visitsRemaining: type === 'VISIT_PACK' ? (visitsTotal || 0) : null,
      },
    });

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
    if (!Number.isInteger(cents) || cents < 0) {
      return res.status(400).json({ error: 'priceCents must be a non-negative integer' });
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
      if (!Number.isInteger(cents) || cents < 0) {
        return res.status(400).json({ error: 'priceCents must be a non-negative integer' });
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

// ─── Cron Endpoint ───────────────────────────────────────────────────────────

/**
 * POST /api/club/cron/auto-checkout
 * Closes all open visits for a given club date.
 * Protected by x-club-cron-secret header.
 * Body (optional): { "clubDate": "YYYY-MM-DD" } — defaults to previous club-local day.
 */
router.post('/cron/auto-checkout', async (req: Request, res: Response) => {
  try {
    const cronSecret = process.env.CLUB_CRON_SECRET;
    const providedSecret = req.headers['x-club-cron-secret'];

    if (cronSecret && providedSecret !== cronSecret) {
      return res.status(403).json({ error: 'Invalid cron secret' });
    }

    // Default to previous club-local day
    let targetDate = req.body?.clubDate;
    if (!targetDate) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      targetDate = getClubDate(yesterday);
    }

    // Close all open visits for the target date
    const result = await prisma.clubVisit.updateMany({
      where: {
        clubDate: targetDate,
        checkOutAt: null,
      },
      data: {
        checkOutAt: new Date(),
        closedBy: 'AUTO',
      },
    });

    logger.info('Auto-checkout completed', { clubDate: targetDate, closedCount: result.count });
    res.json({ clubDate: targetDate, closedCount: result.count });
  } catch (error) {
    logger.error('Error during auto-checkout', { error: error instanceof Error ? error.message : String(error) });
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

export default router;
