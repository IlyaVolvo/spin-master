import { DummyPaymentProvider } from './providers/dummy/DummyPaymentProvider';
import { CashPaymentProvider } from './providers/cash/CashPaymentProvider';
import {
  stripeLivePaymentProvider,
  stripeTestPaymentProvider,
} from './providers/stripe/StripePaymentProvider';
import { paymentProviderRegistry } from './PaymentProviderRegistry';

let initialized = false;

export function initializePaymentProviders(): void {
  if (initialized) return;
  paymentProviderRegistry.register(new DummyPaymentProvider());
  paymentProviderRegistry.register(new CashPaymentProvider());
  paymentProviderRegistry.register(stripeTestPaymentProvider);
  paymentProviderRegistry.register(stripeLivePaymentProvider);
  initialized = true;
}

// Register on import so routes/tests always see providers
initializePaymentProviders();

export { paymentProviderRegistry } from './PaymentProviderRegistry';
export {
  getCashPaymentProvider,
  listAssignableOnlineProviders,
  listPaymentProvidersForAdmin,
  memberCanPayOnline,
  resolveMemberOnlinePaymentProvider,
} from './getActivePaymentProvider';
export type { MemberOnlinePayFields } from './getActivePaymentProvider';
export { confirmPayment } from './confirmPayment';
export { reconcilePendingPayments } from './reconcilePending';
export {
  deliverOnlinePayLink,
  escapeOnlinePaymentToCash,
  classifyMailSendError,
} from './onlinePayLink';
