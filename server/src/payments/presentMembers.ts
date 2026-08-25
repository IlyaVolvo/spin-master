import { prisma } from '../index';
import { getClubDate } from '../utils/clubDate';

export type PresentMemberRow = {
  memberId: number;
  firstName: string;
  lastName: string;
  rating: number | null;
  checkInAt: string;
};

export type PresentMembersSnapshot = {
  clubDate: string;
  presentCount: number;
  members: PresentMemberRow[];
};

/** Currently checked-in members (open visit), newest arrival first. */
export async function loadPresentMembers(): Promise<PresentMembersSnapshot> {
  const clubDate = getClubDate();
  const visits = await prisma.clubVisit.findMany({
    where: {
      rejectedAt: null,
      OR: [{ clubDate }, { checkOutAt: null }],
    },
    select: {
      memberId: true,
      checkInAt: true,
      checkOutAt: true,
      member: { select: { id: true, firstName: true, lastName: true, rating: true } },
    },
    orderBy: { checkInAt: 'desc' },
  });

  const openByMember = new Map<number, PresentMemberRow>();
  for (const visit of visits) {
    if (visit.checkOutAt != null) continue;
    if (openByMember.has(visit.memberId)) continue;
    openByMember.set(visit.memberId, {
      memberId: visit.member.id,
      firstName: visit.member.firstName,
      lastName: visit.member.lastName,
      rating: visit.member.rating ?? null,
      checkInAt: visit.checkInAt.toISOString(),
    });
  }

  const members = Array.from(openByMember.values()).sort((a, b) =>
    a.checkInAt < b.checkInAt ? 1 : a.checkInAt > b.checkInAt ? -1 : 0,
  );

  return { clubDate, presentCount: members.length, members };
}
