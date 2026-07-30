import { getSystemConfig } from '../services/systemConfigService';
import { paymentProviderRegistry } from './PaymentProviderRegistry';
import type { PaymentProvider } from './types';

/** Online PSPs only — cash is never auto-selected for online checkout. */
function getUsableOnlineOffered(): PaymentProvider[] {
  return paymentProviderRegistry
    .getUsableOffered()
    .filter((p) => p.id !== 'cash');
}

/**
 * Resolve the active payment provider for online checkouts.
 * If config points at a usable offered online provider, use it.
 * If exactly one usable offered online provider exists, use that.
 */
export function getActivePaymentProvider(): PaymentProvider {
  const usable = getUsableOnlineOffered();
  if (usable.length === 0) {
    throw new Error('No usable online payment provider is available');
  }

  const configuredId = getSystemConfig().payments.providerId;
  if (configuredId && configuredId !== 'cash' && paymentProviderRegistry.has(configuredId)) {
    const configured = paymentProviderRegistry.get(configuredId);
    if (configured.isUsable() && configured.isOfferedForNewPayments()) {
      return configured;
    }
  }

  if (usable.length === 1) {
    return usable[0];
  }

  throw new Error(
    'Multiple payment providers are available; set SystemConfig.payments.providerId',
  );
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
  usable: boolean;
  offered: boolean;
}> {
  return paymentProviderRegistry.getAll().map((p) => ({
    id: p.id,
    displayName: p.displayName,
    usable: p.isUsable(),
    offered: p.isOfferedForNewPayments(),
  }));
}
