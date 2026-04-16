import type { ClubVisit } from '@prisma/client';
import { prisma } from '../index';
import { getClubDateString, getPreviousClubDateString } from '../utils/clubTimezone';
import { ensureDailyAccessForCheckIn, getExpiryWarningForMember } from './clubEntitlementService';

export type ScanResult =
  | {
      action: 'CHECK_IN';
      member: { id: number; firstName: string; lastName: string };
      visit: ClubVisit;
      entitlementWarning: Awaited<ReturnType<typeof getExpiryWarningForMember>>;
    }
  | {
      action: 'CHECK_OUT';
      member: { id: number; firstName: string; lastName: string };
      visit: ClubVisit;
    }
  | {
      action: 'PAYMENT_REQUIRED';
      member: { id: number; firstName: string; lastName: string };
      needsPayment: true;
      entitlementWarning: Awaited<ReturnType<typeof getExpiryWarningForMember>>;
    };

export async function processMemberQrScan(qrToken: string): Promise<ScanResult> {
  const trimmed = qrToken.trim();
  if (!trimmed) {
    throw Object.assign(new Error('Missing QR token'), { status: 400 });
  }

  const member = await prisma.member.findFirst({
    where: { qrTokenHash: trimmed },
    select: { id: true, firstName: true, lastName: true, isActive: true },
  });

  if (!member || !member.isActive) {
    throw Object.assign(new Error('Invalid or inactive member'), { status: 404 });
  }

  const now = new Date();
  const clubDate = getClubDateString(now);
  const memberPayload = {
    id: member.id,
    firstName: member.firstName,
    lastName: member.lastName,
  };

  const open = await prisma.clubVisit.findFirst({
    where: {
      memberId: member.id,
      clubDate,
      checkedOutAt: null,
    },
    orderBy: { checkedInAt: 'desc' },
  });

  if (open) {
    const visit = await prisma.clubVisit.update({
      where: { id: open.id },
      data: {
        checkedOutAt: now,
        closedBy: 'SCAN',
      },
    });
    return { action: 'CHECK_OUT', member: memberPayload, visit };
  }

  return prisma.$transaction(async (tx) => {
    const access = await ensureDailyAccessForCheckIn(tx, member.id, clubDate, now);
    const warning = await getExpiryWarningForMember(member.id, now);

    if (!access.ok) {
      return {
        action: 'PAYMENT_REQUIRED' as const,
        member: memberPayload,
        needsPayment: true,
        entitlementWarning: warning,
      };
    }

    const visit = await tx.clubVisit.create({
      data: {
        memberId: member.id,
        clubDate,
        checkedInAt: now,
        dailyPaymentApplied: access.dailyPaymentApplied,
      },
    });

    return {
      action: 'CHECK_IN' as const,
      member: memberPayload,
      visit,
      entitlementWarning: warning,
    };
  });
}

export async function processManualToggleForMember(memberId: number): Promise<ScanResult> {
  const member = await prisma.member.findFirst({
    where: { id: memberId, isActive: true },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!member) {
    throw Object.assign(new Error('Member not found'), { status: 404 });
  }

  const now = new Date();
  const clubDate = getClubDateString(now);
  const memberPayload = {
    id: member.id,
    firstName: member.firstName,
    lastName: member.lastName,
  };

  const open = await prisma.clubVisit.findFirst({
    where: { memberId, clubDate, checkedOutAt: null },
    orderBy: { checkedInAt: 'desc' },
  });

  if (open) {
    const visit = await prisma.clubVisit.update({
      where: { id: open.id },
      data: { checkedOutAt: now, closedBy: 'MANUAL' },
    });
    return { action: 'CHECK_OUT', member: memberPayload, visit };
  }

  return prisma.$transaction(async (tx) => {
    const access = await ensureDailyAccessForCheckIn(tx, member.id, clubDate, now);
    const warning = await getExpiryWarningForMember(member.id, now);

    if (!access.ok) {
      return {
        action: 'PAYMENT_REQUIRED' as const,
        member: memberPayload,
        needsPayment: true,
        entitlementWarning: warning,
      };
    }

    const visit = await tx.clubVisit.create({
      data: {
        memberId: member.id,
        clubDate,
        checkedInAt: now,
        dailyPaymentApplied: access.dailyPaymentApplied,
      },
    });

    return {
      action: 'CHECK_IN' as const,
      member: memberPayload,
      visit,
      entitlementWarning: warning,
    };
  });
}

/**
 * Close all visits still open for a given club calendar date (typically yesterday), end-of-day job.
 */
export async function autoCheckoutForClubDate(clubDate: string): Promise<number> {
  const r = await prisma.clubVisit.updateMany({
    where: { clubDate, checkedOutAt: null },
    data: {
      checkedOutAt: new Date(),
      closedBy: 'AUTO',
    },
  });
  return r.count;
}

export function defaultAutoCheckoutClubDate(now: Date = new Date()): string {
  return getPreviousClubDateString(now);
}
