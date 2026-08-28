import { prisma } from '../index';
import { emitLessonCalendarUpdated } from './socketService';

export async function notifyLessonCalendar(opts: {
  coachProfileId?: number;
  coachProfileIds?: number[];
  memberId?: number | null;
  reason: string;
  clubDate?: string | null;
}) {
  const ids = [
    ...new Set(
      [opts.coachProfileId, ...(opts.coachProfileIds || [])].filter(
        (id): id is number => Number.isInteger(id) && (id as number) > 0,
      ),
    ),
  ];
  if (!ids.length) return;
  if (ids.length === 1 && opts.memberId != null) {
    emitLessonCalendarUpdated({
      coachProfileId: ids[0],
      memberId: opts.memberId,
      reason: opts.reason,
      clubDate: opts.clubDate,
    });
    return;
  }
  const rows = await prisma.coachProfile.findMany({
    where: { id: { in: ids } },
    select: { id: true, memberId: true },
  });
  for (const row of rows) {
    emitLessonCalendarUpdated({
      coachProfileId: row.id,
      memberId: row.memberId,
      reason: opts.reason,
      clubDate: opts.clubDate,
    });
  }
}
