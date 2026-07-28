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
  /** When true, provider already invoked confirm (e.g. Test immediate). */
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
}

export type PaymentMetadata = {
  kind?: 'courtesy_obligation' | 'checkout';
  product?: CheckoutProduct;
  familyKey?: string;
  planId?: number;
  planSegment?: string;
  initiatedBy?: PaymentInitiatedBy;
  visitIds?: number[];
};
