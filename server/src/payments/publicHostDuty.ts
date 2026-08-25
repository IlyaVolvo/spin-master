import { prisma } from '../index';
import { clubLocalDateTimeUtc, getClubDate } from '../utils/clubDate';
import { buildHostBoardForDate, slotLabel } from './hostBoard';
import { hostHasArrivedForSlot } from './hostArrival';
import { isHostSlotActive } from './hostWindowMath';

export type PublicHostDutyStatus = 'no_assignment' | 'not_arrived' | 'arrived';

export type PublicHostDutySlot = {
  label: string;
  startTime: string;
  endTime: string;
  status: PublicHostDutyStatus;
  hostName: string | null;
  /** Assigned member when status is arrived; used to omit from the member list. */
  memberId: number | null;
};

function memberDisplayName(member: { firstName: string; lastName: string }): string {
  return `${member.firstName} ${member.lastName}`.trim();
}

/** Host slots currently in progress for the public present board. */
export async function loadPublicHostDuty(now: Date = new Date()): Promise<PublicHostDutySlot[]> {
  const clubDate = getClubDate(now);
  const todayYmd = getClubDate(now);
  const slots = await buildHostBoardForDate(clubDate, null, now);

  const activeSlots = slots.filter((slot) => {
    const startAtMs = clubLocalDateTimeUtc(clubDate, slot.startTime).getTime();
    const endAtMs = clubLocalDateTimeUtc(clubDate, slot.endTime).getTime();
    return isHostSlotActive({
      clubDate,
      todayYmd,
      startAtMs,
      endAtMs,
      nowMs: now.getTime(),
    });
  });

  if (activeSlots.length === 0) return [];

  const memberIds = activeSlots
    .map((slot) => slot.member?.id)
    .filter((id): id is number => typeof id === 'number');

  const visits =
    memberIds.length === 0
      ? []
      : await prisma.clubVisit.findMany({
          where: {
            rejectedAt: null,
            clubDate,
            memberId: { in: memberIds },
          },
          select: {
            memberId: true,
            clubDate: true,
            checkInAt: true,
            checkOutAt: true,
          },
        });

  return activeSlots.map((slot) => {
    const label = slotLabel(slot.startTime, slot.endTime, slot.label);
    if (!slot.member) {
      return {
        label,
        startTime: slot.startTime,
        endTime: slot.endTime,
        status: 'no_assignment' as const,
        hostName: null,
        memberId: null,
      };
    }

    const startAtMs = clubLocalDateTimeUtc(clubDate, slot.startTime).getTime();
    const arrived = hostHasArrivedForSlot(
      {
        claimedAt: slot.claimedAt,
        memberId: slot.member.id,
        clubDate,
        startAtMs,
      },
      visits,
    );

    if (arrived) {
      return {
        label,
        startTime: slot.startTime,
        endTime: slot.endTime,
        status: 'arrived' as const,
        hostName: memberDisplayName(slot.member),
        memberId: slot.member.id,
      };
    }

    return {
      label,
      startTime: slot.startTime,
      endTime: slot.endTime,
      status: 'not_arrived' as const,
      hostName: null,
      memberId: null,
    };
  });
}
