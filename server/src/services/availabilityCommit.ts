import { prisma } from '../index';
import { getLessonsConfig } from './systemConfigService';
import {
  clubHoursContainRange,
  horizonEndYmd,
  isFifteenMinuteSnap,
  parseMinutes,
  rangesOverlap,
} from '../utils/lessonTime';
import { getClubDate } from '../utils/clubDate';
import { startOfWeekMonday } from '../utils/lessonTime';
import {
  cancelAvailabilityOccurrence,
  createAvailabilitySeries,
  listAvailability,
} from './availabilityService';
import { cancelIndividualLesson } from './individualLessonService';
import { notifyLessonCalendar } from './lessonCalendarEvents';
import type { LessonLifecycleActorType } from '@prisma/client';

export type CommitWindow = {
  id?: number | null;
  clubDate: string;
  startTime: string;
  endTime: string;
};

function assertWindowTimes(startTime: string, endTime: string) {
  if (!isFifteenMinuteSnap(startTime) || !isFifteenMinuteSnap(endTime)) {
    throw new Error('Times must snap to 15 minutes');
  }
  if (parseMinutes(endTime) <= parseMinutes(startTime)) {
    throw new Error('End time must be after start time');
  }
}

export async function updateOccurrenceWindow(occurrenceId: number, startTime: string, endTime: string) {
  assertWindowTimes(startTime, endTime);
  const occurrence = await prisma.coachAvailabilityOccurrence.findUnique({
    where: { id: occurrenceId },
    include: {
      series: true,
      individualLessons: { where: { status: 'CONFIRMED' } },
    },
  });
  if (!occurrence || occurrence.cancelled) {
    throw new Error('Availability window not found');
  }
  if (!clubHoursContainRange(occurrence.clubDate, startTime, endTime)) {
    throw new Error(`Window is outside club hours on ${occurrence.clubDate}`);
  }
  for (const lesson of occurrence.individualLessons) {
    if (parseMinutes(lesson.startTime) < parseMinutes(startTime) || parseMinutes(lesson.endTime) > parseMinutes(endTime)) {
      throw new Error('Cannot shrink a window past an existing reservation');
    }
  }
  const siblings = await prisma.coachAvailabilityOccurrence.findMany({
    where: {
      clubDate: occurrence.clubDate,
      cancelled: false,
      id: { not: occurrence.id },
      series: { coachProfileId: occurrence.series.coachProfileId },
    },
    select: { startTime: true, endTime: true },
  });
  if (siblings.some((row) => rangesOverlap(startTime, endTime, row.startTime, row.endTime, 0))) {
    throw new Error(`Overlaps existing availability on ${occurrence.clubDate}`);
  }
  return prisma.coachAvailabilityOccurrence.update({
    where: { id: occurrence.id },
    data: { startTime, endTime },
  });
}

export async function commitAvailabilityWindows(opts: {
  coachProfileId: number;
  windows: CommitWindow[];
  actorMemberId: number;
  actorType: LessonLifecycleActorType;
}): Promise<{ created: number; updated: number; cancelled: number }> {
  const today = getClubDate();
  const thisWeek = startOfWeekMonday(today);
  const incoming = opts.windows
    .filter((w) => /^\d{4}-\d{2}-\d{2}$/.test(w.clubDate))
    .map((w) => ({
      id: typeof w.id === 'number' && w.id > 0 ? w.id : null,
      clubDate: w.clubDate,
      startTime: w.startTime,
      endTime: w.endTime,
    }));
  const from = incoming.reduce((min, w) => (w.clubDate < min ? w.clubDate : min), thisWeek);
  const to = horizonEndYmd(getLessonsConfig().horizonMonths, thisWeek);

  const keepIds = new Set(incoming.filter((w) => w.clubDate <= to).map((w) => w.id).filter((id): id is number => id != null));
  const existing = (await listAvailability(opts.coachProfileId, from, to)).filter((row) => !row.cancelled);
  const doomed = existing.filter((occ) => !keepIds.has(occ.id));
  const orphans: Array<{ id: number; clubDate: string; startTime: string; endTime: string }> = [];
  let cancelled = 0;
  for (const occ of doomed) {
    const { lessons } = await cancelAvailabilityOccurrence(occ.id, opts.actorMemberId);
    for (const lesson of lessons) {
      orphans.push({
        id: lesson.id,
        clubDate: lesson.clubDate,
        startTime: lesson.startTime,
        endTime: lesson.endTime,
      });
    }
    cancelled += 1;
  }

  let updated = 0;
  let created = 0;
  const existingIds = new Set(existing.map((row) => row.id));
  const surviving: Array<{ id: number; clubDate: string; startTime: string; endTime: string }> = [];
  for (const window of incoming) {
    if (window.clubDate > to) continue;
    assertWindowTimes(window.startTime, window.endTime);
    if (window.id && existingIds.has(window.id)) {
      await updateOccurrenceWindow(window.id, window.startTime, window.endTime);
      surviving.push({
        id: window.id,
        clubDate: window.clubDate,
        startTime: window.startTime,
        endTime: window.endTime,
      });
      updated += 1;
    } else {
      const series = await createAvailabilitySeries(opts.coachProfileId, {
        startTime: window.startTime,
        endTime: window.endTime,
        weekdays: [],
        startsOn: window.clubDate,
        untilOn: null,
      });
      const occ = series?.occurrences.find((row) => row.clubDate === window.clubDate) ?? series?.occurrences[0];
      if (occ) {
        surviving.push({
          id: occ.id,
          clubDate: occ.clubDate,
          startTime: window.startTime,
          endTime: window.endTime,
        });
      }
      created += 1;
    }
  }

  for (const lesson of orphans) {
    const host = surviving.find(
      (w) =>
        w.clubDate === lesson.clubDate &&
        parseMinutes(w.startTime) <= parseMinutes(lesson.startTime) &&
        parseMinutes(w.endTime) >= parseMinutes(lesson.endTime),
    );
    if (host) {
      await prisma.individualLesson.update({
        where: { id: lesson.id },
        data: { availabilityOccurrenceId: host.id },
      });
    } else {
      await cancelIndividualLesson({
        lessonId: lesson.id,
        actorMemberId: opts.actorMemberId,
        actorType: opts.actorType,
        isAdmin: true,
      });
    }
  }

  await notifyLessonCalendar({
    coachProfileId: opts.coachProfileId,
    reason: 'availability',
  });
  return { created, updated, cancelled };
}
