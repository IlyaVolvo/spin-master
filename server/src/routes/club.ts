import express, { NextFunction, Response } from 'express';
import type { ClubEntitlementType } from '@prisma/client';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';
import { getClubDateString, getClubTimezone } from '../utils/clubTimezone';
import {
  autoCheckoutForClubDate,
  defaultAutoCheckoutClubDate,
  processManualToggleForMember,
  processMemberQrScan,
} from '../services/clubVisitService';
import type { ScanResult } from '../services/clubVisitService';

const router = express.Router();

function serializeVisit(v: { id: number; clubDate: string; checkedInAt: Date; checkedOutAt: Date | null; dailyPaymentApplied: boolean }) {
  return {
    id: v.id,
    clubDate: v.clubDate,
    checkedInAt: v.checkedInAt.toISOString(),
    checkedOutAt: v.checkedOutAt ? v.checkedOutAt.toISOString() : null,
    dailyPaymentApplied: v.dailyPaymentApplied,
  };
}

function serializeScan(result: ScanResult) {
  if (result.action === 'CHECK_OUT') {
    return {
      action: result.action,
      member: result.member,
      visit: serializeVisit(result.visit),
    };
  }
  if (result.action === 'CHECK_IN') {
    return {
      action: result.action,
      member: result.member,
      visit: serializeVisit(result.visit),
      entitlementWarning: result.entitlementWarning,
    };
  }
  return {
    action: result.action,
    member: result.member,
    needsPayment: true,
    entitlementWarning: result.entitlementWarning,
  };
}

router.get('/public-config', (_req, res) => {
  res.json({ clubTimezone: getClubTimezone() });
});

/**
 * Public: QR kiosk sends the raw value encoded in the member QR (matches `members.qrTokenHash`).
 */
router.post('/scan', async (req, res) => {
  try {
    const raw = req.body?.qrToken ?? req.body?.token;
    const qrToken = typeof raw === 'string' ? raw : '';
    const result = await processMemberQrScan(qrToken);
    res.json(serializeScan(result));
  } catch (err: unknown) {
    const status = typeof err === 'object' && err && 'status' in err ? Number((err as { status: number }).status) : 500;
    const message = err instanceof Error ? err.message : 'Scan failed';
    if (status >= 500) {
      logger.error('Club scan error', { error: message });
    }
    res.status(status >= 400 && status < 600 ? status : 500).json({ error: message });
  }
});

async function requireStaff(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.memberId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const m = await prisma.member.findUnique({
    where: { id: req.memberId },
    select: { roles: true },
  });
  const ok = m?.roles?.some((r) => r === 'ADMIN' || r === 'ORGANIZER');
  if (!ok) {
    return res.status(403).json({ error: 'Organizer or admin access required' });
  }
  return next();
}

/** Logged-in member: manual check-in / check-out (same rules as QR). */
router.post('/self/toggle', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.memberId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const result = await processManualToggleForMember(req.memberId);
    res.json(serializeScan(result));
  } catch (err: unknown) {
    const status = typeof err === 'object' && err && 'status' in err ? Number((err as { status: number }).status) : 500;
    const message = err instanceof Error ? err.message : 'Toggle failed';
    res.status(status >= 400 && status < 600 ? status : 500).json({ error: message });
  }
});

/** Current member: open visit today (club-local date) if any. */
router.get('/self/today', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.memberId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const clubDate = getClubDateString();
    const open = await prisma.clubVisit.findFirst({
      where: {
        memberId: req.memberId,
        clubDate,
        checkedOutAt: null,
      },
      orderBy: { checkedInAt: 'desc' },
    });
    res.json({
      clubDate,
      openVisit: open ? serializeVisit(open) : null,
    });
  } catch (err) {
    logger.error('Club self/today error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/admin/entitlements/:memberId', authenticate, requireStaff, async (req: AuthRequest, res) => {
  try {
    const memberId = parseInt(req.params.memberId, 10);
    if (Number.isNaN(memberId)) {
      return res.status(400).json({ error: 'Invalid member id' });
    }
    const rows = await prisma.clubEntitlement.findMany({
      where: { memberId },
      orderBy: { id: 'desc' },
    });
    res.json(rows);
  } catch (err) {
    logger.error('Club list entitlements error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/admin/entitlements', authenticate, requireStaff, async (req: AuthRequest, res) => {
  try {
    const { memberId, type, label, validFrom, validTo, visitsRemaining } = req.body ?? {};
    const mid = typeof memberId === 'number' ? memberId : parseInt(String(memberId), 10);
    if (!mid || Number.isNaN(mid)) {
      return res.status(400).json({ error: 'memberId is required' });
    }
    const allowed: ClubEntitlementType[] = ['YEARLY', 'MONTHLY', 'VISIT_PACK', 'PAY_PER_VISIT_EXTERNAL'];
    if (!type || !allowed.includes(type)) {
      return res.status(400).json({ error: 'Invalid type' });
    }
    const from = validFrom ? new Date(validFrom) : null;
    if (!from || Number.isNaN(from.getTime())) {
      return res.status(400).json({ error: 'validFrom is required (ISO date)' });
    }
    const to = validTo ? new Date(validTo) : null;
    const vr =
      visitsRemaining === undefined || visitsRemaining === null
        ? null
        : parseInt(String(visitsRemaining), 10);
    if (vr !== null && Number.isNaN(vr)) {
      return res.status(400).json({ error: 'visitsRemaining must be a number' });
    }

    const row = await prisma.clubEntitlement.create({
      data: {
        memberId: mid,
        type,
        label: typeof label === 'string' ? label : null,
        validFrom: from,
        validTo: to && !Number.isNaN(to.getTime()) ? to : null,
        visitsRemaining: vr,
      },
    });
    res.status(201).json(row);
  } catch (err) {
    logger.error('Club create entitlement error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** Staff: record that per-visit fee was collected elsewhere (cash / external PSP). Enables `PAY_PER_VISIT_EXTERNAL` for that day. */
router.post('/admin/record-per-visit-payment', authenticate, requireStaff, async (req: AuthRequest, res) => {
  try {
    const { memberId, clubDate, amountCents } = req.body ?? {};
    const mid = typeof memberId === 'number' ? memberId : parseInt(String(memberId), 10);
    if (!mid || Number.isNaN(mid)) {
      return res.status(400).json({ error: 'memberId is required' });
    }
    const dateStr =
      typeof clubDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(clubDate)
        ? clubDate
        : getClubDateString();
    const cents = amountCents !== undefined && amountCents !== null ? parseInt(String(amountCents), 10) : 0;
    if (Number.isNaN(cents) || cents < 0) {
      return res.status(400).json({ error: 'amountCents invalid' });
    }

    const pay = await prisma.clubPayment.create({
      data: {
        memberId: mid,
        amountCents: cents,
        provider: 'MANUAL',
        status: 'SUCCEEDED',
        purpose: 'PER_VISIT_DAY',
        metadata: { clubDate: dateStr },
      },
    });
    res.status(201).json(pay);
  } catch (err) {
    logger.error('Club record per-visit payment error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Secured cron: close all open visits for a club calendar day (default = previous day in club TZ).
 * Set header `x-club-cron-secret` to CLUB_CRON_SECRET, or use in development with secret unset (no-op protection).
 */
router.post('/cron/auto-checkout', async (req, res) => {
  const secret = process.env.CLUB_CRON_SECRET?.trim();
  const header = req.headers['x-club-cron-secret'];
  const provided = typeof header === 'string' ? header : '';
  if (secret) {
    if (provided !== secret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  } else if (process.env.NODE_ENV === 'production') {
    return res.status(501).json({ error: 'CLUB_CRON_SECRET must be set in production' });
  }

  try {
    const raw = req.body?.clubDate;
    const clubDate =
      typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : defaultAutoCheckoutClubDate();
    const closed = await autoCheckoutForClubDate(clubDate);
    res.json({ clubDate, closedCount: closed });
  } catch (err) {
    logger.error('Club auto-checkout error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
