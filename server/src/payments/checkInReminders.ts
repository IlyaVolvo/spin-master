import { getPaymentsConfig } from '../services/systemConfigService';

/**
 * Build an expiry warning message if the entitlement is near expiration.
 * Returns null if banners are disabled or no threshold is met.
 */
export function getExpiryWarning(entitlement: {
  type: string;
  validTo: Date | null;
  visitsRemaining: number | null;
}): string | null {
  const reminders = getPaymentsConfig().reminders;
  if (!reminders.checkInBannerEnabled) return null;

  if (entitlement.type === 'VISIT_PACK') {
    if (
      entitlement.visitsRemaining !== null &&
      entitlement.visitsRemaining <= reminders.visitPackVisitsRemaining
    ) {
      return `Only ${entitlement.visitsRemaining} visit(s) remaining on your plan.`;
    }
  } else if (entitlement.validTo) {
    const daysLeft = Math.ceil((entitlement.validTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= reminders.periodDaysBeforeExpiry) {
      return `Your plan expires in ${daysLeft} day(s).`;
    }
  }

  return null;
}
