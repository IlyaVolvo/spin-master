import { prisma } from '../index';
import { getLessonsConfig } from './systemConfigService';
import { materializeAvailabilitySeriesForCoach } from './availabilityService';
import { assertCoachAndPlayerFree } from './busyTimeService';
import { recordLessonLifecycle } from './lessonLifecycle';
import { runLessonCheckout, creditSucceededLessonPayment, cancelPendingLessonPayment } from '../payments/lessonPayment';
import {
  addMinutesToHhmm,
  eachYmdInclusive,
  horizonEndYmd,
  isFifteenMinuteSnap,
  matchesRecurrence,
  memberAgeOnDate,
  normalizeWeekdays,
  priceCentsFromHourly,
  windowContains,
} from '../utils/lessonTime';
import { assertCoachBookingNotFrozen } from './coachEditSession';
import { isEditSessionActive } from './coachCalendarGrid';
import { clubLocalDateTimeUtc, getClubDate, getClubTimezone } from '../utils/clubDate';
import {
  sendIndividualLessonBookedEmail,
  sendIndividualLessonCancelledEmail,
} from './mailService';
import { notifyLessonCalendar } from './lessonCalendarEvents';
import { logger } from '../utils/logger';
import type { LessonLifecycleActorType } from '@prisma/client';
import type { PaymentInitiatedBy } from '../payments/types';

function hoursUntilStart(clubDate: string, startTime: string): number {
  const start = clubLocalDateTimeUtc(clubDate, startTime, getClubTimezone());
  return (start.getTime() - Date.now()) / 3600000;
}

function memberHasPlayerRole(roles: string[]): boolean {
  return roles.some((role) => String(role).toUpperCase() === 'PLAYER');
}

export function coachAcceptsPlayerRating(
  coach: { studentRatingMin: number | null; studentRatingMax: number | null },
  playerRating: number | null,
): boolean {
  if (coach.studentRatingMin == null && coach.studentRatingMax == null) return true;
  if (playerRating == null) return false;
  if (coach.studentRatingMin != null && playerRating < coach.studentRatingMin) return false;
  if (coach.studentRatingMax != null && playerRating > coach.studentRatingMax) return false;
  return true;
}

export function eligibilityError(
  occurrence: {
    ratingMin: number | null;
    ratingMax: number | null;
    ageMin: number | null;
    ageMax: number | null;
  },
  player: { rating: number | null; birthDate: Date | null },
  clubDate: string,
  bypass: boolean,
): string | null {
  if (bypass) return null;
  if (occurrence.ratingMin != null || occurrence.ratingMax != null) {
    if (player.rating == null) return 'A rating is required for this time';
    if (occurrence.ratingMin != null && player.rating < occurrence.ratingMin) {
      return 'Player rating is below this slot’s range';
    }
    if (occurrence.ratingMax != null && player.rating > occurrence.ratingMax) {
      return 'Player rating is above this slot’s range';
    }
  }
  if (occurrence.ageMin != null || occurrence.ageMax != null) {
    const age = memberAgeOnDate(player.birthDate, clubDate);
    if (age == null) return 'A birth date is required for this time';
    if (occurrence.ageMin != null && age < occurrence.ageMin) return 'Player is younger than this slot allows';
    if (occurrence.ageMax != null && age > occurrence.ageMax) return 'Player is older than this slot allows';
  }
  return null;
}

async function findContainingOccurrence(coachProfileId: number, clubDate: string, startTime: string, endTime: string) {
  const rows = await prisma.coachAvailabilityOccurrence.findMany({
    where: { clubDate, cancelled: false, series: { coachProfileId, coach: { teachingActive: true } } },
  });
  return rows.find((row) => windowContains(row.startTime, row.endTime, startTime, endTime)) || null;
}

export async function searchIndividualSlots(params: {
  playerMemberId: number;
  durationMinutes: number;
  timeRanges: Array<{ clubDate: string; startTime: string; endTime: string }>;
  coachProfileIds?: number[];
  bypassEligibility?: boolean;
}) {
  const lessons = getLessonsConfig();
  if (!lessons.individualDurations.allowedMinutes.includes(params.durationMinutes)) {
    throw new Error('Duration is not allowed for individual lessons');
  }
  const player = await prisma.member.findUnique({
    where: { id: params.playerMemberId },
    select: { id: true, rating: true, birthDate: true, roles: true, isActive: true },
  });
  if (!player || !memberHasPlayerRole(player.roles)) {
    throw new Error('Only players can book lessons');
  }
  if (!player.isActive && !params.bypassEligibility) {
    throw new Error('Inactive members cannot book lessons themselves');
  }

  const dates = [...new Set(params.timeRanges.map((r) => r.clubDate))].sort();
  if (!dates.length) return [];
  const from = dates[0];
  const to = dates[dates.length - 1];

  const coaches = await prisma.coachProfile.findMany({
    where: {
      teachingActive: true,
      ...(params.coachProfileIds?.length ? { id: { in: params.coachProfileIds } } : {}),
    },
    select: { id: true, studentRatingMin: true, studentRatingMax: true, editSessionUntil: true },
  });
  const eligibleCoachIds = coaches
    .filter((coach) => {
      if (!params.bypassEligibility && isEditSessionActive(coach.editSessionUntil)) return false;
      if (!params.bypassEligibility && !coachAcceptsPlayerRating(coach, player.rating)) return false;
      return true;
    })
    .map((coach) => coach.id);
  if (!eligibleCoachIds.length) return [];
  for (const coachId of eligibleCoachIds) {
    await materializeAvailabilitySeriesForCoach(coachId);
  }

  const occurrences = await prisma.coachAvailabilityOccurrence.findMany({
    where: {
      cancelled: false,
      clubDate: { gte: from, lte: to },
      series: {
        coachProfileId: { in: eligibleCoachIds },
        coach: { teachingActive: true },
      },
    },
    include: {
      series: { include: { coach: { include: { member: { select: { firstName: true, lastName: true, id: true } } } } } },
    },
    orderBy: [{ clubDate: 'asc' }, { startTime: 'asc' }],
  });

  const matches: Array<{
    coachProfileId: number;
    coachMemberId: number;
    coachName: string;
    hourlyRateCents: number;
    clubDate: string;
    startTime: string;
    endTime: string;
    occurrenceId: number;
    priceCents: number;
  }> = [];

  for (const occ of occurrences) {
    const ranges = params.timeRanges.filter((r) => r.clubDate === occ.clubDate);
    if (!ranges.length) continue;
    const err = eligibilityError(occ, player, occ.clubDate, Boolean(params.bypassEligibility));
    if (err) continue;
    for (let startMin = 0; ; startMin += 15) {
      const startTime = addMinutesToHhmm(occ.startTime, startMin);
      const endTime = addMinutesToHhmm(startTime, params.durationMinutes);
      if (!windowContains(occ.startTime, occ.endTime, startTime, endTime)) break;
      const inDesired = ranges.some((r) => windowContains(r.startTime, r.endTime, startTime, endTime));
      if (!inDesired) continue;
      try {
        await assertCoachAndPlayerFree({
          coachProfileId: occ.series.coachProfileId,
          playerMemberId: player.id,
          clubDate: occ.clubDate,
          startTime,
          endTime,
        });
      } catch {
        continue;
      }
      const member = occ.series.coach.member;
      matches.push({
        coachProfileId: occ.series.coachProfileId,
        coachMemberId: member.id,
        coachName: `${member.firstName} ${member.lastName}`.trim(),
        hourlyRateCents: occ.series.coach.hourlyRateCents,
        clubDate: occ.clubDate,
        startTime,
        endTime,
        occurrenceId: occ.id,
        priceCents: priceCentsFromHourly(occ.series.coach.hourlyRateCents, params.durationMinutes),
      });
    }
  }
  return matches;
}

export async function bookIndividualLesson(params: {
  actorMemberId: number;
  actorType: LessonLifecycleActorType;
  playerMemberId: number;
  coachProfileId: number;
  clubDate: string;
  startTime: string;
  durationMinutes: number;
  bypassEligibility?: boolean;
  initiatedBy: PaymentInitiatedBy;
  seriesId?: number | null;
  reminderHours?: number;
}) {
  const lessons = getLessonsConfig();
  if (!lessons.individualDurations.allowedMinutes.includes(params.durationMinutes)) {
    throw new Error('Duration is not allowed for individual lessons');
  }
  if (!isFifteenMinuteSnap(params.startTime)) {
    throw new Error('Start time must snap to 15 minutes');
  }
  if (!params.bypassEligibility) {
    await assertCoachBookingNotFrozen(params.coachProfileId);
  }
  const reminderHours = Math.max(0, Math.min(168, Math.floor(Number(params.reminderHours) || 0)));
  const endTime = addMinutesToHhmm(params.startTime, params.durationMinutes);
  const player = await prisma.member.findUnique({
    where: { id: params.playerMemberId },
    select: { id: true, rating: true, birthDate: true, roles: true, firstName: true, lastName: true, email: true, isActive: true },
  });
  if (!player || !memberHasPlayerRole(player.roles)) {
    throw new Error('Only players can take lessons');
  }
  if (!player.isActive && !params.bypassEligibility) {
    throw new Error('Inactive members cannot book lessons themselves');
  }
  const coach = await prisma.coachProfile.findUnique({
    where: { id: params.coachProfileId },
    include: { member: { select: { id: true, firstName: true, lastName: true, email: true } } },
  });
  if (!coach || !coach.teachingActive) {
    throw new Error('Coach is not available');
  }
  if (!params.bypassEligibility && !coachAcceptsPlayerRating(coach, player.rating)) {
    throw new Error('This coach does not teach players at that rating');
  }
  const occurrence = await findContainingOccurrence(coach.id, params.clubDate, params.startTime, endTime);
  if (!occurrence) {
    throw new Error('That time is not on the coach’s availability calendar');
  }
  const elig = eligibilityError(occurrence, player, params.clubDate, Boolean(params.bypassEligibility));
  if (elig) throw new Error(elig);
  await assertCoachAndPlayerFree({
    coachProfileId: coach.id,
    playerMemberId: player.id,
    clubDate: params.clubDate,
    startTime: params.startTime,
    endTime,
  });

  const hourlyRateCents = coach.hourlyRateCents;
  const priceCents = priceCentsFromHourly(hourlyRateCents, params.durationMinutes);
  const lesson = await prisma.individualLesson.create({
    data: {
      seriesId: params.seriesId ?? null,
      coachProfileId: coach.id,
      playerMemberId: player.id,
      availabilityOccurrenceId: occurrence.id,
      clubDate: params.clubDate,
      startTime: params.startTime,
      endTime,
      durationMinutes: params.durationMinutes,
      priceCents,
      hourlyRateCents,
      reminderHours,
      status: 'CONFIRMED',
    },
  });

  const checkout = await runLessonCheckout({
    memberId: player.id,
    amountCents: priceCents,
    purpose: `Individual lesson: ${params.clubDate} ${params.startTime}`,
    product: {
      kind: 'lesson_individual',
      lessonId: lesson.id,
      amountCents: priceCents,
    },
    initiatedBy: params.initiatedBy,
    attach: { individualLessonId: lesson.id },
  });

  await recordLessonLifecycle({
    action: params.bypassEligibility ? 'PLACE' : 'REGISTER',
    actorType: params.actorType,
    actorMemberId: params.actorMemberId,
    entityType: 'individual_lesson',
    entityId: lesson.id,
    details: { clubDate: params.clubDate, startTime: params.startTime, playerMemberId: player.id },
  });
  void sendIndividualLessonBookedEmail({
    playerEmail: player.email,
    playerFirstName: player.firstName,
    playerName: `${player.firstName} ${player.lastName}`.trim(),
    coachEmail: coach.member.email,
    coachFirstName: coach.member.firstName,
    whenLabel: `${params.clubDate} ${params.startTime}`,
  }).catch((error) => {
    logger.warn('Lesson booked email failed', { error: error instanceof Error ? error.message : error });
  });
  await notifyLessonCalendar({
    coachProfileId: coach.id,
    memberId: coach.memberId,
    reason: 'reservation',
    clubDate: params.clubDate,
  });

  return { lesson: await prisma.individualLesson.findUnique({ where: { id: lesson.id } }), checkout, coach, player };
}

export async function bookIndividualSeries(params: {
  actorMemberId: number;
  actorType: LessonLifecycleActorType;
  playerMemberId: number;
  coachProfileId: number;
  startTime: string;
  durationMinutes: number;
  weekdays: unknown;
  intervalWeeks?: number;
  startsOn: string;
  untilOn?: string | null;
  reminderHours?: number;
  bypassEligibility?: boolean;
  initiatedBy: PaymentInitiatedBy;
}) {
  const weekdays = normalizeWeekdays(params.weekdays);
  const coachProfile = await prisma.coachProfile.findUnique({ where: { id: params.coachProfileId } });
  if (!coachProfile) throw new Error('Coach not found');
  if (!params.bypassEligibility) {
    await assertCoachBookingNotFrozen(params.coachProfileId);
  }
  const series = await prisma.individualLessonSeries.create({
    data: {
      coachProfileId: params.coachProfileId,
      playerMemberId: params.playerMemberId,
      durationMinutes: params.durationMinutes,
      hourlyRateCents: coachProfile.hourlyRateCents,
      startTime: params.startTime,
      weekdays,
      intervalWeeks: Math.max(1, Math.floor(Number(params.intervalWeeks) || 1)),
      startsOn: params.startsOn,
      untilOn: params.untilOn || null,
    },
  });

  const horizon = getLessonsConfig().horizonMonths;
  const to = series.untilOn && series.untilOn < horizonEndYmd(horizon) ? series.untilOn : horizonEndYmd(horizon);
  const booked: number[] = [];
  const skipped: string[] = [];
  for (const clubDate of eachYmdInclusive(series.startsOn, to)) {
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
    try {
      const result = await bookIndividualLesson({
        ...params,
        clubDate,
        seriesId: series.id,
      });
      booked.push(result.lesson!.id);
    } catch {
      skipped.push(clubDate);
    }
  }
  return { series, booked, skipped };
}

export async function cancelIndividualLesson(params: {
  lessonId: number;
  actorMemberId: number;
  actorType: LessonLifecycleActorType;
  isAdmin: boolean;
  cancelReason?: string | null;
}): Promise<{ creditedCents: number }> {
  const lesson = await prisma.individualLesson.findUnique({
    where: { id: params.lessonId },
    include: { coach: true },
  });
  if (!lesson || lesson.status !== 'CONFIRMED') {
    throw new Error('Lesson not found');
  }
  const lessons = getLessonsConfig();
  const hoursLeft = hoursUntilStart(lesson.clubDate, lesson.startTime);
  const studentLimit = lesson.studentCancelHoursOverride ?? lessons.studentCancelHours;
  const coachLimit = lessons.coachCancelHours;
  const isPlayer = params.actorMemberId === lesson.playerMemberId;
  const isCoach = params.actorMemberId === lesson.coach.memberId;
  const reason = String(params.cancelReason || '').trim();

  if (!params.isAdmin) {
    if (isPlayer && hoursLeft < studentLimit) {
      throw new Error('Cancellation window for the student has closed');
    }
    if (isCoach && hoursLeft < coachLimit) {
      throw new Error('Cancellation window for the coach has closed');
    }
    if (!isPlayer && !isCoach) {
      throw new Error('Not allowed to cancel this lesson');
    }
  }
  if (isPlayer && !params.isAdmin && !reason) {
    throw new Error('A cancellation reason is required');
  }

  const coachOrAdminCancel = params.isAdmin || isCoach;
  let creditedCents = 0;
  if (lesson.paymentId) {
    const payment = await prisma.clubPayment.findUnique({ where: { id: lesson.paymentId } });
    if (payment?.status === 'PENDING') {
      await cancelPendingLessonPayment(payment.id);
    } else if (payment?.status === 'SUCCEEDED') {
      const beforeDeadline = hoursLeft >= studentLimit;
      if (coachOrAdminCancel || beforeDeadline) {
        creditedCents = await creditSucceededLessonPayment(payment.id);
      }
    }
  }

  await prisma.individualLesson.update({
    where: { id: lesson.id },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelledByMemberId: params.actorMemberId,
      cancelReason: reason || null,
    },
  });
  await recordLessonLifecycle({
    action: 'CANCEL',
    actorType: params.actorType,
    actorMemberId: params.actorMemberId,
    entityType: 'individual_lesson',
    entityId: lesson.id,
    details: { creditedCents, cancelReason: reason || null },
  });
  const player = await prisma.member.findUnique({
    where: { id: lesson.playerMemberId },
    select: { email: true, firstName: true, lastName: true },
  });
  const coachMember = await prisma.member.findUnique({
    where: { id: lesson.coach.memberId },
    select: { email: true, firstName: true },
  });
  await sendIndividualLessonCancelledEmail({
    playerEmail: player?.email ?? null,
    playerFirstName: player?.firstName || 'Player',
    playerName: `${player?.firstName || ''} ${player?.lastName || ''}`.trim(),
    coachEmail: coachMember?.email ?? null,
    coachFirstName: coachMember?.firstName || 'Coach',
    whenLabel: `${lesson.clubDate} ${lesson.startTime}`,
    reason: reason || null,
  });
  await notifyLessonCalendar({
    coachProfileId: lesson.coachProfileId,
    memberId: lesson.coach.memberId,
    reason: 'cancel',
    clubDate: lesson.clubDate,
  });
  return { creditedCents };
}

export async function reduceIndividualLessonRate(params: {
  lessonId: number;
  hourlyRateCents: number;
  actorMemberId: number;
}) {
  const lesson = await prisma.individualLesson.findUnique({ where: { id: params.lessonId } });
  if (!lesson || lesson.status !== 'CONFIRMED') throw new Error('Lesson not found');
  const next = Math.max(0, Math.floor(params.hourlyRateCents));
  if (next > lesson.hourlyRateCents) {
    throw new Error('Rate can only be reduced');
  }
  const priceCents = priceCentsFromHourly(next, lesson.durationMinutes);
  const updated = await prisma.individualLesson.update({
    where: { id: lesson.id },
    data: { hourlyRateCents: next, priceCents },
  });
  await recordLessonLifecycle({
    action: 'RATE_REDUCE',
    actorType: 'COACH',
    actorMemberId: params.actorMemberId,
    entityType: 'individual_lesson',
    entityId: lesson.id,
    details: { from: lesson.hourlyRateCents, to: next },
  });
  return updated;
}

export async function listPlayerLessons(memberId: number, from = getClubDate()) {
  return prisma.individualLesson.findMany({
    where: { playerMemberId: memberId, clubDate: { gte: from }, status: 'CONFIRMED' },
    include: {
      coach: { include: { member: { select: { firstName: true, lastName: true, id: true } } } },
    },
    orderBy: [{ clubDate: 'asc' }, { startTime: 'asc' }],
  });
}

export async function listCoachLessons(coachProfileId: number, from = getClubDate()) {
  return prisma.individualLesson.findMany({
    where: { coachProfileId, clubDate: { gte: from }, status: 'CONFIRMED' },
    include: {
      player: { select: { id: true, firstName: true, lastName: true, rating: true } },
    },
    orderBy: [{ clubDate: 'asc' }, { startTime: 'asc' }],
  });
}
