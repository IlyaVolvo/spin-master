/**
 * Payment feature — purchase eligibility rules
 */
import {
  describePurchaseBlockReason,
  planAllowsMemberPurchase,
} from '../../../src/payments/planPurchaseRules';

describe('planPurchaseRules', () => {
  describe('planAllowsMemberPurchase', () => {
    it('allows purchase with no current, future, pending, or auto-renew', () => {
      expect(
        planAllowsMemberPurchase({
          hasCurrent: false,
          hasFuture: false,
          autoRenewEnabled: false,
        }),
      ).toBe(true);
    });

    it('allows purchase when current exists without auto-renew', () => {
      expect(
        planAllowsMemberPurchase({
          hasCurrent: true,
          hasFuture: false,
          autoRenewEnabled: false,
        }),
      ).toBe(true);
    });

    it('blocks when a future plan is queued', () => {
      expect(
        planAllowsMemberPurchase({
          hasCurrent: true,
          hasFuture: true,
          autoRenewEnabled: false,
        }),
      ).toBe(false);
    });

    it('blocks when a payment is already pending', () => {
      expect(
        planAllowsMemberPurchase({
          hasCurrent: false,
          hasFuture: false,
          autoRenewEnabled: false,
          hasPendingPayment: true,
        }),
      ).toBe(false);
    });

    it('blocks when current plan has auto-renew enabled', () => {
      expect(
        planAllowsMemberPurchase({
          hasCurrent: true,
          hasFuture: false,
          autoRenewEnabled: true,
        }),
      ).toBe(false);
    });

    it('allows auto-renew flag when there is no current plan', () => {
      expect(
        planAllowsMemberPurchase({
          hasCurrent: false,
          hasFuture: false,
          autoRenewEnabled: true,
        }),
      ).toBe(true);
    });
  });

  describe('describePurchaseBlockReason', () => {
    it('returns null when purchase is allowed', () => {
      expect(
        describePurchaseBlockReason({
          hasCurrent: false,
          hasFuture: false,
          autoRenewEnabled: false,
        }),
      ).toBeNull();
    });

    it('prioritizes pending payment over future queue', () => {
      expect(
        describePurchaseBlockReason({
          hasCurrent: true,
          hasFuture: true,
          autoRenewEnabled: true,
          hasPendingPayment: true,
        }),
      ).toBe('A payment is already in progress.');
    });

    it('describes future queue block', () => {
      expect(
        describePurchaseBlockReason({
          hasCurrent: true,
          hasFuture: true,
          autoRenewEnabled: false,
        }),
      ).toBe('A next plan is already queued.');
    });

    it('describes auto-renew block', () => {
      expect(
        describePurchaseBlockReason({
          hasCurrent: true,
          hasFuture: false,
          autoRenewEnabled: true,
        }),
      ).toBe('Auto-renew is on — the next period renews automatically.');
    });
  });
});
