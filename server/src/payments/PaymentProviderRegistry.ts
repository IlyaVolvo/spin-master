import type { PaymentProvider } from './types';

class PaymentProviderRegistry {
  private providers = new Map<string, PaymentProvider>();

  register(provider: PaymentProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): PaymentProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error(`No payment provider registered for id: ${id}`);
    }
    return provider;
  }

  has(id: string): boolean {
    return this.providers.has(id);
  }

  getAll(): PaymentProvider[] {
    return Array.from(this.providers.values());
  }

  /** Providers that can be selected for new payments on this install. */
  getUsableOffered(): PaymentProvider[] {
    return this.getAll().filter((p) => p.isUsable() && p.isOfferedForNewPayments());
  }
}

export const paymentProviderRegistry = new PaymentProviderRegistry();
