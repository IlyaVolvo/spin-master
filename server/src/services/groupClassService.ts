import { randomBytes } from 'crypto';
import { prisma } from '../index';
import { getLessonsConfig } from './systemConfigService';
import { assertCoachAndPlayerFree, coachBusyIntervals, intervalConflicts } from './busyTimeService';
import { recordLessonLifecycle } from './lessonLifecycle';
import { runLessonCheckout, creditSucceededLessonPayment, cancelPendingLessonPayment } from '../payments/lessonPayment';
import {
  addMinutesToHhmm,
  clubHoursContainRange,
  eachYmdInclusive,
  horizonEndYmd,
  isFifteenMinuteSnap,
  matchesRecurrence,
  memberAgeOnDate,
  normalizeWeekdays,
  windowContains,
} from '../utils/lessonTime';
import { materializeAvailabilitySeriesForCoach } from './availabilityService';
import { resolveHoursForClubDate } from '../utils/clubHours';
import { clubLocalDateTimeUtc, getClubTimezone } from '../utils/clubDate';
import type { LessonLifecycleActorType } from '@prisma/client';
import type { PaymentInitiatedBy } from '../payments/types';
import {
  sendGroupBelowMinEmail,
  sendGroupClassRegisteredEmail,
  sendGroupOccurrenceCancelledEmail,
  sendGroupWaitlistPromotedEmail,
} from './mailService';
import { notifyLessonCalendar } from './lessonCalendarEvents';

function newPublicCode(): string {
  return randomBytes(6).toString('hex');
}

function memberHasPlayerRole(roles: string[]): boolean {
  return roles.some((role) => String(role).toUpperCase() === 'PLAYER');
}

function hoursUntil(clubDate: string, startTime: string): number {
  return (clubLocalDateTimeUtc(clubDate, startTime, getClubTimezone()).getTime() - Date.now()) / 3600000;
}

function groupEligibilityError(
  cls: { ratingMin: number | null; ratingMax: number | null; ageMin: number | null; ageMax: number | null },
  player: { rating: number | null; birthDate: Date | null },
  clubDate: string,
  bypass: boolean,
): string | null {
  if (bypass) return null;
  if (cls.ratingMin != null || cls.ratingMax != null) {
    if (player.rating == null) return 'A rating is required for this class';
    if (cls.ratingMin != null && player.rating < cls.ratingMin) return 'Player rating is below this class range';
    if (cls.ratingMax != null && player.rating > cls.ratingMax) return 'Player rating is above this class range';
  }
  if (cls.ageMin != null || cls.ageMax != null) {
    const age = memberAgeOnDate(player.birthDate, clubDate);
    if (age == null) return 'A birth date is required for this class';
    if (cls.ageMin != null && age < cls.ageMin) return 'Player is younger than this class allows';
    if (cls.ageMax != null && age > cls.ageMax) return 'Player is older than this class allows';
  }
  return null;
}

async function extraCoachHasAvailability(
  coachProfileId: number,
  clubDate: string,
  startTime: string,
  endTime: string,
): Promise<boolean> {
  await materializeAvailabilitySeriesForCoach(coachProfileId);
  const rows = await prisma.coachAvailabilityOccurrence.findMany({
    where: { clubDate, cancelled: false, series: { coachProfileId } },
  });
  return rows.some((row) => windowContains(row.startTime, row.endTime, startTime, endTime));
}

export async function createGroupClass(params: {
  creatorCoachProfileId: number;
  actorMemberId: number;
  title: string;
  durationMinutes: number;
  pricePerOccurrenceCents: number;
  minParticipants: number;
  maxParticipants: number;
  ratingMin?: number | null;
  ratingMax?: number | null;
  ageMin?: number | null;
  ageMax?: number | null;
  intervalWeeks?: number;
  startsOn: string;
  untilOn?: string | null;
  slots: Array<{ weekday: string; startTime: string }>;
  additionalCoachProfileIds?: number[];
  splitPercents?: Record<number, number>;
}) {
  const lessons = getLessonsConfig();
  if (!lessons.groupDurations.allowedMinutes.includes(params.durationMinutes)) {
    throw new Error('Duration is not allowed for group classes');
  }
  const slots = params.slots.map((s) => ({
    weekday: normalizeWeekdays([s.weekday])[0],
    startTime: s.startTime,
  }));
  if (slots.some((s) => !s.weekday || !isFifteenMinuteSnap(s.startTime))) {
    throw new Error('Each class time needs a weekday and a 15-minute start');
  }
  const weekdays = slots.map((s) => s.weekday);
  if (new Set(weekdays).size !== weekdays.length) {
    throw new Error('At most one class time per day');
  }
  if (slots.length < 1) throw new Error('Add at least one weekly time');

  const extraIds = [...new Set((params.additionalCoachProfileIds || []).filter((id) => id !== params.creatorCoachProfileId))];
  const allCoachIds = [params.creatorCoachProfileId, ...extraIds];
  const intervalWeeks = Math.max(1, Math.floor(Number(params.intervalWeeks) || 1));
  if (intervalWeeks !== 1 && intervalWeeks !== 2) {
    throw new Error('Group classes repeat every 1 or 2 weeks');
  }
  const untilOn = params.untilOn || null;
  const horizon = horizonEndYmd(lessons.horizonMonths);
  const to = untilOn && untilOn < horizon ? untilOn : horizon;

  const planned: Array<{ clubDate: string; startTime: string; endTime: string }> = [];
  for (const clubDate of eachYmdInclusive(params.startsOn, to)) {
    for (const slot of slots) {
      if (
        !matchesRecurrence({
          clubDate,
          startsOn: params.startsOn,
          untilOn,
          weekdays: [slot.weekday],
          intervalWeeks,
        })
      ) {
        continue;
      }
      const endTime = addMinutesToHhmm(slot.startTime, params.durationMinutes);
      const { hours } = resolveHoursForClubDate(clubDate);
      if (hours.closed) continue;
      if (!clubHoursContainRange(clubDate, slot.startTime, endTime)) {
        throw new Error(`Class time is outside club hours on ${clubDate}`);
      }
      planned.push({ clubDate, startTime: slot.startTime, endTime });
    }
  }
  if (!planned.length) {
    throw new Error('No class dates fall inside club hours in the scheduling horizon');
  }

  for (const occ of planned) {
    for (const coachProfileId of allCoachIds) {
      const busy = await coachBusyIntervals(coachProfileId, occ.clubDate, occ.clubDate);
      if (intervalConflicts(busy, occ.clubDate, occ.startTime, occ.endTime)) {
        throw new Error(`Conflict on ${occ.clubDate} ${occ.startTime} for a listed coach`);
      }
      if (coachProfileId !== params.creatorCoachProfileId) {
        const ok = await extraCoachHasAvailability(coachProfileId, occ.clubDate, occ.startTime, occ.endTime);
        if (!ok) {
          throw new Error(`Additional coach is not available on ${occ.clubDate} ${occ.startTime}`);
        }
      }
    }
  }

  const percents = new Map<number, number>();
  if (params.splitPercents && Object.keys(params.splitPercents).length) {
    let sum = 0;
    for (const id of allCoachIds) {
      const p = Math.floor(Number(params.splitPercents[id]));
      if (!Number.isFinite(p) || p < 0) throw new Error('Split percents are invalid');
      percents.set(id, p);
      sum += p;
    }
    if (sum !== 100) throw new Error('Coach split percents must sum to 100');
  } else {
    const share = Math.floor(100 / allCoachIds.length);
    let remainder = 100 - share * allCoachIds.length;
    for (const id of allCoachIds) {
      percents.set(id, share + (remainder > 0 ? 1 : 0));
      if (remainder > 0) remainder -= 1;
    }
  }

  const created = await prisma.groupClass.create({
    data: {
      creatorCoachProfileId: params.creatorCoachProfileId,
      publicCode: newPublicCode(),
      title: params.title.trim() || 'Group class',
      durationMinutes: params.durationMinutes,
      pricePerOccurrenceCents: Math.max(0, Math.floor(params.pricePerOccurrenceCents)),
      minParticipants: Math.max(1, Math.floor(params.minParticipants)),
      maxParticipants: Math.max(params.minParticipants, Math.floor(params.maxParticipants)),
      ratingMin: params.ratingMin ?? null,
      ratingMax: params.ratingMax ?? null,
      ageMin: params.ageMin ?? null,
      ageMax: params.ageMax ?? null,
      intervalWeeks,
      startsOn: params.startsOn,
      untilOn,
      firstSessionDeadlineHours: lessons.defaultFirstSessionDeadlineHours,
      occurrenceDeadlineHours: lessons.defaultOccurrenceDeadlineHours,
      slots: { create: slots.map((s) => ({ weekday: s.weekday, startTime: s.startTime })) },
      coaches: {
        create: allCoachIds.map((id) => ({ coachProfileId: id, splitPercent: percents.get(id) || 0 })),
      },
      occurrences: {
        create: planned.map((occ) => ({
          clubDate: occ.clubDate,
          startTime: occ.startTime,
          endTime: occ.endTime,
        })),
      },
    },
    include: { slots: true, coaches: true, occurrences: { orderBy: { clubDate: 'asc' } } },
  });

  await recordLessonLifecycle({
    action: 'CLASS_CREATE',
    actorType: 'COACH',
    actorMemberId: params.actorMemberId,
    entityType: 'group_class',
    entityId: created.id,
    details: { publicCode: created.publicCode, occurrenceCount: planned.length },
  });
  await notifyLessonCalendar({ coachProfileIds: allCoachIds, reason: 'group' });
  return created;
}

export async function getGroupClassByCode(publicCode: string) {
  await materializeGroupClassByCode(publicCode);
  return prisma.groupClass.findUnique({
    where: { publicCode },
    include: {
      creator: { include: { member: { select: { id: true, firstName: true, lastName: true } } } },
      coaches: {
        include: { coachProfile: { include: { member: { select: { id: true, firstName: true, lastName: true } } } } },
      },
      slots: true,
      occurrences: {
        where: { cancelled: false },
        orderBy: { clubDate: 'asc' },
        include: {
          registrations: {
            where: { status: { in: ['REGISTERED', 'WAITLIST'] } },
            include: { member: { select: { id: true, firstName: true, lastName: true } } },
            orderBy: [{ waitlistPosition: 'asc' }, { id: 'asc' }],
          },
        },
      },
    },
  });
}

async function materializeGroupClassByCode(publicCode: string) {
  const cls = await prisma.groupClass.findUnique({
    where: { publicCode },
    include: { slots: true, occurrences: true },
  });
  if (!cls) return;
  const horizon = horizonEndYmd(getLessonsConfig().horizonMonths);
  const to = cls.untilOn && cls.untilOn < horizon ? cls.untilOn : horizon;
  const existing = new Set(cls.occurrences.map((o) => `${o.clubDate}|${o.startTime}`));
  for (const clubDate of eachYmdInclusive(cls.startsOn, to)) {
    for (const slot of cls.slots) {
      if (
        !matchesRecurrence({
          clubDate,
          startsOn: cls.startsOn,
          untilOn: cls.untilOn,
          weekdays: [slot.weekday],
          intervalWeeks: cls.intervalWeeks,
        })
      ) {
        continue;
      }
      const endTime = addMinutesToHhmm(slot.startTime, cls.durationMinutes);
      const key = `${clubDate}|${slot.startTime}`;
      if (existing.has(key) || !clubHoursContainRange(clubDate, slot.startTime, endTime)) continue;
      await prisma.groupClassOccurrence.create({
        data: { classId: cls.id, clubDate, startTime: slot.startTime, endTime },
      });
      existing.add(key);
    }
  }
}

export async function registerForOccurrence(params: {
  occurrenceId: number;
  playerMemberId: number;
  actorMemberId: number;
  actorType: LessonLifecycleActorType;
  bypassEligibility?: boolean;
  waitlistIfFull?: boolean;
  initiatedBy: PaymentInitiatedBy;
}) {
  const occurrence = await prisma.groupClassOccurrence.findUnique({
    where: { id: params.occurrenceId },
    include: { groupClass: { include: { coaches: true } }, registrations: true },
  });
  if (!occurrence || occurrence.cancelled) throw new Error('Class occurrence not found');
  const cls = occurrence.groupClass;
  const player = await prisma.member.findUnique({
    where: { id: params.playerMemberId },
    select: { id: true, rating: true, birthDate: true, roles: true, firstName: true, lastName: true, email: true, isActive: true },
  });
  if (!player || !memberHasPlayerRole(player.roles)) throw new Error('Only players can register');
  if (!player.isActive && !params.bypassEligibility) {
    throw new Error('Inactive members cannot register themselves');
  }
  const elig = groupEligibilityError(cls, player, occurrence.clubDate, Boolean(params.bypassEligibility));
  if (elig) throw new Error(elig);
  for (const coach of cls.coaches) {
    await assertCoachAndPlayerFree({
      coachProfileId: coach.coachProfileId,
      playerMemberId: player.id,
      clubDate: occurrence.clubDate,
      startTime: occurrence.startTime,
      endTime: occurrence.endTime,
    });
  }

  const registered = occurrence.registrations.filter((r) => r.status === 'REGISTERED');
  const waitlisted = occurrence.registrations.filter((r) => r.status === 'WAITLIST');
  if (occurrence.registrations.some((r) => r.memberId === player.id && r.status !== 'DROPPED')) {
    throw new Error('Already on this class');
  }

  const full = registered.length >= cls.maxParticipants;
  if (full && !params.waitlistIfFull) throw new Error('Class is full');
  const status = full ? 'WAITLIST' : 'REGISTERED';
  const row = await prisma.groupClassRegistration.create({
    data: {
      occurrenceId: occurrence.id,
      memberId: player.id,
      status,
      waitlistPosition: full ? waitlisted.length + 1 : null,
      priceCents: cls.pricePerOccurrenceCents,
    },
  });

  let checkout = null;
  if (status === 'REGISTERED') {
    checkout = await runLessonCheckout({
      memberId: player.id,
      amountCents: cls.pricePerOccurrenceCents,
      purpose: `Group class: ${cls.title} ${occurrence.clubDate} ${occurrence.startTime}`,
      product: {
        kind: 'lesson_group',
        registrationId: row.id,
        occurrenceId: occurrence.id,
        amountCents: cls.pricePerOccurrenceCents,
      },
      initiatedBy: params.initiatedBy,
      attach: { groupRegistrationId: row.id },
    });
  }

  await recordLessonLifecycle({
    action: status === 'WAITLIST' ? 'WAITLIST' : params.bypassEligibility ? 'PLACE' : 'REGISTER',
    actorType: params.actorType,
    actorMemberId: params.actorMemberId,
    entityType: 'group_registration',
    entityId: row.id,
    details: { occurrenceId: occurrence.id, status },
  });
  await sendGroupClassRegisteredEmail({
    toEmail: player.email,
    firstName: player.firstName,
    title: cls.title,
    whenLabel: `${occurrence.clubDate} ${occurrence.startTime}`,
    waitlisted: status === 'WAITLIST',
  });
  await notifyLessonCalendar({
    coachProfileIds: cls.coaches.map((c) => c.coachProfileId),
    reason: 'group',
    clubDate: occurrence.clubDate,
  });
  return { registration: row, checkout, status };
}

export async function dropGroupRegistration(params: {
  registrationId: number;
  actorMemberId: number;
  actorType: LessonLifecycleActorType;
  isAdmin: boolean;
}) {
  const row = await prisma.groupClassRegistration.findUnique({
    where: { id: params.registrationId },
    include: { occurrence: { include: { groupClass: true } } },
  });
  if (!row || row.status === 'DROPPED') throw new Error('Registration not found');
  const occ = row.occurrence;
  const hoursLeft = hoursUntil(occ.clubDate, occ.startTime);
  const isPlayer = params.actorMemberId === row.memberId;
  if (!params.isAdmin && isPlayer && hoursLeft < occ.groupClass.occurrenceDeadlineHours) {
    throw new Error('Cancellation deadline has passed');
  }
  const wasRegistered = row.status === 'REGISTERED';
  if (row.paymentId) {
    const payment = await prisma.clubPayment.findUnique({ where: { id: row.paymentId } });
    if (payment?.status === 'PENDING') await cancelPendingLessonPayment(payment.id);
    else if (payment?.status === 'SUCCEEDED' && (params.isAdmin || hoursLeft >= occ.groupClass.occurrenceDeadlineHours)) {
      await creditSucceededLessonPayment(payment.id);
    }
  }
  await prisma.groupClassRegistration.update({
    where: { id: row.id },
    data: { status: 'DROPPED', waitlistPosition: null },
  });
  await recordLessonLifecycle({
    action: 'DROP',
    actorType: params.actorType,
    actorMemberId: params.actorMemberId,
    entityType: 'group_registration',
    entityId: row.id,
  });
  if (wasRegistered && hoursLeft >= occ.groupClass.occurrenceDeadlineHours) {
    await promoteWaitlist(occ.id, params.actorMemberId);
  }
  if (wasRegistered) {
    const remaining = await prisma.groupClassRegistration.count({
      where: { occurrenceId: occ.id, status: 'REGISTERED' },
    });
    if (remaining < occ.groupClass.minParticipants && !occ.runBelowMin && hoursLeft > 0) {
      const creator = await prisma.coachProfile.findUnique({
        where: { id: occ.groupClass.creatorCoachProfileId },
        include: { member: { select: { email: true, firstName: true } } },
      });
      await sendGroupBelowMinEmail({
        toEmail: creator?.member.email ?? null,
        firstName: creator?.member.firstName || 'Coach',
        title: occ.groupClass.title,
        whenLabel: `${occ.clubDate} ${occ.startTime}`,
        registered: remaining,
        min: occ.groupClass.minParticipants,
      });
    }
  }
  await notifyLessonCalendar({
    coachProfileId: occ.groupClass.creatorCoachProfileId,
    reason: 'group',
    clubDate: occ.clubDate,
  });
}

async function promoteWaitlist(occurrenceId: number, actorMemberId: number) {
  const occurrence = await prisma.groupClassOccurrence.findUnique({
    where: { id: occurrenceId },
    include: {
      groupClass: true,
      registrations: {
        where: { status: 'WAITLIST' },
        include: { member: true },
        orderBy: [{ waitlistPosition: 'asc' }, { id: 'asc' }],
      },
    },
  });
  if (!occurrence?.registrations[0]) return;
  const next = occurrence.registrations[0];
  if (groupEligibilityError(occurrence.groupClass, next.member, occurrence.clubDate, false)) return;
  await prisma.groupClassRegistration.update({
    where: { id: next.id },
    data: { status: 'REGISTERED', waitlistPosition: null },
  });
  await runLessonCheckout({
    memberId: next.memberId,
    amountCents: occurrence.groupClass.pricePerOccurrenceCents,
    purpose: `Group class: ${occurrence.groupClass.title} ${occurrence.clubDate} ${occurrence.startTime}`,
    product: {
      kind: 'lesson_group',
      registrationId: next.id,
      occurrenceId: occurrence.id,
      amountCents: occurrence.groupClass.pricePerOccurrenceCents,
    },
    initiatedBy: 'ADMIN',
    attach: { groupRegistrationId: next.id },
  });
  await recordLessonLifecycle({
    action: 'PROMOTE',
    actorType: 'SYSTEM',
    actorMemberId,
    entityType: 'group_registration',
    entityId: next.id,
  });
  await sendGroupWaitlistPromotedEmail({
    toEmail: next.member.email,
    firstName: next.member.firstName,
    title: occurrence.groupClass.title,
    whenLabel: `${occurrence.clubDate} ${occurrence.startTime}`,
  });
}

export async function cancelGroupOccurrence(params: {
  occurrenceId: number;
  actorMemberId: number;
  isAdmin: boolean;
  actorCoachProfileId: number | null;
}) {
  const occ = await prisma.groupClassOccurrence.findUnique({
    where: { id: params.occurrenceId },
    include: {
      groupClass: true,
      registrations: { include: { member: { select: { email: true, firstName: true } } } },
    },
  });
  if (!occ || occ.cancelled) throw new Error('Occurrence not found');
  const isCreator = params.actorCoachProfileId === occ.groupClass.creatorCoachProfileId;
  if (!params.isAdmin && !isCreator) {
    throw new Error('Only the creator or an admin can cancel this class time');
  }
  await prisma.groupClassOccurrence.update({ where: { id: occ.id }, data: { cancelled: true } });
  for (const reg of occ.registrations.filter((r) => r.status !== 'DROPPED')) {
    if (reg.paymentId) {
      const payment = await prisma.clubPayment.findUnique({ where: { id: reg.paymentId } });
      if (payment?.status === 'PENDING') await cancelPendingLessonPayment(payment.id);
      else if (payment?.status === 'SUCCEEDED') await creditSucceededLessonPayment(payment.id);
    }
    await prisma.groupClassRegistration.update({ where: { id: reg.id }, data: { status: 'DROPPED' } });
    await sendGroupOccurrenceCancelledEmail({
      toEmail: reg.member.email,
      firstName: reg.member.firstName,
      title: occ.groupClass.title,
      whenLabel: `${occ.clubDate} ${occ.startTime}`,
    });
  }
  await recordLessonLifecycle({
    action: 'CANCEL',
    actorType: params.isAdmin ? 'ADMIN' : 'COACH',
    actorMemberId: params.actorMemberId,
    entityType: 'group_occurrence',
    entityId: occ.id,
  });
  await notifyLessonCalendar({
    coachProfileId: occ.groupClass.creatorCoachProfileId,
    reason: 'group',
    clubDate: occ.clubDate,
  });
}

export async function listCoachGroupClasses(coachProfileId: number) {
  return prisma.groupClass.findMany({
    where: { coaches: { some: { coachProfileId } } },
    include: {
      slots: true,
      coaches: { include: { coachProfile: { include: { member: { select: { id: true, firstName: true, lastName: true } } } } } },
      occurrences: {
        where: { cancelled: false },
        orderBy: { clubDate: 'asc' },
        include: {
          registrations: {
            where: { status: { in: ['REGISTERED', 'WAITLIST'] } },
            include: { member: { select: { id: true, firstName: true, lastName: true } } },
          },
        },
      },
    },
    orderBy: { id: 'desc' },
  });
}

export async function listPlayerGroupRegistrations(memberId: number) {
  return prisma.groupClassRegistration.findMany({
    where: {
      memberId,
      status: { in: ['REGISTERED', 'WAITLIST'] },
      occurrence: { cancelled: false },
    },
    include: {
      occurrence: {
        include: { groupClass: { select: { id: true, title: true, publicCode: true } } },
      },
    },
    orderBy: [{ id: 'asc' }],
  });
}

export async function runGroupOccurrenceBelowMin(params: {
  occurrenceId: number;
  actorMemberId: number;
  isAdmin: boolean;
  actorCoachProfileId: number | null;
}) {
  const occ = await prisma.groupClassOccurrence.findUnique({
    where: { id: params.occurrenceId },
    include: { groupClass: true },
  });
  if (!occ || occ.cancelled) throw new Error('Occurrence not found');
  const isCreator = params.actorCoachProfileId === occ.groupClass.creatorCoachProfileId;
  if (!params.isAdmin && !isCreator) {
    throw new Error('Only the creator or an admin can run a class below minimum');
  }
  const updated = await prisma.groupClassOccurrence.update({
    where: { id: occ.id },
    data: { runBelowMin: true },
  });
  await recordLessonLifecycle({
    action: 'CLASS_RUN_BELOW_MIN',
    actorType: params.isAdmin ? 'ADMIN' : 'COACH',
    actorMemberId: params.actorMemberId,
    entityType: 'group_occurrence',
    entityId: occ.id,
  });
  return updated;
}

export async function cancelRemainingGroupOccurrences(params: {
  classId: number;
  fromClubDate: string;
  actorMemberId: number;
  isAdmin: boolean;
  actorCoachProfileId: number | null;
}) {
  if (!params.isAdmin) {
    throw new Error('Only an admin can cancel remaining weeks');
  }
  const occs = await prisma.groupClassOccurrence.findMany({
    where: { classId: params.classId, cancelled: false, clubDate: { gte: params.fromClubDate } },
    select: { id: true },
  });
  for (const occ of occs) {
    await cancelGroupOccurrence({
      occurrenceId: occ.id,
      actorMemberId: params.actorMemberId,
      isAdmin: true,
      actorCoachProfileId: params.actorCoachProfileId,
    });
  }
  const [y, m, d] = params.fromClubDate.split('-').map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d - 1));
  const untilOn = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}-${String(prev.getUTCDate()).padStart(2, '0')}`;
  await prisma.groupClass.update({
    where: { id: params.classId },
    data: { untilOn },
  });
  return { cancelled: occs.length };
}
