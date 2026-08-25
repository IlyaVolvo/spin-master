import { prisma } from '../index';
import { getClubDate } from '../utils/clubDate';
import { emitHostBoardUpdated } from '../services/socketService';
import { ensureHostPerkGrant } from './hostPerkService';
import { hostClaimWindowState } from './hostWindow';

export class HostClaimError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function claimHostShift(args: {
  memberId: number;
  shiftId: number;
  now?: Date;
}) {
  const now = args.now || new Date();
  const shift = await prisma.hostShift.findUnique({
    where: { id: args.shiftId },
    include: { perkGrants: { where: { memberId: args.memberId }, select: { id: true } } },
  });
  if (!shift) throw new HostClaimError(404, 'Host shift not found');
  if (shift.memberId !== args.memberId) {
    throw new HostClaimError(403, 'You are not assigned as host for this slot');
  }

  const window = hostClaimWindowState(shift.clubDate, shift.startTime, shift.endTime, now);
  if (!window.open) {
    throw new HostClaimError(400, 'Host claim window is closed for this slot');
  }

  const clubDate = getClubDate(now);
  const visit = await prisma.clubVisit.findFirst({
    where: { memberId: args.memberId, clubDate, rejectedAt: null },
    orderBy: { checkInAt: 'asc' },
    select: { id: true },
  });
  if (!visit) {
    throw new HostClaimError(400, 'Check in first, then claim host');
  }

  const updated = await prisma.hostShift.update({
    where: { id: shift.id },
    data: {
      claimedAt: shift.claimedAt || now,
      claimedVisitId: shift.claimedVisitId || visit.id,
    },
  });

  const grant = await ensureHostPerkGrant(shift.id, args.memberId);
  emitHostBoardUpdated({ clubDate: shift.clubDate });
  return { shift: updated, grant };
}
