import { getSystemConfig } from '../services/systemConfigService';
import { paymentProviderRegistry } from './PaymentProviderRegistry';
import type { PaymentProvider } from './types';

/**
 * Resolve the active payment provider for new checkouts.
 * If config points at a usable offered provider, use it.
 * If exactly one usable offered provider exists, use that.
 */
export function getActivePaymentProvider(): PaymentProvider {
  const usable = paymentProviderRegistry.getUsableOffered();
  if (usable.length === 0) {
    throw new Error('No usable payment provider is available');
  }

  const configuredId = getSystemConfig().payments.providerId;
  if (configuredId && paymentProviderRegistry.has(configuredId)) {
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
