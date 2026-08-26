import { prisma } from '../index';
import {
  getPaymentsConfig,
  getSystemConfig,
  updateSystemConfig,
} from '../services/systemConfigService';
import { sendMail } from '../services/mailService';
import { logger } from '../utils/logger';

export type HostNoShowNotifyRemovalReason = 'deactivated' | 'deleted' | 'admin_role_removed';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function clubName(): string {
  return getSystemConfig().branding.clubName?.trim() || 'the club';
}

function displayName(member: { firstName: string; lastName: string }): string {
  return `${member.firstName} ${member.lastName}`.trim();
}

function reasonLabel(reason: HostNoShowNotifyRemovalReason): string {
  if (reason === 'deleted') return 'deleted';
  if (reason === 'admin_role_removed') return 'no longer an Admin';
  return 'deactivated';
}

/** Active Admins currently selected for host no-show alerts, with usable emails. */
export async function resolveHostNoShowNotifyEmails(): Promise<string[]> {
  const ids = getPaymentsConfig().hostNoShowNotifyAdminIds ?? [];
  if (ids.length === 0) return [];

  const admins = await prisma.member.findMany({
    where: {
      id: { in: ids },
      isActive: true,
      roles: { has: 'ADMIN' },
    },
    select: { id: true, email: true },
  });

  const emails = new Set<string>();
  for (const admin of admins) {
    const email = admin.email?.trim();
    if (email && email.includes('@')) emails.add(email);
  }
  return [...emails];
}

async function listOtherActiveAdminEmails(excludeMemberId: number): Promise<string[]> {
  const admins = await prisma.member.findMany({
    where: {
      id: { not: excludeMemberId },
      isActive: true,
      roles: { has: 'ADMIN' },
    },
    select: { email: true },
  });
  const emails = new Set<string>();
  for (const admin of admins) {
    const email = admin.email?.trim();
    if (email && email.includes('@')) emails.add(email);
  }
  return [...emails];
}

/**
 * If the member is on the host no-show notify list, remove them and email every
 * other active Admin about the removal.
 */
export async function removeHostNoShowNotifyAdminIfListed(
  member: { id: number; firstName: string; lastName: string },
  reason: HostNoShowNotifyRemovalReason,
): Promise<boolean> {
  const cfg = getPaymentsConfig();
  const ids = cfg.hostNoShowNotifyAdminIds ?? [];
  if (!ids.includes(member.id)) return false;

  const nextIds = ids.filter((id) => id !== member.id);
  await updateSystemConfig({
    payments: {
      hostNoShowNotifyAdminIds: nextIds,
    },
  });

  const name = displayName(member);
  const reasonText = reasonLabel(reason);
  const subject = `Host no-show notify list updated: ${name} removed`;
  const text = [
    `${name} was removed from the host no-show notification list because their account was ${reasonText}.`,
    '',
    `— ${clubName()}`,
  ].join('\n');
  const html = `
    <p><strong>${escapeHtml(name)}</strong> was removed from the host no-show notification list
    because their account was ${escapeHtml(reasonText)}.</p>
    <p>— ${escapeHtml(clubName())}</p>
  `;

  const recipients = await listOtherActiveAdminEmails(member.id);
  for (const to of recipients) {
    try {
      await sendMail({ to, subject, text, html });
    } catch (err) {
      logger.warn('Failed to notify Admin about host no-show list removal', {
        to,
        removedMemberId: member.id,
        reason,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info('Removed Admin from host no-show notify list', {
    memberId: member.id,
    reason,
    remainingCount: nextIds.length,
    notifiedAdmins: recipients.length,
  });

  return true;
}
