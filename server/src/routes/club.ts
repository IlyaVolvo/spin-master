import express, { Request, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../index';
import { logger } from '../utils/logger';
import { getClubPlansConfig, updateSystemConfig } from '../services/systemConfigService';
import { scorePinsEqual } from '../utils/scorePin';

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
  const WARNING_DAYS = 14;
  const WARNING_VISITS = 1;

  if (entitlement.type === 'VISIT_PACK') {
    if (entitlement.visitsRemaining !== null && entitlement.visitsRemaining <= WARNING_VISITS) {
      return `Only ${entitlement.visitsRemaining} visit(s) remaining on your plan.`;
    }
  } else if (entitlement.validTo) {
    const daysLeft = Math.ceil((entitlement.validTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= WARNING_DAYS) {
      return `Your plan expires in ${daysLeft} day(s).`;
    }
  }

  return null;
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
      // No active entitlement — check-in is blocked
      return {
        action: 'PAYMENT_REQUIRED' as const,
        visit: null,
        warning: 'No active plan. Please purchase a plan or contact staff.',
        charged: false,
        entitlement: null,
      };
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
              purpose: `Visit pack debit (${entitlement.visitsRemaining - 1} remaining)`,
              status: 'SUCCEEDED',
            },
          });
        } else {
          return {
            action: 'PAYMENT_REQUIRED' as const,
            visit: null,
            warning: 'Visit pack exhausted. Please purchase a new plan.',
            charged: false,
            entitlement: null,
          };
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
          return {
            action: 'PAYMENT_REQUIRED' as const,
            visit: null,
            warning: 'Per-visit payment required. Please pay at the front desk.',
            charged: false,
            entitlement: null,
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
 *   1. Plan-based (new): { memberId, planId, planCategory, discountType?, discountValue? }
 *   2. Legacy:           { memberId, type, startsAt?, expiresAt?, visitsTotal?, pricePaid? }
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
    if (req.body.planId) {
      const { planId, planCategory, discountType, discountValue } = req.body;
      const category = planCategory || 'Normal';

      const plan = await prisma.clubPlan.findUnique({ where: { id: planId } });
      if (!plan || !plan.isActive) {
        return res.status(400).json({ error: 'Plan not found or inactive' });
      }

      const cfg = plan.config as Record<string, any>;
      const categoryPrice = cfg.prices?.[category];
      if (!categoryPrice) {
        return res.status(400).json({ error: `No price defined for category "${category}" on this plan` });
      }

      const basePriceCents: number = categoryPrice.priceCents || 0;

      // Calculate discount
      let discountAmount = 0;
      if (discountType === 'PERCENT' && typeof discountValue === 'number') {
        discountAmount = Math.round(basePriceCents * Math.min(discountValue, 100) / 100);
      } else if (discountType === 'FIXED' && typeof discountValue === 'number') {
        discountAmount = Math.min(discountValue, basePriceCents);
      }
      const finalPrice = basePriceCents - discountAmount;

      // Derive entitlement fields from plan config
      let entitlementType: string;
      let expiresAt: Date | null = null;
      let visitsTotal: number | null = null;

      if (plan.type === 'PERIOD') {
        entitlementType = 'MONTHLY'; // legacy enum placeholder for period-based
        // expiresAt is NOT set at creation — it's calculated on first use
      } else {
        entitlementType = 'VISIT_PACK';
        visitsTotal = cfg.visitCount || 0;
      }

      const entitlement = await prisma.clubEntitlement.create({
        data: {
          memberId,
          type: entitlementType as any,
          active: true,
          validFrom: new Date(),
          validTo: expiresAt,
          visitsRemaining: visitsTotal,
          planId: plan.id,
          planCategory: category,
        },
      });

      if (finalPrice > 0) {
        await prisma.clubPayment.create({
          data: {
            memberId,
            amountCents: finalPrice,
            purpose: `${plan.name} (${category}) plan purchase`,
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
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    res.json(plans);
  } catch (error) {
    logger.error('Error listing plans', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/club/admin/plans — create a plan */
router.post('/admin/plans', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminOrOrganizer(req)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { name, type, config, sortOrder } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!['PERIOD', 'VISIT_COUNT'].includes(type)) {
      return res.status(400).json({ error: 'type must be PERIOD or VISIT_COUNT' });
    }
    if (!config || typeof config !== 'object') {
      return res.status(400).json({ error: 'config object is required' });
    }

    // Validate config shape
    if (type === 'PERIOD') {
      const validUnits = ['DAY', 'WEEK', 'MONTH', 'YEAR'];
      if (!validUnits.includes(config.periodUnit)) {
        return res.status(400).json({ error: `config.periodUnit must be one of: ${validUnits.join(', ')}` });
      }
      if (!Number.isInteger(config.periodValue) || config.periodValue < 1) {
        return res.status(400).json({ error: 'config.periodValue must be a positive integer' });
      }
    } else {
      if (!Number.isInteger(config.visitCount) || config.visitCount < 1) {
        return res.status(400).json({ error: 'config.visitCount must be a positive integer' });
      }
    }

    if (!config.prices || typeof config.prices !== 'object' || Object.keys(config.prices).length === 0) {
      return res.status(400).json({ error: 'config.prices must have at least one category' });
    }

    const plan = await prisma.clubPlan.create({
      data: {
        name: name.trim(),
        type,
        config,
        sortOrder: sortOrder ?? 0,
      },
    });

    res.status(201).json(plan);
  } catch (error) {
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
    if (req.body.name !== undefined) data.name = req.body.name.trim();
    if (req.body.isActive !== undefined) data.isActive = req.body.isActive;
    if (req.body.sortOrder !== undefined) data.sortOrder = req.body.sortOrder;
    if (req.body.config !== undefined) data.config = req.body.config;

    const updated = await prisma.clubPlan.update({
      where: { id: planId },
      data,
    });

    res.json(updated);
  } catch (error) {
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

/** GET /api/club/admin/plan-config — get plan categories + formula from SystemConfig */
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

/** PUT /api/club/admin/plan-config — update plan categories + formula */
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
    const category = (req.query.category as string) || 'Normal';

    if (isNaN(visitCount) || visitCount < 1) {
      return res.status(400).json({ error: 'visitCount must be a positive integer' });
    }

    const config = getClubPlansConfig();
    const formulaParams = config.visitPricingFormula[category];

    if (!formulaParams) {
      return res.status(400).json({ error: `No formula parameters found for category "${category}"` });
    }

    // Formula: pricePerVisit = basePricePerVisit × (1/visitCount)^exponent
    const pricePerVisitCents = Math.round(
      formulaParams.basePricePerVisitCents * Math.pow(1 / visitCount, formulaParams.exponent)
    );
    const totalPriceCents = pricePerVisitCents * visitCount;

    res.json({
      visitCount,
      category,
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

export default router;
