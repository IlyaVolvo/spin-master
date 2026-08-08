import { DummyPaymentProvider } from './providers/dummy/DummyPaymentProvider';
import { CashPaymentProvider } from './providers/cash/CashPaymentProvider';
import { paymentProviderRegistry } from './PaymentProviderRegistry';

let initialized = false;

export function initializePaymentProviders(): void {
  if (initialized) return;
  paymentProviderRegistry.register(new DummyPaymentProvider());
  paymentProviderRegistry.register(new CashPaymentProvider());
  initialized = true;
}

// Register on import so routes/tests always see providers
initializePaymentProviders();

export { paymentProviderRegistry } from './PaymentProviderRegistry';
export {
  getActivePaymentProvider,
  getCashPaymentProvider,
  listAssignableOnlineProviders,
  listPaymentProvidersForAdmin,
} from './getActivePaymentProvider';
export { confirmPayment } from './confirmPayment';
export { reconcilePendingPayments } from './reconcilePending';
