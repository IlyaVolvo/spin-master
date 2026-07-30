import type { Request } from 'express';

export type PaymentInitiatedBy = 'MEMBER' | 'ADMIN';

export type CheckoutProduct =
  | { kind: 'plan'; familyKey: string; planId: number; planSegment: string }
  | { kind: 'pay_per_visit'; amountCents: number; clubDate: string };

export type StartCheckoutInput = {
  memberId: number;
  memberEmail: string | null;
  memberName: string;
  amountCents: number;
  currency: string;
  purpose: string;
  product: CheckoutProduct;
  initiatedBy: PaymentInitiatedBy;
  /** Existing PENDING obligation payment id, if any */
  paymentId: number;
  externalRef?: string;
};

export type StartCheckoutResult = {
  paymentId: number;
  externalRef: string;
  checkoutUrl?: string;
  instructions?: string;
  /** When true, provider already invoked confirm (legacy / immediate providers). */
  confirmedImmediately?: boolean;
};

export type ConfirmEvent = {
  providerId: string;
  externalRef: string;
  status: 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  amountCents?: number;
  raw?: unknown;
};

export type PaymentProviderInfo = {
  id: string;
  displayName: string;
};

export type PaymentProviderSettingField = {
  key: string;
  label: string;
  type: 'number' | 'string' | 'boolean';
  min?: number;
  hint?: string;
};

/**
 * Pluggable payment provider. Club routes call only this interface.
 * Retired providers remain registered so pending/history can reconcile.
 */
export interface PaymentProvider {
  readonly id: string;
  readonly displayName: string;
  /** Whether this install can start new checkouts with this provider. */
  isUsable(): boolean;
  /** Whether new checkouts may select this provider (soft-retire). */
  isOfferedForNewPayments(): boolean;
  startCheckout(input: StartCheckoutInput): Promise<StartCheckoutResult>;
  parseWebhook(req: Request): Promise<ConfirmEvent | null>;
  reconcilePending(payment: {
    id: number;
    externalRef: string | null;
    metadata: unknown;
  }): Promise<ConfirmEvent | null>;
  /** Optional admin settings form fields for this provider. */
  getSettingsSchema?(): PaymentProviderSettingField[];
  getDefaultSettings?(): Record<string, unknown>;
  validateSettings?(value: unknown): Record<string, unknown>;
}

export type PaymentMetadata = {
  kind?: 'courtesy_obligation' | 'checkout' | 'auto_renew';
  product?: CheckoutProduct;
  familyKey?: string;
  planId?: number;
  planSegment?: string;
  initiatedBy?: PaymentInitiatedBy;
  visitIds?: number[];
  autoRenew?: boolean;
  creditAppliedCents?: number;
  listAmountCents?: number;
  /** YYYY-MM-DD start for a new TIME CURRENT plan (or FUTURE when forced) */
  startDate?: string;
  /** When true, grant as FUTURE even with no CURRENT (e.g. trial purchase). */
  forceFuture?: boolean;
  /** Checkout method used to start this payment. */
  paymentMethod?: 'cash' | 'online';
};
