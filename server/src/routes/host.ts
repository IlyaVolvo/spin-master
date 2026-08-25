import express, { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../index';
import { logger } from '../utils/logger';
import { getClubDate, addDaysToYmd } from '../utils/clubDate';
import { parseHm, parseYmd, parseNonNegInt, isValidTimeRange } from '../payments/hostTime';
import { buildHostBoardForDate } from '../payments/hostBoard';
import { loadPublicHostDuty } from '../payments/publicHostDuty';
import {
  assignCatalogShift,
  assignExistingShift,
  createCustomShift,
  HostAssignError,
} from '../payments/hostAssign';
import { claimHostShift, HostClaimError } from '../payments/hostClaim';
import { hostClaimWindowState } from '../payments/hostWindow';

const router = express.Router();

function isAdmin(req: AuthRequest): boolean {
  return (req.member?.roles || []).includes('ADMIN');
}

function ymdOr400(value: unknown, res: Response): string | null {
  const ymd = parseYmd(value);
  if (!ymd) {
    res.status(400).json({ error: 'clubDate must be YYYY-MM-DD' });
    return null;
  }
  return ymd;
}

/** GET /api/club/host/on-duty — active host slots with arrival status (compact) */
router.get('/host/on-duty', async (_req: AuthRequest, res: Response) => {
  try {
    const clubDate = getClubDate();
    const hosts = await loadPublicHostDuty();
    res.json({
      clubDate,
      hosts: hosts.map(({ memberId: _memberId, ...host }) => host),
    });
  } catch (error) {
    logger.error('Error loading host on-duty', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /api/club/host/today — public-to-members today board */
router.get('/host/today', async (req: AuthRequest, res: Response) => {
  try {
    const clubDate = getClubDate();
    const slots = await buildHostBoardForDate(clubDate, req.memberId);
    res.json({ clubDate, slots });
  } catch (error) {
    logger.error('Error loading host board', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/club/host/claim — assigned host claims a shift */
router.post('/host/claim', async (req: AuthRequest, res: Response) => {
  try {
    const memberId = req.memberId;
    if (!memberId) return res.status(401).json({ error: 'Authentication required' });
    const shiftId = Number(req.body?.shiftId);
    if (!Number.isInteger(shiftId) || shiftId < 1) {
      return res.status(400).json({ error: 'shiftId is required' });
    }
    const result = await claimHostShift({ memberId, shiftId });
    res.json({ ok: true, grant: result.grant, claimedAt: result.shift.claimedAt });
  } catch (error) {
    if (error instanceof HostClaimError) {
      return res.status(error.status).json({ error: error.message });
    }
    logger.error('Error claiming host', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /api/club/admin/host/assignees — active members for the host picker */
router.get('/admin/host/assignees', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });
    const members = await prisma.member.findMany({
      where: { isActive: true },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    res.json({ members });
  } catch (error) {
    logger.error('Error listing host assignees', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /api/club/admin/host/templates */
router.get('/admin/host/templates', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });
    const includeInactive = req.query.includeInactive === '1' || req.query.includeInactive === 'true';
    const templates = await prisma.hostSlotTemplate.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { startTime: 'asc' }, { id: 'asc' }],
    });
    res.json({ templates });
  } catch (error) {
    logger.error('Error listing host templates', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/club/admin/host/templates */
router.post('/admin/host/templates', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });
    const startTime = parseHm(req.body?.startTime);
    const endTime = parseHm(req.body?.endTime);
    if (!startTime || !endTime || !isValidTimeRange(startTime, endTime)) {
      return res.status(400).json({ error: 'startTime and endTime must be HH:mm with start before end' });
    }
    const label = typeof req.body?.label === 'string' ? req.body.label.trim() || null : null;
    const sortOrder = Number.isInteger(req.body?.sortOrder) ? req.body.sortOrder : 0;
    const template = await prisma.hostSlotTemplate.create({
      data: { startTime, endTime, label, sortOrder },
    });
    res.status(201).json({ template });
  } catch (error) {
    logger.error('Error creating host template', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** PUT /api/club/admin/host/templates/:id */
router.put('/admin/host/templates/:id', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid template id' });
    const existing = await prisma.hostSlotTemplate.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Template not found' });

    const data: { startTime?: string; endTime?: string; label?: string | null; sortOrder?: number; isActive?: boolean } = {};
    if (req.body?.startTime !== undefined) {
      const startTime = parseHm(req.body.startTime);
      if (!startTime) return res.status(400).json({ error: 'startTime must be HH:mm' });
      data.startTime = startTime;
    }
    if (req.body?.endTime !== undefined) {
      const endTime = parseHm(req.body.endTime);
      if (!endTime) return res.status(400).json({ error: 'endTime must be HH:mm' });
      data.endTime = endTime;
    }
    const nextStart = data.startTime || existing.startTime;
    const nextEnd = data.endTime || existing.endTime;
    if (!isValidTimeRange(nextStart, nextEnd)) {
      return res.status(400).json({ error: 'startTime must be before endTime' });
    }
    if (req.body?.label !== undefined) {
      data.label = typeof req.body.label === 'string' ? req.body.label.trim() || null : null;
    }
    if (req.body?.sortOrder !== undefined) data.sortOrder = parseNonNegInt(req.body.sortOrder, existing.sortOrder);
    if (req.body?.isActive !== undefined) data.isActive = Boolean(req.body.isActive);

    const template = await prisma.hostSlotTemplate.update({ where: { id }, data });
    res.json({ template });
  } catch (error) {
    logger.error('Error updating host template', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /api/club/admin/host/board?from=&to= */
router.get('/admin/host/board', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });
    const from = parseYmd(req.query.from) || getClubDate();
    const to = parseYmd(req.query.to) || from;
    if (to < from) return res.status(400).json({ error: 'to must be on or after from' });

    const days: { clubDate: string; slots: Awaited<ReturnType<typeof buildHostBoardForDate>> }[] = [];
    let cursor = from;
    let guard = 0;
    while (cursor <= to && guard < 62) {
      days.push({ clubDate: cursor, slots: await buildHostBoardForDate(cursor, null) });
      cursor = addDaysToYmd(cursor, 1);
      guard += 1;
    }
    const templates = await prisma.hostSlotTemplate.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { startTime: 'asc' }, { id: 'asc' }],
    });
    res.json({ from, to, templates, days });
  } catch (error) {
    logger.error('Error loading admin host board', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/club/admin/host/assign — catalog cell or existing shift */
router.post('/admin/host/assign', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });
    const memberIdRaw = req.body?.memberId;
    const memberId =
      memberIdRaw == null || memberIdRaw === ''
        ? null
        : Number(memberIdRaw);
    if (memberId != null && (!Number.isInteger(memberId) || memberId < 1)) {
      return res.status(400).json({ error: 'memberId must be a positive integer or null' });
    }
    const repeatWeeks = Math.max(1, parseNonNegInt(req.body?.repeatWeeks, 1) || 1);

    if (req.body?.shiftId != null) {
      const shiftId = Number(req.body.shiftId);
      if (!Number.isInteger(shiftId) || shiftId < 1) {
        return res.status(400).json({ error: 'shiftId is invalid' });
      }
      const shift = await assignExistingShift({ shiftId, memberId });
      return res.json({
        shift,
        window: hostClaimWindowState(shift.clubDate, shift.startTime, shift.endTime),
      });
    }

    const clubDate = ymdOr400(req.body?.clubDate, res);
    if (!clubDate) return;
    const templateId = Number(req.body?.templateId);
    if (!Number.isInteger(templateId) || templateId < 1) {
      return res.status(400).json({ error: 'templateId or shiftId is required' });
    }
    const result = await assignCatalogShift({ clubDate, templateId, memberId, repeatWeeks });
    res.json(result);
  } catch (error) {
    if (error instanceof HostAssignError) {
      return res.status(error.status).json({ error: error.message });
    }
    logger.error('Error assigning host', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/club/admin/host/custom */
router.post('/admin/host/custom', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });
    const clubDate = ymdOr400(req.body?.clubDate, res);
    if (!clubDate) return;
    const memberIdRaw = req.body?.memberId;
    const memberId =
      memberIdRaw == null || memberIdRaw === ''
        ? null
        : Number(memberIdRaw);
    if (memberId != null && (!Number.isInteger(memberId) || memberId < 1)) {
      return res.status(400).json({ error: 'memberId must be a positive integer or null' });
    }
    const repeatWeeks = Math.max(1, parseNonNegInt(req.body?.repeatWeeks, 1) || 1);
    const result = await createCustomShift({
      clubDate,
      startTime: String(req.body?.startTime || ''),
      endTime: String(req.body?.endTime || ''),
      memberId,
      repeatWeeks,
    });
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof HostAssignError) {
      return res.status(error.status).json({ error: error.message });
    }
    logger.error('Error creating custom host shift', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
