import { getPaymentsConfig, type PaymentsInstallMode } from '../services/systemConfigService';
import { paymentProviderRegistry } from './PaymentProviderRegistry';
import type { PaymentProvider, PaymentProviderEnvironment } from './types';

function installModeToEnvironment(mode: PaymentsInstallMode): PaymentProviderEnvironment {
  return mode === 'production' ? 'production' : 'testing';
}

export type MemberOnlinePayFields = {
  email?: string | null;
  onlinePayConsent?: boolean | null;
  paymentProviderId?: string | null;
};

/** Online PSPs Admin may assign (usable, offered, match installMode, not cash). */
function getUsableOnlineOfferedMatchingInstall(): PaymentProvider[] {
  const wanted = installModeToEnvironment(getPaymentsConfig().installMode);
  return paymentProviderRegistry
    .getUsableOffered()
    .filter((p) => p.id !== 'cash' && p.environment === wanted);
}

/**
 * Resolve the online PSP for a member from `paymentProviderId`.
 * Requires registered, non-cash, usable, offered, and environment matching installMode.
 */
export function resolveMemberOnlinePaymentProvider(
  member: MemberOnlinePayFields,
): PaymentProvider {
  const id = typeof member.paymentProviderId === 'string' ? member.paymentProviderId.trim() : '';
  if (!id) {
    throw new Error('Online payment requires an assigned payment service');
  }
  if (id === 'cash') {
    throw new Error('Cash cannot be used as an online payment service');
  }
  if (!paymentProviderRegistry.has(id)) {
    throw new Error('Assigned payment service is not registered');
  }
  const provider = paymentProviderRegistry.get(id);
  if (!provider.isUsable() || !provider.isOfferedForNewPayments()) {
    throw new Error('Assigned payment service is not available');
  }
  const wanted = installModeToEnvironment(getPaymentsConfig().installMode);
  if (provider.environment !== wanted) {
    throw new Error('Assigned payment service does not match this install mode');
  }
  return provider;
}

/** True when email, consent, and a valid assignable online provider are all set. */
export function memberCanPayOnline(member: MemberOnlinePayFields): boolean {
  if (!member.email?.trim()) return false;
  if (member.onlinePayConsent !== true) return false;
  try {
    resolveMemberOnlinePaymentProvider(member);
    return true;
  } catch {
    return false;
  }
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
