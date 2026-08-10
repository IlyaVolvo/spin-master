/**
 * Credit ledger — addPurchaseCredit + paid-after-cancel idempotency
 */
jest.mock('../../../src/index', () => ({
  prisma: {
    $transaction: jest.fn(),
    member: { update: jest.fn() },
    clubCredit: { create: jest.fn(), findFirst: jest.fn() },
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    auditInfo: jest.fn(),
  },
}));

import { prisma } from '../../../src/index';
import { addPurchaseCredit, creditPaidAfterCancel } from '../../../src/payments/creditLedger';

describe('creditLedger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn) => {
      const tx = {
        member: {
          update: jest.fn().mockResolvedValue({ id: 10, purchaseCreditCents: 2500 }),
        },
        clubCredit: {
          create: jest.fn().mockResolvedValue({ id: 99, memberId: 10, amountCents: 1500 }),
        },
      };
      return fn(tx);
    });
  });

  it('addPurchaseCredit increments balance and creates ledger row', async () => {
    const result = await addPurchaseCredit({
      memberId: 10,
      amountCents: 1500,
      issuerMemberId: 2,
      reason: 'Admin credit',
    });
    expect(result.creditId).toBe(99);
    expect(result.purchaseCreditCents).toBe(2500);
  });

  it('creditPaidAfterCancel is idempotent on externalRef', async () => {
    (prisma.clubCredit.findFirst as jest.Mock).mockResolvedValue({ id: 7 });
    const result = await creditPaidAfterCancel({
      memberId: 10,
      amountCents: 1000,
      externalRef: 'cs_test_1',
      providerId: 'stripe-test',
    });
    expect(result.alreadyProcessed).toBe(true);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creditPaidAfterCancel creates credit when new', async () => {
    (prisma.clubCredit.findFirst as jest.Mock).mockResolvedValue(null);
    const result = await creditPaidAfterCancel({
      memberId: 10,
      amountCents: 1500,
      externalRef: 'cs_test_2',
      providerId: 'stripe-test',
    });
    expect(result.alreadyProcessed).toBe(false);
    expect(result.creditId).toBe(99);
  });
});
