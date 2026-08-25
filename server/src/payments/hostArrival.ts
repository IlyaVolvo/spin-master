import { visitCountsAsHostArrival } from './hostEmailMath';

export type HostArrivalVisit = {
  memberId: number;
  clubDate: string;
  checkInAt: Date;
  checkOutAt: Date | null;
};

/** True when the assigned host has arrived for this slot (claimed or qualifying visit). */
export function hostHasArrivedForSlot(
  shift: {
    claimedAt: Date | string | null;
    memberId: number | null;
    clubDate: string;
    startAtMs: number;
  },
  visits: HostArrivalVisit[],
): boolean {
  if (shift.claimedAt) return true;
  if (shift.memberId == null) return false;
  return visits.some(
    (visit) =>
      visit.memberId === shift.memberId &&
      visit.clubDate === shift.clubDate &&
      visitCountsAsHostArrival({
        checkInAtMs: visit.checkInAt.getTime(),
        checkOutAtMs: visit.checkOutAt ? visit.checkOutAt.getTime() : null,
        slotStartMs: shift.startAtMs,
      }),
  );
}
