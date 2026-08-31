import { randomBytes } from 'crypto';
import { prisma } from '../index';
import { getLessonsConfig } from './systemConfigService';
import { assertCoachAndPlayerFree, coachBusyIntervals, intervalConflicts, playerBusyIntervals } from './busyTimeService';
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
} from '../utils/lessonTime';
import { resolveHoursForClubDate } from '../utils/clubHours';
import { addDaysToYmd, clubLocalDateTimeUtc, getClubDate, getClubTimezone } from '../utils/clubDate';
import type { LessonLifecycleActorType } from '@prisma/client';
import type { PaymentInitiatedBy } from '../payments/types';
import {
  sendGroupClassBlastEmail,
  sendGroupClassRegisteredEmail,
  sendGroupCoachInviteEmail,
  sendGroupDesignatedExpiredEmail,
  sendGroupDesignatedSeatEmail,
  sendGroupOccurrenceCancelledEmail,
  sendGroupWaitlistPromotedEmail,
} from './mailService';
import { notifyLessonCalendar } from './lessonCalendarEvents';

export const GROUP_CAPACITY_STATUSES = ['PENDING', 'ACCEPTED'] as const;
export const GROUP_OPEN_REG_STATUSES = ['PENDING', 'ACCEPTED', 'WAITING'] as const;

export function countsTowardCapacity(status: string): boolean {
  return status === 'PENDING' || status === 'ACCEPTED';
}

export function designatedHoldExpired(
  firstOccurrenceYmd: string,
  daysBefore: number,
  todayYmd: string,
): boolean {
  return todayYmd >= addDaysToYmd(firstOccurrenceYmd, -Math.max(0, daysBefore));
}

export function belowMinCancelDue(hoursUntilStart: number, deadlineHours: number): boolean {
  return hoursUntilStart <= deadlineHours;
}

function newPublicCode(): string {
  return randomBytes(6).toString('hex');
}

function newToken(): string {
  return randomBytes(24).toString('hex');
}

function memberHasPlayerRole(roles: string[]): boolean {
  return roles.some((role) => String(role).toUpperCase() === 'PLAYER');
}

function hoursUntil(clubDate: string, startTime: string): number {
  return (clubLocalDateTimeUtc(clubDate, startTime, getClubTimezone()).getTime() - Date.now()) / 3600000;
}

function occurrenceEnded(clubDate: string, endTime: string): boolean {
  return Date.now() >= clubLocalDateTimeUtc(clubDate, endTime, getClubTimezone()).getTime();
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

function whenLabelForClass(startsOn: string, slots: Array<{ weekday: string; startTime: string }>): string {
  const first = slots[0];
  return first ? `${startsOn} ${first.startTime}` : startsOn;
}

const classInclude = {
  slots: true,
  designees: {
    include: { member: { select: { id: true, firstName: true, lastName: true } } },
  },
  creator: { include: { member: { select: { id: true, firstName: true, lastName: true } } } },
  coaches: {
    include: { coachProfile: { include: { member: { select: { id: true, firstName: true, lastName: true, email: true } } } } },
  },
  occurrences: {
    where: { cancelled: false },
    orderBy: { clubDate: 'asc' as const },
    include: {
      registrations: {
        where: { status: { in: [...GROUP_OPEN_REG_STATUSES] } },
        include: { member: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: [{ waitlistPosition: 'asc' as const }, { id: 'asc' as const }],
      },
    },
  },
};

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
  durationWeeks?: number | null;
  startsOn: string;
  untilOn?: string | null;
  occurrenceDeadlineHours?: number | null;
  slots: Array<{ weekday: string; startTime: string }>;
  additionalCoachProfileIds?: number[];
  splitPercents?: Record<number, number>;
  designeeMemberIds?: number[];
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
  const durationWeeks =
    params.durationWeeks != null && Number.isFinite(Number(params.durationWeeks))
      ? Math.max(1, Math.floor(Number(params.durationWeeks)))
      : null;
  const untilOn = durationWeeks ? addDaysToYmd(params.startsOn, 7 * (durationWeeks - 1)) : params.untilOn || null;
  const horizon = horizonEndYmd(lessons.horizonMonths);
  const to = untilOn && untilOn < horizon ? untilOn : horizon;
  const minParticipants = Math.max(1, Math.floor(params.minParticipants));
  const maxParticipants = Math.max(minParticipants, Math.floor(params.maxParticipants));
  const occurrenceDeadlineHours =
    params.occurrenceDeadlineHours != null && Number.isFinite(Number(params.occurrenceDeadlineHours))
      ? Math.max(0, Math.floor(Number(params.occurrenceDeadlineHours)))
      : lessons.defaultOccurrenceDeadlineHours;

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
    const busy = await coachBusyIntervals(params.creatorCoachProfileId, occ.clubDate, occ.clubDate);
    if (intervalConflicts(busy, occ.clubDate, occ.startTime, occ.endTime)) {
      throw new Error(`Conflict on ${occ.clubDate} ${occ.startTime}`);
    }
  }

  const designeeIds = [...new Set((params.designeeMemberIds || []).map((id) => Math.floor(Number(id))).filter((id) => id > 0))];
  if (designeeIds.length > maxParticipants) {
    throw new Error('Cannot designate more players than the class maximum');
  }
  const designees = designeeIds.length
    ? await prisma.member.findMany({
        where: { id: { in: designeeIds } },
        select: { id: true, rating: true, birthDate: true, roles: true, isActive: true, firstName: true, lastName: true },
      })
    : [];
  if (designees.length !== designeeIds.length) throw new Error('A designated player was not found');
  const classBounds = {
    ratingMin: params.ratingMin ?? null,
    ratingMax: params.ratingMax ?? null,
    ageMin: params.ageMin ?? null,
    ageMax: params.ageMax ?? null,
  };
  for (const player of designees) {
    if (!memberHasPlayerRole(player.roles)) throw new Error('Only players can be designated');
    const elig = groupEligibilityError(classBounds, player, planned[0].clubDate, false);
    if (elig) throw new Error(`${player.firstName} ${player.lastName}: ${elig}`);
    for (const occ of planned) {
      const busy = await playerBusyIntervals(player.id, occ.clubDate, occ.clubDate);
      if (intervalConflicts(busy, occ.clubDate, occ.startTime, occ.endTime)) {
        throw new Error(`${player.firstName} ${player.lastName} is busy on ${occ.clubDate} ${occ.startTime}`);
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

  const hasInvites = extraIds.length > 0;
  const now = new Date();
  const created = await prisma.groupClass.create({
    data: {
      creatorCoachProfileId: params.creatorCoachProfileId,
      publicCode: newPublicCode(),
      title: params.title.trim() || 'Group class',
      status: hasInvites ? 'PENDING' : 'ACCEPTING',
      durationMinutes: params.durationMinutes,
      pricePerOccurrenceCents: Math.max(0, Math.floor(params.pricePerOccurrenceCents)),
      minParticipants,
      maxParticipants,
      ratingMin: classBounds.ratingMin,
      ratingMax: classBounds.ratingMax,
      ageMin: classBounds.ageMin,
      ageMax: classBounds.ageMax,
      intervalWeeks,
      startsOn: params.startsOn,
      untilOn,
      firstSessionDeadlineHours: lessons.defaultFirstSessionDeadlineHours,
      occurrenceDeadlineHours,
      slots: { create: slots.map((s) => ({ weekday: s.weekday, startTime: s.startTime })) },
      coaches: {
        create: allCoachIds.map((id) => ({
          coachProfileId: id,
          splitPercent: percents.get(id) || 0,
          inviteStatus: id === params.creatorCoachProfileId ? 'ACCEPTED' : 'INVITED',
          inviteToken: newToken(),
          respondedAt: id === params.creatorCoachProfileId ? now : null,
        })),
      },
      occurrences: {
        create: planned.map((occ) => ({
          clubDate: occ.clubDate,
          startTime: occ.startTime,
          endTime: occ.endTime,
        })),
      },
      designees: {
        create: designees.map((d) => ({ memberId: d.id, acceptToken: newToken() })),
      },
    },
    include: {
      slots: true,
      coaches: { include: { coachProfile: { include: { member: true } } } },
      occurrences: { orderBy: { clubDate: 'asc' } },
      designees: true,
    },
  });

  if (designees.length && created.occurrences.length) {
    await prisma.groupClassRegistration.createMany({
      data: created.occurrences.flatMap((occ) =>
        designees.map((d) => ({
          occurrenceId: occ.id,
          memberId: d.id,
          status: 'PENDING' as const,
          priceCents: created.pricePerOccurrenceCents,
        })),
      ),
    });
  }

  await recordLessonLifecycle({
    action: 'CLASS_CREATE',
    actorType: 'COACH',
    actorMemberId: params.actorMemberId,
    entityType: 'group_class',
    entityId: created.id,
    details: { publicCode: created.publicCode, occurrenceCount: planned.length, status: created.status },
  });
  await notifyLessonCalendar({ coachProfileIds: [params.creatorCoachProfileId], reason: 'group' });

  if (hasInvites) {
    await sendCoachInviteEmails(created.id, extraIds);
  } else {
    await sendAcceptingMails(created.id);
  }
  return prisma.groupClass.findUniqueOrThrow({ where: { id: created.id }, include: classInclude });
}

async function sendCoachInviteEmails(classId: number, coachProfileIds?: number[]) {
  const cls = await prisma.groupClass.findUnique({
    where: { id: classId },
    include: {
      slots: true,
      coaches: {
        where: {
          inviteStatus: 'INVITED',
          ...(coachProfileIds?.length ? { coachProfileId: { in: coachProfileIds } } : {}),
        },
        include: { coachProfile: { include: { member: { select: { email: true, firstName: true } } } } },
      },
    },
  });
  if (!cls) return;
  const whenLabel = whenLabelForClass(cls.startsOn, cls.slots);
  for (const row of cls.coaches) {
    await sendGroupCoachInviteEmail({
      toEmail: row.coachProfile.member.email,
      firstName: row.coachProfile.member.firstName,
      title: cls.title,
      whenLabel,
      token: row.inviteToken,
    });
    await recordLessonLifecycle({
      action: 'CLASS_INVITE',
      actorType: 'SYSTEM',
      entityType: 'group_class_coach',
      entityId: row.id,
      details: { classId: cls.id },
    });
  }
}

async function sendAcceptingMails(classId: number) {
  const cls = await prisma.groupClass.findUnique({
    where: { id: classId },
    include: {
      slots: true,
      designees: {
        include: { member: { select: { id: true, email: true, firstName: true, lastName: true, rating: true, birthDate: true, roles: true, isActive: true } } },
      },
    },
  });
  if (!cls) return;
  const whenLabel = whenLabelForClass(cls.startsOn, cls.slots);
  const designeeIds = new Set(cls.designees.map((d) => d.memberId));
  for (const row of cls.designees) {
    await sendGroupDesignatedSeatEmail({
      toEmail: row.member.email,
      firstName: row.member.firstName,
      title: cls.title,
      whenLabel,
      code: cls.publicCode,
      token: row.acceptToken,
    });
  }
  const players = await prisma.member.findMany({
    where: { isActive: true, roles: { has: 'PLAYER' } },
    select: { id: true, email: true, firstName: true, rating: true, birthDate: true },
  });
  for (const player of players) {
    if (designeeIds.has(player.id)) continue;
    if (groupEligibilityError(cls, player, cls.startsOn, false)) continue;
    await sendGroupClassBlastEmail({
      toEmail: player.email,
      firstName: player.firstName,
      title: cls.title,
      whenLabel,
      code: cls.publicCode,
    });
  }
}

async function remainingInvitedCount(classId: number): Promise<number> {
  return prisma.groupClassCoach.count({ where: { classId, inviteStatus: 'INVITED' } });
}

async function enterAcceptingIfReady(classId: number) {
  const remaining = await remainingInvitedCount(classId);
  if (remaining > 0) return;
  const cls = await prisma.groupClass.findUnique({ where: { id: classId } });
  if (!cls || cls.status === 'ACCEPTING') return;
  await prisma.groupClass.update({ where: { id: classId }, data: { status: 'ACCEPTING' } });
  await sendAcceptingMails(classId);
}

async function coachConflictOnClass(coachProfileId: number, classId: number): Promise<string | null> {
  const occs = await prisma.groupClassOccurrence.findMany({
    where: { classId, cancelled: false },
    select: { clubDate: true, startTime: true, endTime: true },
  });
  for (const occ of occs) {
    const busy = await coachBusyIntervals(coachProfileId, occ.clubDate, occ.clubDate);
    if (intervalConflicts(busy, occ.clubDate, occ.startTime, occ.endTime)) {
      return `Conflict on ${occ.clubDate} ${occ.startTime}`;
    }
  }
  return null;
}

export async function listMyCoachInvites(coachProfileId: number) {
  const rows = await prisma.groupClassCoach.findMany({
    where: { coachProfileId, inviteStatus: 'INVITED', groupClass: { status: 'PENDING' } },
    include: {
      groupClass: {
        include: {
          slots: true,
          creator: { include: { member: { select: { id: true, firstName: true, lastName: true } } } },
          occurrences: { where: { cancelled: false }, orderBy: { clubDate: 'asc' }, take: 8 },
        },
      },
    },
    orderBy: { id: 'desc' },
  });
  const out = [];
  for (const row of rows) {
    const conflict = await coachConflictOnClass(coachProfileId, row.classId);
    out.push({
      id: row.id,
      classId: row.classId,
      inviteStatus: row.inviteStatus,
      conflict: Boolean(conflict),
      conflictMessage: conflict,
      groupClass: row.groupClass,
    });
  }
  return out;
}

export async function getCoachInviteByToken(token: string) {
  const row = await prisma.groupClassCoach.findUnique({
    where: { inviteToken: token },
    include: {
      groupClass: {
        include: {
          slots: true,
          creator: { include: { member: { select: { id: true, firstName: true, lastName: true } } } },
          occurrences: { where: { cancelled: false }, orderBy: { clubDate: 'asc' } },
        },
      },
      coachProfile: { include: { member: { select: { id: true, firstName: true, lastName: true } } } },
    },
  });
  if (!row) return null;
  const conflict = row.inviteStatus === 'INVITED' ? await coachConflictOnClass(row.coachProfileId, row.classId) : null;
  return { ...row, conflict: Boolean(conflict), conflictMessage: conflict };
}

async function acceptCoachInviteRow(rowId: number, actorMemberId: number | null, actorType: LessonLifecycleActorType) {
  const row = await prisma.groupClassCoach.findUnique({
    where: { id: rowId },
    include: { groupClass: true },
  });
  if (!row) throw new Error('Invitation not found');
  if (row.inviteStatus !== 'INVITED') throw new Error('This invitation is no longer open');
  const conflict = await coachConflictOnClass(row.coachProfileId, row.classId);
  if (conflict) throw new Error(`${conflict}. Cancel the conflicting lesson or class first.`);
  await prisma.groupClassCoach.update({
    where: { id: row.id },
    data: { inviteStatus: 'ACCEPTED', respondedAt: new Date() },
  });
  await recordLessonLifecycle({
    action: 'CLASS_INVITE_ACCEPT',
    actorType,
    actorMemberId,
    entityType: 'group_class_coach',
    entityId: row.id,
    details: { classId: row.classId },
  });
  await enterAcceptingIfReady(row.classId);
  await notifyLessonCalendar({ coachProfileId: row.coachProfileId, reason: 'group' });
  return prisma.groupClass.findUniqueOrThrow({ where: { id: row.classId }, include: classInclude });
}

async function denyCoachInviteRow(rowId: number, actorMemberId: number | null, actorType: LessonLifecycleActorType) {
  const row = await prisma.groupClassCoach.findUnique({ where: { id: rowId } });
  if (!row) throw new Error('Invitation not found');
  if (row.inviteStatus !== 'INVITED') throw new Error('This invitation is no longer open');
  await prisma.groupClassCoach.update({
    where: { id: row.id },
    data: { inviteStatus: 'DECLINED', respondedAt: new Date() },
  });
  await recordLessonLifecycle({
    action: 'CLASS_INVITE_DENY',
    actorType,
    actorMemberId,
    entityType: 'group_class_coach',
    entityId: row.id,
    details: { classId: row.classId },
  });
  await enterAcceptingIfReady(row.classId);
  return prisma.groupClass.findUniqueOrThrow({ where: { id: row.classId }, include: classInclude });
}

export async function acceptCoachInvite(params: { coachRowId: number; actorMemberId: number }) {
  const row = await prisma.groupClassCoach.findUnique({
    where: { id: params.coachRowId },
    include: { coachProfile: true },
  });
  if (!row) throw new Error('Invitation not found');
  if (row.coachProfile.memberId !== params.actorMemberId) throw new Error('Not your invitation');
  return acceptCoachInviteRow(row.id, params.actorMemberId, 'COACH');
}

export async function denyCoachInvite(params: { coachRowId: number; actorMemberId: number }) {
  const row = await prisma.groupClassCoach.findUnique({
    where: { id: params.coachRowId },
    include: { coachProfile: true },
  });
  if (!row) throw new Error('Invitation not found');
  if (row.coachProfile.memberId !== params.actorMemberId) throw new Error('Not your invitation');
  return denyCoachInviteRow(row.id, params.actorMemberId, 'COACH');
}

export async function acceptCoachInviteByToken(token: string) {
  const row = await prisma.groupClassCoach.findUnique({ where: { inviteToken: token } });
  if (!row) throw new Error('Invitation not found');
  return acceptCoachInviteRow(row.id, null, 'COACH');
}

export async function denyCoachInviteByToken(token: string) {
  const row = await prisma.groupClassCoach.findUnique({ where: { inviteToken: token } });
  if (!row) throw new Error('Invitation not found');
  return denyCoachInviteRow(row.id, null, 'COACH');
}

export async function addReplacementCoach(params: {
  classId: number;
  coachProfileId: number;
  actorMemberId: number;
  actorCoachProfileId: number;
  isAdmin: boolean;
}) {
  const cls = await prisma.groupClass.findUnique({
    where: { id: params.classId },
    include: { coaches: true },
  });
  if (!cls) throw new Error('Class not found');
  if (!params.isAdmin && params.actorCoachProfileId !== cls.creatorCoachProfileId) {
    throw new Error('Only the creator can invite a replacement coach');
  }
  if (cls.status !== 'PENDING') throw new Error('This class is no longer waiting on coaches');
  if (params.coachProfileId === cls.creatorCoachProfileId) throw new Error('Creator is already on this class');
  const existing = cls.coaches.find((c) => c.coachProfileId === params.coachProfileId);
  if (existing?.inviteStatus === 'ACCEPTED' || existing?.inviteStatus === 'INVITED') {
    throw new Error('That coach is already on this class');
  }
  const token = newToken();
  if (existing) {
    await prisma.groupClassCoach.update({
      where: { id: existing.id },
      data: { inviteStatus: 'INVITED', inviteToken: token, respondedAt: null },
    });
  } else {
    const accepted = cls.coaches.filter((c) => c.inviteStatus === 'ACCEPTED' || c.inviteStatus === 'INVITED');
    const share = Math.floor(100 / (accepted.length + 1));
    await prisma.groupClassCoach.create({
      data: {
        classId: cls.id,
        coachProfileId: params.coachProfileId,
        splitPercent: share,
        inviteStatus: 'INVITED',
        inviteToken: token,
      },
    });
  }
  await sendCoachInviteEmails(cls.id, [params.coachProfileId]);
  return prisma.groupClass.findUniqueOrThrow({ where: { id: cls.id }, include: classInclude });
}

export async function finalizeGroupClass(params: {
  classId: number;
  actorMemberId: number;
  actorCoachProfileId: number;
  isAdmin: boolean;
}) {
  const cls = await prisma.groupClass.findUnique({
    where: { id: params.classId },
    include: { coaches: true },
  });
  if (!cls) throw new Error('Class not found');
  if (!params.isAdmin && params.actorCoachProfileId !== cls.creatorCoachProfileId) {
    throw new Error('Only the creator can finalize this class');
  }
  if (cls.status !== 'PENDING') throw new Error('This class is already open');
  await prisma.groupClassCoach.updateMany({
    where: { classId: cls.id, inviteStatus: 'INVITED' },
    data: { inviteStatus: 'DECLINED', respondedAt: new Date() },
  });
  await prisma.groupClass.update({ where: { id: cls.id }, data: { status: 'ACCEPTING' } });
  await recordLessonLifecycle({
    action: 'CLASS_FINALIZE',
    actorType: params.isAdmin ? 'ADMIN' : 'COACH',
    actorMemberId: params.actorMemberId,
    entityType: 'group_class',
    entityId: cls.id,
  });
  await sendAcceptingMails(cls.id);
  return prisma.groupClass.findUniqueOrThrow({ where: { id: cls.id }, include: classInclude });
}

export async function getGroupClassByCode(publicCode: string) {
  await materializeGroupClassByCode(publicCode);
  return prisma.groupClass.findUnique({
    where: { publicCode },
    include: classInclude,
  });
}

async function materializeGroupClassByCode(publicCode: string) {
  const cls = await prisma.groupClass.findUnique({
    where: { publicCode },
    include: { slots: true, occurrences: true, designees: true },
  });
  if (!cls) return;
  const horizon = horizonEndYmd(getLessonsConfig().horizonMonths);
  const to = cls.untilOn && cls.untilOn < horizon ? cls.untilOn : horizon;
  const existing = new Set(cls.occurrences.map((o) => `${o.clubDate}|${o.startTime}`));
  const firstDate = cls.occurrences.map((o) => o.clubDate).sort()[0] || cls.startsOn;
  const holdOpen = !designatedHoldExpired(
    firstDate,
    getLessonsConfig().designatedAcceptDaysBeforeFirst,
    getClubDate(),
  );
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
      const occ = await prisma.groupClassOccurrence.create({
        data: { classId: cls.id, clubDate, startTime: slot.startTime, endTime },
      });
      existing.add(key);
      if (holdOpen && cls.designees.length) {
        await prisma.groupClassRegistration.createMany({
          data: cls.designees.map((d) => ({
            occurrenceId: occ.id,
            memberId: d.memberId,
            status: 'PENDING' as const,
            priceCents: cls.pricePerOccurrenceCents,
          })),
          skipDuplicates: true,
        });
      }
    }
  }
}

async function checkoutRegistration(params: {
  registrationId: number;
  memberId: number;
  amountCents: number;
  title: string;
  clubDate: string;
  startTime: string;
  occurrenceId: number;
  initiatedBy: PaymentInitiatedBy;
}) {
  return runLessonCheckout({
    memberId: params.memberId,
    amountCents: params.amountCents,
    purpose: `Group class: ${params.title} ${params.clubDate} ${params.startTime}`,
    product: {
      kind: 'lesson_group',
      registrationId: params.registrationId,
      occurrenceId: params.occurrenceId,
      amountCents: params.amountCents,
    },
    initiatedBy: params.initiatedBy,
    attach: { groupRegistrationId: params.registrationId },
  });
}

export async function acceptDesignatedSeat(params: {
  classId?: number;
  token?: string;
  actorMemberId?: number | null;
  initiatedBy: PaymentInitiatedBy;
}) {
  const designee = params.token
    ? await prisma.groupClassDesignee.findUnique({
        where: { acceptToken: params.token },
        include: { groupClass: true, member: true },
      })
    : params.classId && params.actorMemberId
      ? await prisma.groupClassDesignee.findUnique({
          where: { classId_memberId: { classId: params.classId, memberId: params.actorMemberId } },
          include: { groupClass: true, member: true },
        })
      : null;
  if (!designee) throw new Error('Reserved seat not found');
  if (params.actorMemberId && params.actorMemberId !== designee.memberId) {
    throw new Error('Not your reserved seat');
  }
  const pending = await prisma.groupClassRegistration.findMany({
    where: {
      memberId: designee.memberId,
      status: 'PENDING',
      occurrence: { classId: designee.classId, cancelled: false },
    },
    include: { occurrence: true },
  });
  if (!pending.length) throw new Error('No reserved seats left to accept');
  const checkouts = [];
  for (const row of pending) {
    await prisma.groupClassRegistration.update({
      where: { id: row.id },
      data: { status: 'ACCEPTED', waitlistPosition: null },
    });
    checkouts.push(
      await checkoutRegistration({
        registrationId: row.id,
        memberId: designee.memberId,
        amountCents: designee.groupClass.pricePerOccurrenceCents,
        title: designee.groupClass.title,
        clubDate: row.occurrence.clubDate,
        startTime: row.occurrence.startTime,
        occurrenceId: row.occurrenceId,
        initiatedBy: params.initiatedBy,
      }),
    );
  }
  await recordLessonLifecycle({
    action: 'DESIGNATED_ACCEPT',
    actorType: 'PLAYER',
    actorMemberId: designee.memberId,
    entityType: 'group_class',
    entityId: designee.classId,
    details: { accepted: pending.length },
  });
  await notifyLessonCalendar({
    coachProfileId: designee.groupClass.creatorCoachProfileId,
    reason: 'group',
  });
  return { accepted: pending.length, checkouts };
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
    include: {
      groupClass: { include: { coaches: true, designees: true } },
      registrations: true,
    },
  });
  if (!occurrence || occurrence.cancelled) throw new Error('Class occurrence not found');
  const cls = occurrence.groupClass;
  if (cls.status !== 'ACCEPTING' && !params.bypassEligibility) {
    throw new Error('This class is not open for registration yet');
  }
  const isDesignee = cls.designees.some((d) => d.memberId === params.playerMemberId);
  const existingPending = occurrence.registrations.find(
    (r) => r.memberId === params.playerMemberId && r.status === 'PENDING',
  );
  if (isDesignee && existingPending) {
    return acceptDesignatedSeat({
      classId: cls.id,
      actorMemberId: params.playerMemberId,
      initiatedBy: params.initiatedBy,
    });
  }
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
  const acceptedCoaches = cls.coaches.filter((c) => c.inviteStatus === 'ACCEPTED');
  for (const coach of acceptedCoaches) {
    await assertCoachAndPlayerFree({
      coachProfileId: coach.coachProfileId,
      playerMemberId: player.id,
      clubDate: occurrence.clubDate,
      startTime: occurrence.startTime,
      endTime: occurrence.endTime,
    });
  }

  const holding = occurrence.registrations.filter((r) => countsTowardCapacity(r.status));
  const waitlisted = occurrence.registrations.filter((r) => r.status === 'WAITING');
  const existing = occurrence.registrations.find((r) => r.memberId === player.id);
  if (existing && existing.status !== 'DROPPED') {
    throw new Error('Already on this class');
  }

  const full = holding.length >= cls.maxParticipants;
  if (full && !params.waitlistIfFull) throw new Error('Class is full');
  const status = full ? 'WAITING' : 'ACCEPTED';
  const data = {
    occurrenceId: occurrence.id,
    memberId: player.id,
    status: status as 'WAITING' | 'ACCEPTED',
    waitlistPosition: full ? waitlisted.length + 1 : null,
    priceCents: cls.pricePerOccurrenceCents,
  };
  const row = existing
    ? await prisma.groupClassRegistration.update({ where: { id: existing.id }, data })
    : await prisma.groupClassRegistration.create({ data });

  let checkout = null;
  if (status === 'ACCEPTED') {
    checkout = await checkoutRegistration({
      registrationId: row.id,
      memberId: player.id,
      amountCents: cls.pricePerOccurrenceCents,
      title: cls.title,
      clubDate: occurrence.clubDate,
      startTime: occurrence.startTime,
      occurrenceId: occurrence.id,
      initiatedBy: params.initiatedBy,
    });
  }

  await recordLessonLifecycle({
    action: status === 'WAITING' ? 'WAITLIST' : params.bypassEligibility ? 'PLACE' : 'REGISTER',
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
    waitlisted: status === 'WAITING',
  });
  await notifyLessonCalendar({
    coachProfileIds: acceptedCoaches.map((c) => c.coachProfileId),
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
  const wasHolding = countsTowardCapacity(row.status);
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
  if (wasHolding && hoursLeft >= occ.groupClass.occurrenceDeadlineHours) {
    await promoteWaitlist(occ.id, params.actorMemberId);
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
        where: { status: 'WAITING' },
        include: { member: true },
        orderBy: [{ waitlistPosition: 'asc' }, { id: 'asc' }],
      },
    },
  });
  if (!occurrence?.registrations[0]) return;
  const holding = await prisma.groupClassRegistration.count({
    where: { occurrenceId, status: { in: [...GROUP_CAPACITY_STATUSES] } },
  });
  if (holding >= occurrence.groupClass.maxParticipants) return;
  const next = occurrence.registrations[0];
  if (groupEligibilityError(occurrence.groupClass, next.member, occurrence.clubDate, false)) return;
  await prisma.groupClassRegistration.update({
    where: { id: next.id },
    data: { status: 'ACCEPTED', waitlistPosition: null },
  });
  await checkoutRegistration({
    registrationId: next.id,
    memberId: next.memberId,
    amountCents: occurrence.groupClass.pricePerOccurrenceCents,
    title: occurrence.groupClass.title,
    clubDate: occurrence.clubDate,
    startTime: occurrence.startTime,
    occurrenceId: occurrence.id,
    initiatedBy: 'ADMIN',
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
  actorMemberId: number | null;
  isAdmin: boolean;
  actorCoachProfileId: number | null;
  actorType?: LessonLifecycleActorType;
  action?: 'CANCEL' | 'CLASS_AUTO_CANCEL';
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
  const system = params.actorType === 'SYSTEM';
  if (!params.isAdmin && !isCreator && !system) {
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
    action: params.action || 'CANCEL',
    actorType: params.actorType || (params.isAdmin ? 'ADMIN' : 'COACH'),
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
    where: { coaches: { some: { coachProfileId, inviteStatus: 'ACCEPTED' } } },
    include: classInclude,
    orderBy: { id: 'desc' },
  });
}

export async function listPlayerGroupRegistrations(memberId: number) {
  return prisma.groupClassRegistration.findMany({
    where: {
      memberId,
      status: { in: [...GROUP_OPEN_REG_STATUSES] },
      occurrence: { cancelled: false },
    },
    include: {
      occurrence: {
        include: { groupClass: { select: { id: true, title: true, publicCode: true, status: true } } },
      },
    },
    orderBy: [{ id: 'asc' }],
  });
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

export async function expireDesignatedHolds(): Promise<{ expiredPlayers: number; dropped: number }> {
  const days = getLessonsConfig().designatedAcceptDaysBeforeFirst;
  const today = getClubDate();
  const classes = await prisma.groupClass.findMany({
    include: {
      designees: { include: { member: { select: { email: true, firstName: true } } } },
      occurrences: { where: { cancelled: false }, orderBy: { clubDate: 'asc' }, take: 1 },
    },
  });
  let expiredPlayers = 0;
  let dropped = 0;
  for (const cls of classes) {
    const first = cls.occurrences[0]?.clubDate;
    if (!first || !designatedHoldExpired(first, days, today)) continue;
    const pending = await prisma.groupClassRegistration.findMany({
      where: {
        status: 'PENDING',
        memberId: { in: cls.designees.map((d) => d.memberId) },
        occurrence: { classId: cls.id, cancelled: false },
      },
      select: { id: true, memberId: true, occurrenceId: true },
    });
    if (!pending.length) continue;
    const memberIds = [...new Set(pending.map((r) => r.memberId))];
    await prisma.groupClassRegistration.updateMany({
      where: { id: { in: pending.map((r) => r.id) } },
      data: { status: 'DROPPED', waitlistPosition: null },
    });
    dropped += pending.length;
    expiredPlayers += memberIds.length;
    const occIds = [...new Set(pending.map((r) => r.occurrenceId))];
    for (const occId of occIds) {
      await promoteWaitlist(occId, 0);
    }
    for (const memberId of memberIds) {
      const designee = cls.designees.find((d) => d.memberId === memberId);
      await sendGroupDesignatedExpiredEmail({
        toEmail: designee?.member.email ?? null,
        firstName: designee?.member.firstName || 'Player',
        title: cls.title,
      });
      await recordLessonLifecycle({
        action: 'DESIGNATED_EXPIRE',
        actorType: 'SYSTEM',
        entityType: 'group_class',
        entityId: cls.id,
        details: { memberId },
      });
    }
  }
  return { expiredPlayers, dropped };
}

export async function autoCancelBelowMinOccurrences(): Promise<{ cancelled: number }> {
  const occs = await prisma.groupClassOccurrence.findMany({
    where: { cancelled: false },
    include: { groupClass: true, registrations: { select: { status: true } } },
  });
  let cancelled = 0;
  for (const occ of occs) {
    if (occurrenceEnded(occ.clubDate, occ.endTime)) continue;
    const hoursLeft = hoursUntil(occ.clubDate, occ.startTime);
    if (!belowMinCancelDue(hoursLeft, occ.groupClass.occurrenceDeadlineHours)) continue;
    const accepted = occ.registrations.filter((r) => r.status === 'ACCEPTED').length;
    if (accepted >= occ.groupClass.minParticipants) continue;
    await cancelGroupOccurrence({
      occurrenceId: occ.id,
      actorMemberId: null,
      isAdmin: true,
      actorCoachProfileId: null,
      actorType: 'SYSTEM',
      action: 'CLASS_AUTO_CANCEL',
    });
    cancelled += 1;
  }
  return { cancelled };
}
