import { prisma } from '../index';
import { addDaysToYmd } from '../utils/clubDate';
import { emitHostBoardUpdated } from '../services/socketService';
import { ensureHostPerkGrant } from './hostPerkService';
import { hostClaimWindowState } from './hostWindow';
import { isValidTimeRange, parseHm } from './hostTime';

export class HostAssignError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function requireActiveMember(memberId: number) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true, isActive: true, firstName: true, lastName: true },
  });
  if (!member) throw new HostAssignError(404, 'Member not found');
  if (!member.isActive) throw new HostAssignError(400, 'Member is not active');
  return member;
}

async function maybeAutoGrant(shift: {
  id: number;
  clubDate: string;
  startTime: string;
  endTime: string;
  memberId: number | null;
}, now: Date) {
  if (memberIdMissing(shift.memberId)) return;
  const window = hostClaimWindowState(shift.clubDate, shift.startTime, shift.endTime, now);
  if (window.past) {
    await ensureHostPerkGrant(shift.id, shift.memberId as number);
  }
}

function memberIdMissing(memberId: number | null | undefined): memberId is null | undefined {
  return memberId == null;
}

export async function assignCatalogShift(args: {
  clubDate: string;
  templateId: number;
  memberId: number | null;
  repeatWeeks?: number;
  now?: Date;
}): Promise<{ created: number; updated: number; skipped: number }> {
  const now = args.now || new Date();
  const template = await prisma.hostSlotTemplate.findUnique({ where: { id: args.templateId } });
  if (!template || !template.isActive) {
    throw new HostAssignError(404, 'Host slot template not found');
  }
  if (args.memberId != null) {
    await requireActiveMember(args.memberId);
  }

  const weeks = Math.max(1, Math.floor(args.repeatWeeks || 1));
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (let w = 0; w < weeks; w += 1) {
    const clubDate = addDaysToYmd(args.clubDate, w * 7);
    const existing = await prisma.hostShift.findFirst({
      where: { clubDate, templateId: template.id },
    });

    if (w > 0 && existing?.memberId) {
      skipped += 1;
      continue;
    }

    if (!existing) {
      if (args.memberId == null) {
        skipped += 1;
        continue;
      }
      const shift = await prisma.hostShift.create({
        data: {
          clubDate,
          startTime: template.startTime,
          endTime: template.endTime,
          templateId: template.id,
          memberId: args.memberId,
          claimedAt: null,
          claimedVisitId: null,
        },
      });
      await maybeAutoGrant(shift, now);
      created += 1;
      continue;
    }

    const memberChanged = existing.memberId !== args.memberId;
    const shift = await prisma.hostShift.update({
      where: { id: existing.id },
      data: {
        memberId: args.memberId,
        startTime: template.startTime,
        endTime: template.endTime,
        ...(memberChanged
          ? { claimedAt: null, claimedVisitId: null, reminderEmailedAt: null, noShowEmailedAt: null }
          : {}),
      },
    });
    await maybeAutoGrant(shift, now);
    updated += 1;
  }

  emitHostBoardUpdated({ clubDate: args.clubDate });
  return { created, updated, skipped };
}

export async function assignExistingShift(args: {
  shiftId: number;
  memberId: number | null;
  now?: Date;
}) {
  const now = args.now || new Date();
  const existing = await prisma.hostShift.findUnique({ where: { id: args.shiftId } });
  if (!existing) throw new HostAssignError(404, 'Host shift not found');
  if (args.memberId != null) {
    await requireActiveMember(args.memberId);
  }
  const memberChanged = existing.memberId !== args.memberId;
  const shift = await prisma.hostShift.update({
    where: { id: existing.id },
    data: {
      memberId: args.memberId,
      ...(memberChanged
        ? { claimedAt: null, claimedVisitId: null, reminderEmailedAt: null, noShowEmailedAt: null }
        : {}),
    },
  });
  await maybeAutoGrant(shift, now);
  emitHostBoardUpdated({ clubDate: shift.clubDate });
  return shift;
}

export async function createCustomShift(args: {
  clubDate: string;
  startTime: string;
  endTime: string;
  memberId?: number | null;
  repeatWeeks?: number;
  now?: Date;
}): Promise<{ created: number; skipped: number }> {
  const now = args.now || new Date();
  const startTime = parseHm(args.startTime);
  const endTime = parseHm(args.endTime);
  if (!startTime || !endTime || !isValidTimeRange(startTime, endTime)) {
    throw new HostAssignError(400, 'startTime and endTime must be HH:mm with start before end');
  }
  if (args.memberId != null) {
    await requireActiveMember(args.memberId);
  }

  const weeks = Math.max(1, Math.floor(args.repeatWeeks || 1));
  let created = 0;
  let skipped = 0;

  for (let w = 0; w < weeks; w += 1) {
    const clubDate = addDaysToYmd(args.clubDate, w * 7);
    const existing = await prisma.hostShift.findFirst({
      where: { clubDate, templateId: null, startTime, endTime },
    });
    if (existing?.memberId && w > 0) {
      skipped += 1;
      continue;
    }
    if (!existing) {
      const shift = await prisma.hostShift.create({
        data: {
          clubDate,
          startTime,
          endTime,
          templateId: null,
          memberId: args.memberId ?? null,
          claimedAt: null,
          claimedVisitId: null,
        },
      });
      await maybeAutoGrant(shift, now);
      created += 1;
      continue;
    }
    if (w === 0) {
      const shift = await prisma.hostShift.update({
        where: { id: existing.id },
        data: {
          memberId: args.memberId ?? null,
          claimedAt: null,
          claimedVisitId: null,
          reminderEmailedAt: null,
          noShowEmailedAt: null,
        },
      });
      await maybeAutoGrant(shift, now);
      created += 1;
    } else {
      skipped += 1;
    }
  }

  emitHostBoardUpdated({ clubDate: args.clubDate });
  return { created, skipped };
}
