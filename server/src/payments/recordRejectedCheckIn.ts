import { prisma } from '../index';

export type RejectedCheckInClosedBy = 'SCAN' | 'MANUAL';

export type RecordRejectedCheckInParams = {
  memberId: number;
  clubDate: string;
  closedBy: RejectedCheckInClosedBy;
  reason: string;
  at?: Date;
};

/** Prisma create payload for a rejected check-in attempt (closed immediately). */
export function buildRejectedVisitCreateData(params: RecordRejectedCheckInParams) {
  const at = params.at ?? new Date();
  return {
    memberId: params.memberId,
    clubDate: params.clubDate,
    checkInAt: at,
    checkOutAt: at,
    closedBy: params.closedBy,
    dailyPaymentApplied: false,
    rejectedAt: at,
    rejectionReason: params.reason || 'Check-in rejected',
  };
}

/** Persist a rejected check-in attempt so it appears in Attendance Log. */
export async function recordRejectedCheckIn(params: RecordRejectedCheckInParams) {
  return prisma.clubVisit.create({
    data: buildRejectedVisitCreateData(params),
  });
}
