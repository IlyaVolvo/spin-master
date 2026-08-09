import Stripe from 'stripe';

export type StripeKeyMode = 'test' | 'live';

export function resolveStripeSecretKey(): { key: string; mode: StripeKeyMode } | null {
  const raw = process.env.STRIPE_SECRET_KEY?.trim();
  if (!raw) return null;
  if (raw.startsWith('sk_test_')) return { key: raw, mode: 'test' };
  if (raw.startsWith('sk_live_')) {
    if (process.env.STRIPE_ALLOW_LIVE !== '1') {
      return null;
    }
    return { key: raw, mode: 'live' };
  }
  return null;
}

export function getStripeWebhookSecret(): string | null {
  const raw = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  return raw || null;
}

let cached: { key: string; client: Stripe } | null = null;

export function getStripeClient(): Stripe | null {
  const resolved = resolveStripeSecretKey();
  if (!resolved) return null;
  if (cached && cached.key === resolved.key) return cached.client;
  const client = new Stripe(resolved.key, {
    apiVersion: '2026-07-29.dahlia',
  });
  cached = { key: resolved.key, client };
  return client;
}

export function getClientBaseUrl(): string {
  return (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
}
