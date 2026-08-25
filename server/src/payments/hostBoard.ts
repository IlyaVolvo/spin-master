import { prisma } from '../index';
import { hostClaimWindowState, hostGraceMinutes } from './hostWindow';

export type HostBoardMember = {
  id: number;
  firstName: string;
  lastName: string;
};

export type HostBoardGrant = {
  memberId: number;
  status: 'PENDING' | 'APPLIED';
  daysAdded: number;
  visitsAdded: number;
};

export type HostBoardSlot = {
  shiftId: number | null;
  templateId: number | null;
  custom: boolean;
  startTime: string;
  endTime: string;
  label: string | null;
  member: HostBoardMember | null;
  claimedAt: string | null;
  perkGrants: HostBoardGrant[];
  windowOpen: boolean;
  windowPast: boolean;
  claimable: boolean;
};

type ViewerId = number | null | undefined;

export function slotLabel(startTime: string, endTime: string, label?: string | null): string {
  const range = `${startTime}–${endTime}`;
  const extra = label?.trim();
  return extra ? `${extra} ${range}` : range;
}

function serializeSlot(args: {
  shiftId: number | null;
  templateId: number | null;
  custom: boolean;
  startTime: string;
  endTime: string;
  label: string | null;
  member: HostBoardMember | null;
  claimedAt: Date | null;
  perkGrants: HostBoardGrant[];
  clubDate: string;
  viewerId: ViewerId;
  now: Date;
  graceMinutes: number;
}): HostBoardSlot {
  const window = hostClaimWindowState(
    args.clubDate,
    args.startTime,
    args.endTime,
    args.now,
    args.graceMinutes,
  );
  const assignedToViewer =
    args.viewerId != null && args.member != null && args.member.id === args.viewerId;
  return {
    shiftId: args.shiftId,
    templateId: args.templateId,
    custom: args.custom,
    startTime: args.startTime,
    endTime: args.endTime,
    label: args.label,
    member: args.member,
    claimedAt: args.claimedAt ? args.claimedAt.toISOString() : null,
    perkGrants: args.perkGrants,
    windowOpen: window.open,
    windowPast: window.past,
    claimable: Boolean(assignedToViewer && args.shiftId && window.open && !args.claimedAt),
  };
}

export async function buildHostBoardForDate(
  clubDate: string,
  viewerId?: ViewerId,
  now: Date = new Date(),
): Promise<HostBoardSlot[]> {
  const graceMinutes = hostGraceMinutes();
  const [templates, shifts] = await Promise.all([
    prisma.hostSlotTemplate.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { startTime: 'asc' }, { id: 'asc' }],
    }),
    prisma.hostShift.findMany({
      where: { clubDate },
      include: {
        member: { select: { id: true, firstName: true, lastName: true } },
        perkGrants: {
          select: { memberId: true, status: true, daysAdded: true, visitsAdded: true },
        },
      },
    }),
  ]);

  const byTemplate = new Map<number, (typeof shifts)[number]>();
  const customs: typeof shifts = [];
  for (const shift of shifts) {
    if (shift.templateId != null) byTemplate.set(shift.templateId, shift);
    else customs.push(shift);
  }

  const slots: HostBoardSlot[] = [];
  for (const template of templates) {
    const shift = byTemplate.get(template.id) ?? null;
    slots.push(
      serializeSlot({
        shiftId: shift?.id ?? null,
        templateId: template.id,
        custom: false,
        startTime: shift?.startTime ?? template.startTime,
        endTime: shift?.endTime ?? template.endTime,
        label: template.label,
        member: shift?.member ?? null,
        claimedAt: shift?.claimedAt ?? null,
        perkGrants: (shift?.perkGrants || []).map((g) => ({
          memberId: g.memberId,
          status: g.status,
          daysAdded: g.daysAdded,
          visitsAdded: g.visitsAdded,
        })),
        clubDate,
        viewerId,
        now,
        graceMinutes,
      }),
    );
  }

  for (const shift of customs) {
    slots.push(
      serializeSlot({
        shiftId: shift.id,
        templateId: null,
        custom: true,
        startTime: shift.startTime,
        endTime: shift.endTime,
        label: null,
        member: shift.member,
        claimedAt: shift.claimedAt,
        perkGrants: shift.perkGrants.map((g) => ({
          memberId: g.memberId,
          status: g.status,
          daysAdded: g.daysAdded,
          visitsAdded: g.visitsAdded,
        })),
        clubDate,
        viewerId,
        now,
        graceMinutes,
      }),
    );
  }

  slots.sort((a, b) => {
    if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
    if (a.endTime !== b.endTime) return a.endTime.localeCompare(b.endTime);
    return (a.shiftId || 0) - (b.shiftId || 0);
  });
  return slots;
}
