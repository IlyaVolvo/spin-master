import { prisma } from '../index';
import { getLessonsConfig } from './systemConfigService';
import { addMinutesToHhmm, rangesOverlap } from '../utils/lessonTime';

export type BusyInterval = {
  clubDate: string;
  startTime: string;
  endTime: string;
  kind: 'individual' | 'group';
  id: number;
  playerFirstName?: string | null;
  playerLastName?: string | null;
};

export async function coachBusyIntervals(
  coachProfileId: number,
  from: string,
  to: string,
): Promise<BusyInterval[]> {
  const [lessons, groupRows] = await Promise.all([
    prisma.individualLesson.findMany({
      where: {
        coachProfileId,
        status: 'CONFIRMED',
        clubDate: { gte: from, lte: to },
      },
      select: {
        id: true,
        clubDate: true,
        startTime: true,
        endTime: true,
        player: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.groupClassOccurrence.findMany({
      where: {
        cancelled: false,
        clubDate: { gte: from, lte: to },
        groupClass: { coaches: { some: { coachProfileId } } },
      },
      select: { id: true, clubDate: true, startTime: true, endTime: true },
    }),
  ]);
  return [
    ...lessons.map((row) => ({
      id: row.id,
      clubDate: row.clubDate,
      startTime: row.startTime,
      endTime: row.endTime,
      kind: 'individual' as const,
      playerFirstName: row.player.firstName,
      playerLastName: row.player.lastName,
    })),
    ...groupRows.map((row) => ({ ...row, kind: 'group' as const })),
  ];
}

export async function playerBusyIntervals(
  memberId: number,
  from: string,
  to: string,
): Promise<BusyInterval[]> {
  const [lessons, regs] = await Promise.all([
    prisma.individualLesson.findMany({
      where: {
        playerMemberId: memberId,
        status: 'CONFIRMED',
        clubDate: { gte: from, lte: to },
      },
      select: { id: true, clubDate: true, startTime: true, endTime: true },
    }),
    prisma.groupClassRegistration.findMany({
      where: {
        memberId,
        status: 'REGISTERED',
        occurrence: { cancelled: false, clubDate: { gte: from, lte: to } },
      },
      select: {
        id: true,
        occurrence: { select: { clubDate: true, startTime: true, endTime: true } },
      },
    }),
  ]);
  return [
    ...lessons.map((row) => ({ ...row, kind: 'individual' as const })),
    ...regs.map((row) => ({
      id: row.id,
      clubDate: row.occurrence.clubDate,
      startTime: row.occurrence.startTime,
      endTime: row.occurrence.endTime,
      kind: 'group' as const,
    })),
  ];
}

export function intervalConflicts(
  busy: BusyInterval[],
  clubDate: string,
  startTime: string,
  endTime: string,
  bufferMinutes = getLessonsConfig().busyBufferMinutes,
): BusyInterval | null {
  return (
    busy.find((row) => {
      if (row.clubDate !== clubDate) return false;
      const busyStart = addMinutesToHhmm(row.startTime, -bufferMinutes);
      const busyEnd = addMinutesToHhmm(row.endTime, bufferMinutes);
      return rangesOverlap(startTime, endTime, busyStart, busyEnd, 0);
    }) || null
  );
}

export async function assertCoachAndPlayerFree(params: {
  coachProfileId: number;
  playerMemberId?: number | null;
  clubDate: string;
  startTime: string;
  endTime: string;
}): Promise<void> {
  const coachBusy = await coachBusyIntervals(params.coachProfileId, params.clubDate, params.clubDate);
  if (intervalConflicts(coachBusy, params.clubDate, params.startTime, params.endTime)) {
    throw new Error('Time conflicts with an existing lesson or class for this coach');
  }
  if (params.playerMemberId) {
    const playerBusy = await playerBusyIntervals(params.playerMemberId, params.clubDate, params.clubDate);
    if (intervalConflicts(playerBusy, params.clubDate, params.startTime, params.endTime)) {
      throw new Error('Time conflicts with another lesson for this player');
    }
  }
}
