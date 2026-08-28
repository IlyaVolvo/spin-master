import { prisma } from '../index';
import { notifyLessonCalendar } from './lessonCalendarEvents';

const memberSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  rating: true,
  birthDate: true,
  isActive: true,
  roles: true,
  picture: true,
} as const;

export async function ensureCoachProfile(memberId: number) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true, roles: true, firstName: true, lastName: true, isActive: true },
  });
  if (!member) {
    throw new Error('Member not found');
  }
  if (!member.roles.some((role) => String(role).toUpperCase() === 'COACH')) {
    throw new Error('Member is not a coach');
  }
  const existing = await prisma.coachProfile.findUnique({
    where: { memberId },
    include: { member: { select: memberSelect } },
  });
  if (existing) return existing;
  return prisma.coachProfile.create({
    data: {
      memberId,
      hourlyRateCents: 0,
      bio: '',
      teachingActive: true,
      rateHistory: { create: { hourlyRateCents: 0 } },
    },
    include: { member: { select: memberSelect } },
  });
}

export async function getCoachProfileByMemberId(memberId: number) {
  return prisma.coachProfile.findUnique({
    where: { memberId },
    include: { member: { select: memberSelect } },
  });
}

function parseOptionalRating(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) {
    throw new Error('Student rating bounds must be numbers');
  }
  return n;
}

export async function updateCoachProfile(
  memberId: number,
  patch: {
    hourlyRateCents?: number;
    bio?: string;
    teachingActive?: boolean;
    studentRatingMin?: number | null;
    studentRatingMax?: number | null;
  },
  actorMemberId?: number | null,
) {
  const profile = await ensureCoachProfile(memberId);
  const nextRate =
    patch.hourlyRateCents != null ? Math.max(0, Math.floor(patch.hourlyRateCents)) : undefined;
  const rateChanged = nextRate != null && nextRate !== profile.hourlyRateCents;
  const studentRatingMin =
    'studentRatingMin' in patch ? parseOptionalRating(patch.studentRatingMin) : undefined;
  const studentRatingMax =
    'studentRatingMax' in patch ? parseOptionalRating(patch.studentRatingMax) : undefined;
  const nextMin = studentRatingMin === undefined ? profile.studentRatingMin : studentRatingMin;
  const nextMax = studentRatingMax === undefined ? profile.studentRatingMax : studentRatingMax;
  if (nextMin != null && nextMax != null && nextMin > nextMax) {
    throw new Error('Student rating minimum cannot be above the maximum');
  }
  const updated = await prisma.coachProfile.update({
    where: { id: profile.id },
    data: {
      hourlyRateCents: nextRate,
      bio: patch.bio != null ? String(patch.bio) : undefined,
      teachingActive: patch.teachingActive != null ? Boolean(patch.teachingActive) : undefined,
      studentRatingMin,
      studentRatingMax,
      ...(rateChanged
        ? {
            rateHistory: {
              create: {
                hourlyRateCents: nextRate,
                actorMemberId: actorMemberId ?? null,
              },
            },
          }
        : {}),
    },
    include: { member: { select: memberSelect } },
  });
  await notifyLessonCalendar({
    coachProfileId: updated.id,
    memberId: updated.memberId,
    reason: 'profile',
  });
  return updated;
}

export async function listCoachRateHistory(coachProfileId: number) {
  const rows = await prisma.coachRateHistory.findMany({
    where: { coachProfileId },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (rows.length) return rows;
  const profile = await prisma.coachProfile.findUnique({ where: { id: coachProfileId } });
  if (!profile) return [];
  const seeded = await prisma.coachRateHistory.create({
    data: {
      coachProfileId,
      hourlyRateCents: profile.hourlyRateCents,
      effectiveFrom: profile.createdAt,
    },
  });
  return [seeded];
}

export async function syncCoachProfileForRoles(memberId: number, roles: string[]) {
  const isCoach = roles.some((role) => String(role).toUpperCase() === 'COACH');
  if (isCoach) {
    return ensureCoachProfile(memberId);
  }
  const existing = await prisma.coachProfile.findUnique({ where: { memberId } });
  if (existing) {
    return prisma.coachProfile.update({
      where: { id: existing.id },
      data: { teachingActive: false },
    });
  }
  return null;
}

export async function listTeachingCoaches() {
  return prisma.coachProfile.findMany({
    where: { teachingActive: true },
    include: {
      member: {
        select: { id: true, firstName: true, lastName: true, rating: true, isActive: true, picture: true },
      },
    },
    orderBy: { memberId: 'asc' },
  });
}
