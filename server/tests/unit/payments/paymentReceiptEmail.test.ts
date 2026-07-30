/**
 * Payment feature — receipt money formatting and mail content
 */
jest.mock('../../../src/services/mailService', () => ({
  sendMail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/index', () => ({
  prisma: {
    clubPlan: {
      findUnique: jest.fn(),
    },
  },
}));

import { sendMail } from '../../../src/services/mailService';
import { prisma } from '../../../src/index';
import {
  formatUsdFromCents,
  resolvePlanLabelForProduct,
  sendPaymentProcessedEmail,
} from '../../../src/payments/paymentReceiptEmail';

describe('paymentReceiptEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('formatUsdFromCents', () => {
    it('formats cents as $xx.yy', () => {
      expect(formatUsdFromCents(0)).toBe('$0.00');
      expect(formatUsdFromCents(5500)).toBe('$55.00');
      expect(formatUsdFromCents(1)).toBe('$0.01');
    });

    it('coerces strings and clamps invalid / negative', () => {
      expect(formatUsdFromCents('2500')).toBe('$25.00');
      expect(formatUsdFromCents(-100)).toBe('$0.00');
      expect(formatUsdFromCents(null)).toBe('$0.00');
      expect(formatUsdFromCents(undefined)).toBe('$0.00');
      expect(formatUsdFromCents(Number.NaN)).toBe('$0.00');
    });
  });

  describe('sendPaymentProcessedEmail', () => {
    it('includes list price, credit applied, and charged amount', async () => {
      await sendPaymentProcessedEmail({
        to: 'm@ex.com',
        memberName: 'Pat Member',
        amountPaidCents: 3000,
        creditAppliedCents: 2500,
        listAmountCents: 5500,
        planLabel: 'Monthly',
        planSegment: 'Regular',
      });

      expect(sendMail).toHaveBeenCalledTimes(1);
      const arg = (sendMail as jest.Mock).mock.calls[0][0];
      expect(arg.to).toBe('m@ex.com');
      expect(arg.subject).toContain('$30.00');
      expect(arg.text).toContain('List price: $55.00');
      expect(arg.text).toContain('Credit applied: $25.00');
      expect(arg.text).toContain('Amount charged this transaction: $30.00');
      expect(arg.text).toContain('Monthly (Regular)');
      expect(arg.html).toContain('Credit applied: $25.00');
    });

    it('derives list price from charged + credit when list omitted', async () => {
      await sendPaymentProcessedEmail({
        to: 'm@ex.com',
        memberName: 'Pat',
        amountPaidCents: 4000,
        creditAppliedCents: 1000,
        planLabel: '10 visits',
      });
      const arg = (sendMail as jest.Mock).mock.calls[0][0];
      expect(arg.text).toContain('List price: $50.00');
    });
  });

  describe('resolvePlanLabelForProduct', () => {
    it('handles missing product and pay-per-visit', async () => {
      await expect(resolvePlanLabelForProduct(undefined)).resolves.toEqual({
        planLabel: 'Club plan',
        planSegment: null,
      });
      await expect(
        resolvePlanLabelForProduct({ kind: 'pay_per_visit', amountCents: 2000, clubDate: '2026-08-01' }),
      ).resolves.toEqual({
        planLabel: 'Pay per visit (2026-08-01)',
        planSegment: null,
      });
    });

    it('loads plan name from DB for plan products', async () => {
      (prisma.clubPlan.findUnique as jest.Mock).mockResolvedValue({
        name: 'Monthly',
        segment: 'Senior',
        familyKey: 'monthly',
      });
      await expect(
        resolvePlanLabelForProduct({
          kind: 'plan',
          familyKey: 'monthly',
          planId: 1,
          planSegment: 'Senior',
        }),
      ).resolves.toEqual({ planLabel: 'Monthly', planSegment: 'Senior' });
    });
  });
});
