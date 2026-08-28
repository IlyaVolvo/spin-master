import { prisma } from '../index';
import { getLessonsConfig } from './systemConfigService';
import { notifyLessonCalendar } from './lessonCalendarEvents';
import {
  BOOKING_FROZEN_MESSAGE,
  EDIT_SESSION_MINUTES_DEFAULT,
  editSessionExpiry,
  isEditSessionActive,
} from './coachCalendarGrid';

export { BOOKING_FROZEN_MESSAGE, isEditSessionActive };

function sessionMinutes(): number {
  return getLessonsConfig().editSessionMinutes || EDIT_SESSION_MINUTES_DEFAULT;
}

export async function startCoachEditSession(memberId: number) {
  const until = editSessionExpiry(new Date(), sessionMinutes());
  const updated = await prisma.coachProfile.update({
    where: { memberId },
    data: { editSessionUntil: until },
  });
  await notifyLessonCalendar({
    coachProfileId: updated.id,
    memberId: updated.memberId,
    reason: 'edit_session',
  });
  return updated;
}

export async function heartbeatCoachEditSession(memberId: number) {
  const profile = await prisma.coachProfile.findUnique({ where: { memberId } });
  if (!profile) throw new Error('Coach not found');
  if (!isEditSessionActive(profile.editSessionUntil)) {
    throw Object.assign(new Error('Edit session is not active'), { status: 409 });
  }
  const until = editSessionExpiry(new Date(), sessionMinutes());
  return prisma.coachProfile.update({
    where: { memberId },
    data: { editSessionUntil: until },
  });
}

export async function endCoachEditSession(memberId: number) {
  const updated = await prisma.coachProfile.update({
    where: { memberId },
    data: { editSessionUntil: null },
  });
  await notifyLessonCalendar({
    coachProfileId: updated.id,
    memberId: updated.memberId,
    reason: 'edit_session',
  });
  return updated;
}

export async function assertCoachBookingNotFrozen(coachProfileId: number): Promise<void> {
  const profile = await prisma.coachProfile.findUnique({
    where: { id: coachProfileId },
    select: { editSessionUntil: true },
  });
  if (isEditSessionActive(profile?.editSessionUntil)) {
    throw new Error(BOOKING_FROZEN_MESSAGE);
  }
}
