import { prisma } from '../index';
import { getLessonsConfig } from './systemConfigService';
import {
  clubHoursContainRange,
  eachYmdInclusive,
  horizonEndYmd,
  isFifteenMinuteSnap,
  matchesRecurrence,
  normalizeWeekdays,
  parseMinutes,
  rangesOverlap,
} from '../utils/lessonTime';
import { getClubDate } from '../utils/clubDate';
import { resolveHoursForClubDate } from '../utils/clubHours';
import { notifyLessonCalendar } from './lessonCalendarEvents';

export type AvailabilitySeriesInput = {
  startTime: string;
  endTime: string;
  weekdays: unknown;
  intervalWeeks?: number;
  startsOn: string;
  untilOn?: string | null;
  ratingMin?: number | null;
  ratingMax?: number | null;
  ageMin?: number | null;
  ageMax?: number | null;
};

function assertWindowTimes(startTime: string, endTime: string) {
  if (!isFifteenMinuteSnap(startTime) || !isFifteenMinuteSnap(endTime)) {
    throw new Error('Times must snap to 15 minutes');
  }
  if (parseMinutes(endTime) <= parseMinutes(startTime)) {
    throw new Error('End time must be after start time');
  }
}

async function overlappingAvailability(
  coachProfileId: number,
  clubDate: string,
  startTime: string,
  endTime: string,
  ignoreSeriesId?: number,
): Promise<boolean> {
  const rows = await prisma.coachAvailabilityOccurrence.findMany({
    where: {
      clubDate,
      cancelled: false,
      series: { coachProfileId, ...(ignoreSeriesId ? { id: { not: ignoreSeriesId } } : {}) },
    },
    select: { startTime: true, endTime: true },
  });
  return rows.some((row) => rangesOverlap(startTime, endTime, row.startTime, row.endTime, 0));
}

export async function materializeAvailabilitySeries(seriesId: number): Promise<number> {
  const series = await prisma.coachAvailabilitySeries.findUnique({ where: { id: seriesId } });
  if (!series) return 0;
  const horizonMonths = getLessonsConfig().horizonMonths;
  const from = series.startsOn;
  const horizon = horizonEndYmd(horizonMonths);
  const to = series.untilOn && series.untilOn < horizon ? series.untilOn : horizon;
  if (to < from) return 0;

  let created = 0;
  for (const clubDate of eachYmdInclusive(from, to)) {
    if (
      !matchesRecurrence({
        clubDate,
        startsOn: series.startsOn,
        untilOn: series.untilOn,
        weekdays: series.weekdays,
        intervalWeeks: series.intervalWeeks,
      })
    ) {
      continue;
    }
    if (!clubHoursContainRange(clubDate, series.startTime, series.endTime)) {
      continue;
    }
    if (await overlappingAvailability(series.coachProfileId, clubDate, series.startTime, series.endTime, series.id)) {
      continue;
    }
    const existing = await prisma.coachAvailabilityOccurrence.findUnique({
      where: { seriesId_clubDate: { seriesId: series.id, clubDate } },
    });
    if (existing) continue;
    await prisma.coachAvailabilityOccurrence.create({
      data: {
        seriesId: series.id,
        clubDate,
        startTime: series.startTime,
        endTime: series.endTime,
        ratingMin: series.ratingMin,
        ratingMax: series.ratingMax,
        ageMin: series.ageMin,
        ageMax: series.ageMax,
      },
    });
    created += 1;
  }
  return created;
}

export async function createAvailabilitySeries(coachProfileId: number, input: AvailabilitySeriesInput) {
  assertWindowTimes(input.startTime, input.endTime);
  const weekdays = normalizeWeekdays(input.weekdays);
  const startsOn = String(input.startsOn);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn)) {
    throw new Error('startsOn must be YYYY-MM-DD');
  }
  const untilOn =
    input.untilOn == null || input.untilOn === ''
      ? null
      : String(input.untilOn);
  if (untilOn && untilOn < startsOn) {
    throw new Error('untilOn cannot be before startsOn');
  }
  if (!weekdays.length && untilOn && untilOn !== startsOn) {
    throw new Error('A one-date window cannot have a later until date');
  }

  const intervalWeeks = Math.max(1, Math.floor(Number(input.intervalWeeks) || 1));
  const horizon = horizonEndYmd(getLessonsConfig().horizonMonths);
  const to = untilOn && untilOn < horizon ? untilOn : horizon;
  const dates: string[] = [];
  for (const clubDate of eachYmdInclusive(startsOn, to)) {
    if (
      !matchesRecurrence({
        clubDate,
        startsOn,
        untilOn,
        weekdays,
        intervalWeeks,
      })
    ) {
      continue;
    }
    const { hours } = resolveHoursForClubDate(clubDate);
    if (hours.closed) continue;
    if (!clubHoursContainRange(clubDate, input.startTime, input.endTime)) {
      throw new Error(`Window is outside club hours on ${clubDate}`);
    }
    if (await overlappingAvailability(coachProfileId, clubDate, input.startTime, input.endTime)) {
      throw new Error(`Overlaps existing availability on ${clubDate}`);
    }
    dates.push(clubDate);
  }
  if (!dates.length) {
    throw new Error('No dates fall inside club hours in the scheduling horizon');
  }

  const series = await prisma.coachAvailabilitySeries.create({
    data: {
      coachProfileId,
      startTime: input.startTime,
      endTime: input.endTime,
      weekdays,
      intervalWeeks,
      startsOn,
      untilOn,
      ratingMin: input.ratingMin ?? null,
      ratingMax: input.ratingMax ?? null,
      ageMin: input.ageMin ?? null,
      ageMax: input.ageMax ?? null,
    },
  });
  await materializeAvailabilitySeries(series.id);
  await notifyLessonCalendar({ coachProfileId, reason: 'availability', clubDate: startsOn });
  return prisma.coachAvailabilitySeries.findUnique({
    where: { id: series.id },
    include: { occurrences: { orderBy: { clubDate: 'asc' } } },
  });
}

export async function listAvailability(coachProfileId: number, from?: string, to?: string) {
  await materializeAvailabilitySeriesForCoach(coachProfileId);
  const today = getClubDate();
  const start = from || today;
  const end = to || horizonEndYmd(getLessonsConfig().horizonMonths, start);
  return prisma.coachAvailabilityOccurrence.findMany({
    where: {
      series: { coachProfileId },
      clubDate: { gte: start, lte: end },
    },
    include: { series: true },
    orderBy: [{ clubDate: 'asc' }, { startTime: 'asc' }],
  });
}

export async function materializeAvailabilitySeriesForCoach(coachProfileId: number) {
  const series = await prisma.coachAvailabilitySeries.findMany({
    where: { coachProfileId },
    select: { id: true },
  });
  for (const row of series) {
    await materializeAvailabilitySeries(row.id);
  }
}

export async function updateOccurrenceRestrictions(
  occurrenceId: number,
  patch: { ratingMin?: number | null; ratingMax?: number | null; ageMin?: number | null; ageMax?: number | null },
) {
  const updated = await prisma.coachAvailabilityOccurrence.update({
    where: { id: occurrenceId },
    data: {
      ratingMin: patch.ratingMin === undefined ? undefined : patch.ratingMin,
      ratingMax: patch.ratingMax === undefined ? undefined : patch.ratingMax,
      ageMin: patch.ageMin === undefined ? undefined : patch.ageMin,
      ageMax: patch.ageMax === undefined ? undefined : patch.ageMax,
    },
    include: { series: { select: { coachProfileId: true } } },
  });
  await notifyLessonCalendar({
    coachProfileId: updated.series.coachProfileId,
    reason: 'availability',
    clubDate: updated.clubDate,
  });
  return updated;
}

export async function cancelAvailabilityOccurrence(occurrenceId: number, actorMemberId: number | null) {
  const occurrence = await prisma.coachAvailabilityOccurrence.update({
    where: { id: occurrenceId },
    data: { cancelled: true },
    include: { series: true, individualLessons: { where: { status: 'CONFIRMED' } } },
  });
  await notifyLessonCalendar({
    coachProfileId: occurrence.series.coachProfileId,
    reason: 'availability',
    clubDate: occurrence.clubDate,
  });
  return { occurrence, lessons: occurrence.individualLessons };
}

export async function cancelAvailabilityFromDate(seriesId: number, fromClubDate: string) {
  const series = await prisma.coachAvailabilitySeries.update({
    where: { id: seriesId },
    data: { untilOn: fromClubDate > '' ? addDaysBefore(fromClubDate) : fromClubDate },
  });
  const future = await prisma.coachAvailabilityOccurrence.findMany({
    where: { seriesId, clubDate: { gte: fromClubDate } },
    include: { individualLessons: { where: { status: 'CONFIRMED' } } },
  });
  await prisma.coachAvailabilityOccurrence.updateMany({
    where: { seriesId, clubDate: { gte: fromClubDate } },
    data: { cancelled: true },
  });
  await notifyLessonCalendar({
    coachProfileId: series.coachProfileId,
    reason: 'availability',
    clubDate: fromClubDate,
  });
  return { series, occurrences: future };
}

function addDaysBefore(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d - 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}
