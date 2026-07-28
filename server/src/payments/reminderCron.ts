import { prisma } from '../index';
import { getPaymentsConfig } from '../services/systemConfigService';
import { sendMail } from '../services/mailService';
import { logger } from '../utils/logger';

/**
 * Email members whose period plan is near expiry or visit pack is low.
 */
export async function sendPreemptivePaymentReminders(): Promise<{
  considered: number;
  emailed: number;
}> {
  const cfg = getPaymentsConfig();
  if (!cfg.reminders.emailEnabled) {
    return { considered: 0, emailed: 0 };
  }

  const entitlements = await prisma.clubEntitlement.findMany({
    where: { active: true },
    include: {
      member: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
  });

  let emailed = 0;
  const now = Date.now();

  for (const ent of entitlements) {
    const email = ent.member.email?.trim();
    if (!email) continue;

    let shouldRemind = false;
    let body = '';

    if (ent.type === 'VISIT_PACK' && ent.visitsRemaining != null) {
      if (ent.visitsRemaining <= cfg.reminders.visitPackVisitsRemaining) {
        shouldRemind = true;
        body = `You have ${ent.visitsRemaining} visit(s) remaining on your club plan. Please renew soon.`;
      }
    } else if (ent.validTo) {
      const daysLeft = Math.ceil((ent.validTo.getTime() - now) / (1000 * 60 * 60 * 24));
      if (daysLeft <= cfg.reminders.periodDaysBeforeExpiry) {
        shouldRemind = true;
        body = `Your club plan expires in ${daysLeft} day(s). Please renew soon.`;
      }
    }

    if (!shouldRemind) continue;

    try {
      await sendMail({
        to: email,
        subject: 'Club plan reminder',
        text: `Hi ${ent.member.firstName},\n\n${body}`,
        html: `<p>Hi ${ent.member.firstName},</p><p>${body}</p>`,
      });
      emailed += 1;
    } catch (err) {
      logger.warn('Preemptive reminder email failed', {
        memberId: ent.memberId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { considered: entitlements.length, emailed };
}
