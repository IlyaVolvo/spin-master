import { getPaymentsConfig, type PaymentsInstallMode } from '../services/systemConfigService';
import { paymentProviderRegistry } from './PaymentProviderRegistry';
import type { PaymentProvider, PaymentProviderEnvironment } from './types';

function installModeToEnvironment(mode: PaymentsInstallMode): PaymentProviderEnvironment {
  return mode === 'production' ? 'production' : 'testing';
}

/** Online PSPs only — cash is never auto-selected for online checkout. */
function getUsableOnlineOfferedMatchingInstall(): PaymentProvider[] {
  const wanted = installModeToEnvironment(getPaymentsConfig().installMode);
  return paymentProviderRegistry
    .getUsableOffered()
    .filter((p) => p.id !== 'cash' && p.environment === wanted);
}

/**
 * @deprecated Prefer resolveMemberOnlinePaymentProvider (step 2).
 * Temporary: sole usable online provider matching installMode (dev with only `test`).
 */
export function getActivePaymentProvider(): PaymentProvider {
  const usable = getUsableOnlineOfferedMatchingInstall();
  if (usable.length === 0) {
    throw new Error('No usable online payment provider is available for this install mode');
  }
  if (usable.length === 1) {
    return usable[0];
  }
  throw new Error(
    'Multiple online payment providers match install mode; assign Member.paymentProviderId',
  );
}

/**
 * Providers Admin may assign on a member (usable, offered, match installMode, not cash).
 */
export function listAssignableOnlineProviders(): PaymentProvider[] {
  return getUsableOnlineOfferedMatchingInstall();
}

export function getCashPaymentProvider(): PaymentProvider {
  if (!paymentProviderRegistry.has('cash')) {
    throw new Error('Cash payment provider is not registered');
  }
  return paymentProviderRegistry.get('cash');
}

export function listPaymentProvidersForAdmin(): Array<{
  id: string;
  displayName: string;
  environment: PaymentProviderEnvironment;
  usable: boolean;
  offered: boolean;
  assignableToMembers: boolean;
}> {
  const wanted = installModeToEnvironment(getPaymentsConfig().installMode);
  return paymentProviderRegistry.getAll().map((p) => {
    const usable = p.isUsable();
    const offered = p.isOfferedForNewPayments();
    const assignableToMembers =
      p.id !== 'cash' && usable && offered && p.environment === wanted;
    return {
      id: p.id,
      displayName: p.displayName,
      environment: p.environment,
      usable,
      offered,
      assignableToMembers,
    };
  });
}
