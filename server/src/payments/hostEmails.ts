import { prisma } from '../index';
import { addDaysToYmd, clubLocalDateTimeUtc, getClubDate } from '../utils/clubDate';
import { getPaymentsConfig, getSystemConfig } from '../services/systemConfigService';
import { sendMail } from '../services/mailService';
import { logger } from '../utils/logger';
import { slotLabel } from './hostBoard';
import {
  isHostNoShowDue,
  isHostReminderDue,
} from './hostEmailMath';
import { hostHasArrivedForSlot } from './hostArrival';

const HOST_EMAIL_TICK_MS = 60 * 1000;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function memberDisplayName(member: { firstName: string; lastName: string }): string {
  return `${member.firstName} ${member.lastName}`.trim();
}

function clubName(): string {
  return getSystemConfig().branding.clubName?.trim() || 'the club';
}

async function markShiftEmailed(
  shiftId: number,
  data: { reminderEmailedAt?: Date; noShowEmailedAt?: Date },
): Promise<void> {
  try {
    await prisma.hostShift.update({ where: { id: shiftId }, data });
  } catch (err) {
    logger.warn('Failed to mark host email state', {
      shiftId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

type ShiftVisit = {
  memberId: number;
  clubDate: string;
  checkInAt: Date;
  checkOutAt: Date | null;
};

async function listRegisteredAdminEmails(): Promise<string[]> {
  const admins = await prisma.member.findMany({
    where: { isActive: true, roles: { has: 'ADMIN' } },
    select: { email: true },
  });
  const emails = new Set<string>();
  for (const admin of admins) {
    const email = admin.email?.trim();
    if (email && email.includes('@')) emails.add(email);
  }
  return [...emails];
}

export async function processHostEmails(now: Date = new Date()): Promise<{
  reminderEmailed: number;
  reminderSkippedNoEmail: number;
  noShowEmailed: number;
  noShowSkippedNoAdmins: number;
}> {
  const cfg = getPaymentsConfig();
  const reminderOn = cfg.hostReminderEmailEnabled;
  const noShowOn = cfg.hostNoShowEmailEnabled;
  if (!reminderOn && !noShowOn) {
    return {
      reminderEmailed: 0,
      reminderSkippedNoEmail: 0,
      noShowEmailed: 0,
      noShowSkippedNoAdmins: 0,
    };
  }

  const todayYmd = getClubDate(now);
  const dates = [todayYmd, addDaysToYmd(todayYmd, 1)];
  const shifts = await prisma.hostShift.findMany({
    where: { clubDate: { in: dates }, memberId: { not: null } },
    include: {
      member: { select: { id: true, email: true, firstName: true, lastName: true } },
      template: { select: { label: true } },
    },
  });

  const memberIds = [...new Set(shifts.map((s) => s.memberId).filter((id): id is number => id != null))];
  const visits = memberIds.length
    ? await prisma.clubVisit.findMany({
        where: { memberId: { in: memberIds }, clubDate: { in: dates }, rejectedAt: null },
        select: { memberId: true, clubDate: true, checkInAt: true, checkOutAt: true },
      })
    : [];

  const nowMs = now.getTime();
  let reminderEmailed = 0;
  let reminderSkippedNoEmail = 0;
  let noShowEmailed = 0;
  let noShowSkippedNoAdmins = 0;
  let adminEmails: string[] | null = null;

  for (const shift of shifts) {
    try {
    if (!shift.member) continue;
    const startAt = clubLocalDateTimeUtc(shift.clubDate, shift.startTime);
    const startAtMs = startAt.getTime();
    const range = slotLabel(shift.startTime, shift.endTime, shift.template?.label);
    const hostName = memberDisplayName(shift.member);

    if (
      reminderOn &&
      isHostReminderDue({
        nowMs,
        startAtMs,
        minutesBefore: cfg.hostReminderMinutesBeforeStart,
        alreadySent: shift.reminderEmailedAt != null,
      })
    ) {
      const to = shift.member.email?.trim();
      if (!to || !to.includes('@')) {
        await markShiftEmailed(shift.id, { reminderEmailedAt: now });
        reminderSkippedNoEmail += 1;
      } else {
        const subject = `Host reminder: ${range} at ${clubName()}`;
        const text = [
          `Hi ${shift.member.firstName},`,
          '',
          `You are scheduled to host ${range} on ${shift.clubDate}.`,
          `Please arrive by ${shift.startTime}.`,
          '',
          `— ${clubName()}`,
        ].join('\n');
        const html = `
          <p>Hi ${escapeHtml(shift.member.firstName)},</p>
          <p>You are scheduled to host <strong>${escapeHtml(range)}</strong> on ${escapeHtml(shift.clubDate)}.</p>
          <p>Please arrive by <strong>${escapeHtml(shift.startTime)}</strong>.</p>
          <p>— ${escapeHtml(clubName())}</p>
        `;
        try {
          await sendMail({ to, subject, text, html });
          await markShiftEmailed(shift.id, { reminderEmailedAt: now });
          reminderEmailed += 1;
        } catch (err) {
          logger.warn('Host reminder email failed', {
            shiftId: shift.id,
            memberId: shift.member.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    const arrived = hostHasArrivedForSlot(
      { claimedAt: shift.claimedAt, memberId: shift.memberId, clubDate: shift.clubDate, startAtMs },
      visits,
    );
    if (
      noShowOn &&
      shift.clubDate === todayYmd &&
      isHostNoShowDue({
        nowMs,
        startAtMs,
        minutesAfter: cfg.hostNoShowMinutesAfterStart,
        alreadySent: shift.noShowEmailedAt != null,
        arrived,
      })
    ) {
      if (adminEmails == null) adminEmails = await listRegisteredAdminEmails();
      if (adminEmails.length === 0) {
        noShowSkippedNoAdmins += 1;
        continue;
      }
      const subject = `Host did not arrive: ${hostName} (${range})`;
      const text = [
        `${hostName} is assigned to host ${range} on ${shift.clubDate} and has not checked in.`,
        `Slot start: ${shift.startTime}.`,
        '',
        `— ${clubName()}`,
      ].join('\n');
      const html = `
        <p><strong>${escapeHtml(hostName)}</strong> is assigned to host <strong>${escapeHtml(range)}</strong>
        on ${escapeHtml(shift.clubDate)} and has not checked in.</p>
        <p>Slot start: ${escapeHtml(shift.startTime)}.</p>
        <p>— ${escapeHtml(clubName())}</p>
      `;
      let sentAny = false;
      for (const to of adminEmails) {
        try {
          await sendMail({ to, subject, text, html });
          sentAny = true;
        } catch (err) {
          logger.warn('Host no-show email failed', {
            shiftId: shift.id,
            to,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      if (sentAny) {
        await markShiftEmailed(shift.id, { noShowEmailedAt: now });
        noShowEmailed += 1;
      }
    }
    } catch (err) {
      logger.warn('Host email processing failed for shift', {
        shiftId: shift.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { reminderEmailed, reminderSkippedNoEmail, noShowEmailed, noShowSkippedNoAdmins };
}

export function startHostEmailScheduler(): void {
  if (process.env.HOST_EMAIL_SCHEDULER === '0') return;
  const tick = () => {
    void processHostEmails().catch((err) => {
      logger.warn('Host email tick failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  };
  tick();
  setInterval(tick, HOST_EMAIL_TICK_MS);
}
