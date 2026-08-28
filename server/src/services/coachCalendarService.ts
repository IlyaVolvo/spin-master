import { prisma } from '../index';
import { listAvailability, materializeAvailabilitySeriesForCoach } from './availabilityService';
import { coachBusyIntervals, playerBusyIntervals } from './busyTimeService';
import {
  BOOKING_FROZEN_MESSAGE,
  buildDayCells,
  buildTimeAxis,
  coachDisplayColor,
  isEditSessionActive,
  type CalendarCell,
} from './coachCalendarGrid';
import { getLessonsConfig, getSystemConfig } from './systemConfigService';
import { coachAcceptsPlayerRating, eligibilityError } from './individualLessonService';
import { resolveHoursForClubDate } from '../utils/clubHours';
import { addDaysToYmd, getClubDate } from '../utils/clubDate';
import {
  formatMinutes,
  horizonEndYmd,
  mergeTouchingWindows,
  parseMinutes,
  startOfWeekMonday,
  subtractBusyWindows,
} from '../utils/lessonTime';
import type { ClubDayHours } from './systemConfigService';

export type CoachCalendarDay = {
  clubDate: string;
  hours: ClubDayHours;
  cells: CalendarCell[];
};

export async function getPublicCoachCalendar(opts: {
  memberId: number;
  from?: string;
  to?: string;
  viewerMemberId?: number | null;
}) {
  const profile = await prisma.coachProfile.findUnique({
    where: { memberId: opts.memberId },
    include: { member: { select: { id: true, firstName: true, lastName: true, rating: true, isActive: true } } },
  });
  if (!profile || !profile.teachingActive) {
    return null;
  }

  const from = opts.from && /^\d{4}-\d{2}-\d{2}$/.test(opts.from) ? opts.from : startOfWeekMonday(getClubDate());
  const to = opts.to && /^\d{4}-\d{2}-\d{2}$/.test(opts.to) ? opts.to : addDaysToYmd(from, 6);

  await materializeAvailabilitySeriesForCoach(profile.id);
  const [availability, busy, ownLessons, viewer] = await Promise.all([
    listAvailability(profile.id, from, to),
    coachBusyIntervals(profile.id, from, to),
    opts.viewerMemberId
      ? prisma.individualLesson.findMany({
          where: {
            coachProfileId: profile.id,
            playerMemberId: opts.viewerMemberId,
            status: 'CONFIRMED',
            clubDate: { gte: from, lte: to },
          },
          select: { id: true, clubDate: true, startTime: true, endTime: true },
        })
      : Promise.resolve([]),
    opts.viewerMemberId
      ? prisma.member.findUnique({
          where: { id: opts.viewerMemberId },
          select: { rating: true, roles: true },
        })
      : Promise.resolve(null),
  ]);

  const viewerIsPlayer = Boolean(
    viewer?.roles.some((role) => String(role).toUpperCase() === 'PLAYER'),
  );
  const offerAvailability =
    !viewerIsPlayer || coachAcceptsPlayerRating(profile, viewer?.rating ?? null);

  const ownIds = new Set(ownLessons.map((row) => row.id));
  const days: CoachCalendarDay[] = [];
  const hoursByDate: ClubDayHours[] = [];
  for (let cursor = from; cursor <= to; cursor = addDaysToYmd(cursor, 1)) {
    hoursByDate.push(resolveHoursForClubDate(cursor).hours);
  }
  const axis = buildTimeAxis(hoursByDate);

  let i = 0;
  for (let cursor = from; cursor <= to; cursor = addDaysToYmd(cursor, 1)) {
    const hours = hoursByDate[i];
    i += 1;
    const dayAvail = offerAvailability
      ? availability
          .filter((row) => !row.cancelled && row.clubDate === cursor)
          .map((row) => ({ startTime: row.startTime, endTime: row.endTime }))
      : [];
    const dayReserved = busy
      .filter((row) => row.clubDate === cursor)
      .map((row) => ({
        startTime: row.startTime,
        endTime: row.endTime,
        lessonId: row.kind === 'individual' ? row.id : null,
        mine: row.kind === 'individual' && ownIds.has(row.id),
      }));
    days.push({
      clubDate: cursor,
      hours,
      cells: axis
        ? buildDayCells({
            hours,
            axisStart: axis.start,
            axisEnd: axis.end,
            availability: dayAvail,
            reserved: dayReserved,
          })
        : [],
    });
  }

  return {
    id: profile.memberId,
    coachProfileId: profile.id,
    firstName: profile.member.firstName,
    lastName: profile.member.lastName,
    rating: profile.member.rating,
    hourlyRateCents: profile.hourlyRateCents,
    bio: profile.bio,
    bookingFrozen: isEditSessionActive(profile.editSessionUntil),
    bookingFrozenMessage: isEditSessionActive(profile.editSessionUntil) ? BOOKING_FROZEN_MESSAGE : null,
    from,
    to,
    axis,
    days,
    clubTimezone: getSystemConfig().branding.clubTimezone,
  };
}

export async function getCoachEditorWeek(opts: {
  memberId: number;
  from?: string;
  to?: string;
}) {
  const profile = await prisma.coachProfile.findUnique({
    where: { memberId: opts.memberId },
    include: { member: { select: { id: true, firstName: true, lastName: true, rating: true } } },
  });
  if (!profile) return null;

  const from = opts.from && /^\d{4}-\d{2}-\d{2}$/.test(opts.from) ? opts.from : startOfWeekMonday(getClubDate());
  const to = opts.to && /^\d{4}-\d{2}-\d{2}$/.test(opts.to) ? opts.to : addDaysToYmd(from, 6);

  await materializeAvailabilitySeriesForCoach(profile.id);
  const [availability, busy] = await Promise.all([
    listAvailability(profile.id, from, to),
    coachBusyIntervals(profile.id, from, to),
  ]);

  const hoursByDate: ClubDayHours[] = [];
  for (let cursor = from; cursor <= to; cursor = addDaysToYmd(cursor, 1)) {
    hoursByDate.push(resolveHoursForClubDate(cursor).hours);
  }
  const axis = buildTimeAxis(hoursByDate);
  const days: CoachCalendarDay[] = [];
  let i = 0;
  for (let cursor = from; cursor <= to; cursor = addDaysToYmd(cursor, 1)) {
    const hours = hoursByDate[i];
    i += 1;
    const dayAvail = availability
      .filter((row) => !row.cancelled && row.clubDate === cursor)
      .map((row) => ({ startTime: row.startTime, endTime: row.endTime }));
    const dayReserved = busy
      .filter((row) => row.clubDate === cursor)
      .map((row) => ({
        startTime: row.startTime,
        endTime: row.endTime,
        lessonId: row.kind === 'individual' ? row.id : null,
        mine: false,
      }));
    days.push({
      clubDate: cursor,
      hours,
      cells: axis
        ? buildDayCells({
            hours,
            axisStart: axis.start,
            axisEnd: axis.end,
            availability: dayAvail,
            reserved: dayReserved,
          })
        : [],
    });
  }

  return {
    id: profile.memberId,
    coachProfileId: profile.id,
    firstName: profile.member.firstName,
    lastName: profile.member.lastName,
    hourlyRateCents: profile.hourlyRateCents,
    bio: profile.bio,
    teachingActive: profile.teachingActive,
    bookingFrozen: isEditSessionActive(profile.editSessionUntil),
    from,
    to,
    axis,
    days,
    windows: availability
      .filter((row) => !row.cancelled)
      .map((row) => ({
        id: row.id,
        clubDate: row.clubDate,
        startTime: row.startTime,
        endTime: row.endTime,
      })),
    reserved: busy.map((row) => ({
      clubDate: row.clubDate,
      startTime: row.startTime,
      endTime: row.endTime,
      lessonId: row.kind === 'individual' ? row.id : null,
      kind: row.kind,
      playerFirstName: row.playerFirstName ?? null,
      playerLastName: row.playerLastName ?? null,
    })),
    clubTimezone: getSystemConfig().branding.clubTimezone,
  };
}

function clipWindowToHours(
  startTime: string,
  endTime: string,
  hours: ClubDayHours,
): { startTime: string; endTime: string } | null {
  if (hours.closed) return null;
  const start = Math.max(parseMinutes(startTime), parseMinutes(hours.open));
  const end = Math.min(parseMinutes(endTime), parseMinutes(hours.close));
  if (end - start < 15) return null;
  return { startTime: formatMinutes(start), endTime: formatMinutes(end) };
}

function overlapWindows(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): { startTime: string; endTime: string } | null {
  const start = Math.max(parseMinutes(aStart), parseMinutes(bStart));
  const end = Math.min(parseMinutes(aEnd), parseMinutes(bEnd));
  if (end - start < 15) return null;
  return { startTime: formatMinutes(start), endTime: formatMinutes(end) };
}

type StudentLessonPlayer = {
  id: number;
  rating: number | null;
  birthDate: Date | null;
  roles: string[];
  isActive: boolean;
};

async function requireLessonPlayer(playerMemberId: number): Promise<StudentLessonPlayer> {
  const player = await prisma.member.findUnique({
    where: { id: playerMemberId },
    select: { id: true, rating: true, birthDate: true, roles: true, isActive: true },
  });
  if (!player || !player.roles.some((role) => String(role).toUpperCase() === 'PLAYER')) {
    throw new Error('Only players can book lessons');
  }
  if (!player.isActive) {
    throw new Error('Inactive members cannot book lessons themselves');
  }
  return player;
}

export async function getStudentLessonWeek(opts: {
  playerMemberId: number;
  from?: string;
  to?: string;
  coachProfileId?: number;
  overlays?: boolean;
}) {
  const player = await requireLessonPlayer(opts.playerMemberId);
  const from = opts.from && /^\d{4}-\d{2}-\d{2}$/.test(opts.from) ? opts.from : startOfWeekMonday(getClubDate());
  const lessons = getLessonsConfig();
  const horizonTo = horizonEndYmd(lessons.horizonMonths);
  const requestedTo = opts.to && /^\d{4}-\d{2}-\d{2}$/.test(opts.to) ? opts.to : addDaysToYmd(from, 6);
  const to = requestedTo > horizonTo ? horizonTo : requestedTo;
  const includeOverlays = opts.overlays !== false;
  const bufferMinutes = lessons.busyBufferMinutes;

  const allCoaches = await prisma.coachProfile.findMany({
    where: { teachingActive: true },
    include: {
      member: { select: { id: true, firstName: true, lastName: true, isActive: true } },
    },
    orderBy: { memberId: 'asc' },
  });
  const qualifying = allCoaches.filter(
    (coach) =>
      coach.member.isActive &&
      !isEditSessionActive(coach.editSessionUntil) &&
      coachAcceptsPlayerRating(coach, player.rating) &&
      (opts.coachProfileId == null || coach.id === opts.coachProfileId),
  );

  await Promise.all(qualifying.map((coach) => materializeAvailabilitySeriesForCoach(coach.id)));

  const [availabilityRows, playerBusy, ownLessons, coachBusyList] = await Promise.all([
    qualifying.length
      ? prisma.coachAvailabilityOccurrence.findMany({
          where: {
            cancelled: false,
            clubDate: { gte: from, lte: to },
            series: { coachProfileId: { in: qualifying.map((c) => c.id) } },
          },
          select: {
            clubDate: true,
            startTime: true,
            endTime: true,
            ratingMin: true,
            ratingMax: true,
            ageMin: true,
            ageMax: true,
            series: { select: { coachProfileId: true } },
          },
        })
      : Promise.resolve([]),
    playerBusyIntervals(player.id, from, to),
    includeOverlays
      ? prisma.individualLesson.findMany({
          where: {
            playerMemberId: player.id,
            status: 'CONFIRMED',
            clubDate: { gte: from, lte: to },
          },
          select: {
            id: true,
            clubDate: true,
            startTime: true,
            endTime: true,
            coachProfileId: true,
            coach: { include: { member: { select: { firstName: true, lastName: true } } } },
          },
        })
      : Promise.resolve([]),
    Promise.all(qualifying.map((coach) => coachBusyIntervals(coach.id, from, to))),
  ]);

  const busyByCoach = new Map<number, (typeof coachBusyList)[number]>();
  qualifying.forEach((coach, i) => {
    busyByCoach.set(coach.id, coachBusyList[i]);
  });

  const hoursByDate: ClubDayHours[] = [];
  const daysMeta: Array<{ clubDate: string; hours: ClubDayHours }> = [];
  for (let cursor = from; cursor <= to; cursor = addDaysToYmd(cursor, 1)) {
    const hours = resolveHoursForClubDate(cursor).hours;
    hoursByDate.push(hours);
    daysMeta.push({ clubDate: cursor, hours });
  }
  const axis = buildTimeAxis(hoursByDate);

  const windows: Array<{
    coachProfileId: number;
    clubDate: string;
    startTime: string;
    endTime: string;
  }> = [];
  const taken: Array<{
    coachProfileId: number;
    clubDate: string;
    startTime: string;
    endTime: string;
    kind: 'individual' | 'group';
    playerFirstName: string | null;
    playerLastName: string | null;
  }> = [];

  for (const coach of qualifying) {
    const coachBusy = busyByCoach.get(coach.id) || [];
    for (const day of daysMeta) {
      const offered = availabilityRows.filter(
        (row) =>
          row.series.coachProfileId === coach.id &&
          row.clubDate === day.clubDate &&
          !eligibilityError(row, player, day.clubDate, false),
      );
      const fragments: Array<{ startTime: string; endTime: string }> = [];
      const offeredClipped: Array<{ startTime: string; endTime: string }> = [];
      for (const row of offered) {
        const clipped = clipWindowToHours(row.startTime, row.endTime, day.hours);
        if (!clipped) continue;
        offeredClipped.push(clipped);
        const busy = [
          ...coachBusy.filter((b) => b.clubDate === day.clubDate),
          ...playerBusy.filter((b) => b.clubDate === day.clubDate),
        ];
        fragments.push(...subtractBusyWindows(clipped.startTime, clipped.endTime, busy, bufferMinutes));
      }
      for (const window of mergeTouchingWindows(fragments)) {
        windows.push({
          coachProfileId: coach.id,
          clubDate: day.clubDate,
          startTime: window.startTime,
          endTime: window.endTime,
        });
      }
      if (!includeOverlays) continue;
      const ownIds = new Set(ownLessons.filter((row) => row.coachProfileId === coach.id).map((row) => row.id));
      for (const busy of coachBusy.filter((b) => b.clubDate === day.clubDate)) {
        if (busy.kind === 'individual' && ownIds.has(busy.id)) continue;
        for (const offeredWin of offeredClipped) {
          const overlap = overlapWindows(offeredWin.startTime, offeredWin.endTime, busy.startTime, busy.endTime);
          if (!overlap) continue;
          taken.push({
            coachProfileId: coach.id,
            clubDate: day.clubDate,
            startTime: overlap.startTime,
            endTime: overlap.endTime,
            kind: busy.kind,
            playerFirstName: busy.playerFirstName ?? null,
            playerLastName: busy.playerLastName ?? null,
          });
        }
      }
    }
  }

  return {
    from,
    to,
    horizonTo,
    axis,
    days: daysMeta,
    coaches: qualifying.map((coach) => ({
      id: coach.id,
      memberId: coach.memberId,
      firstName: coach.member.firstName,
      lastName: coach.member.lastName,
      color: coachDisplayColor(coach.id),
      hourlyRateCents: coach.hourlyRateCents,
    })),
    windows,
    taken,
    mine: includeOverlays
      ? ownLessons.map((row) => ({
          id: row.id,
          clubDate: row.clubDate,
          startTime: row.startTime,
          endTime: row.endTime,
          coachProfileId: row.coachProfileId,
          coachName: `${row.coach.member.firstName} ${row.coach.member.lastName}`.trim(),
          color: coachDisplayColor(row.coachProfileId),
        }))
      : [],
    allowedMinutes: lessons.individualDurations.allowedMinutes,
    defaultMinutes: lessons.individualDurations.defaultMinutes,
    studentCancelHours: lessons.studentCancelHours,
    clubTimezone: getSystemConfig().branding.clubTimezone,
  };
}

export async function getStudentFreeWindows(opts: {
  playerMemberId: number;
  from: string;
  to?: string;
  coachProfileId?: number;
}) {
  const horizonTo = horizonEndYmd(getLessonsConfig().horizonMonths);
  const week = await getStudentLessonWeek({
    playerMemberId: opts.playerMemberId,
    from: opts.from,
    to: opts.to || horizonTo,
    coachProfileId: opts.coachProfileId,
    overlays: false,
  });
  return {
    from: week.from,
    to: week.to,
    horizonTo: week.horizonTo,
    windows: week.windows,
  };
}
