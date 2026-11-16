import { prisma } from '../index';
import { clubLocalDateTimeUtc, getClubTimezone } from '../utils/clubDate';
import { reminderIsDue } from './coachCalendarGrid';
import { sendIndividualLessonReminderEmail } from './mailService';

export async function processLessonReminders(now: Date = new Date()): Promise<{ sent: number }> {
  const lessons = await prisma.individualLesson.findMany({
    where: {
      status: 'CONFIRMED',
      reminderHours: { gt: 0 },
      reminderSentAt: null,
    },
    include: {
      player: { select: { email: true, firstName: true } },
      coach: { include: { member: { select: { firstName: true, lastName: true } } } },
    },
  });
  let sent = 0;
  const tz = getClubTimezone();
  for (const lesson of lessons) {
    const clubStart = clubLocalDateTimeUtc(lesson.clubDate, lesson.startTime, tz);
    if (
      !reminderIsDue({
        clubStart,
        reminderHours: lesson.reminderHours,
        reminderSentAt: lesson.reminderSentAt,
        now,
      })
    ) {
      continue;
    }
    const coachName = `${lesson.coach.member.firstName} ${lesson.coach.member.lastName}`.trim() || 'your coach';
    await sendIndividualLessonReminderEmail({
      toEmail: lesson.player.email,
      firstName: lesson.player.firstName,
      coachName,
      whenLabel: `${lesson.clubDate} ${lesson.startTime}`,
      hours: lesson.reminderHours,
    });
    await prisma.individualLesson.update({
      where: { id: lesson.id },
      data: { reminderSentAt: now },
    });
    sent += 1;
  }
  return { sent };
}
