/**
 * Payment / check-in — first-of-day entitlement debit / trial / courtesy / PPV
 */
jest.mock('../../../src/index', () => ({
  prisma: {
    clubPayment: { create: jest.fn(), findFirst: jest.fn() },
    clubEntitlement: { update: jest.fn() },
    clubVisit: { create: jest.fn() },
    member: { findUnique: jest.fn() },
  },
}));

jest.mock('../../../src/payments/courtesy', () => ({
  evaluateCourtesy: jest.fn(),
  ensureCourtesyObligation: jest.fn(),
  notifyAdminsOfCourtesy: jest.fn(),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { prisma } from '../../../src/index';
import {
  evaluateCourtesy,
  ensureCourtesyObligation,
  notifyAdminsOfCourtesy,
} from '../../../src/payments/courtesy';
import {
  createTrialVisit,
  resolveFirstVisitOfDay,
} from '../../../src/payments/checkInAccess';

describe('resolveFirstVisitOfDay', () => {
  const clubDate = '2026-07-30';

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.clubPayment.create as jest.Mock).mockResolvedValue({ id: 1 });
    (prisma.clubEntitlement.update as jest.Mock).mockResolvedValue({});
    (prisma.clubVisit.create as jest.Mock).mockResolvedValue({ id: 88 });
    (prisma.member.findUnique as jest.Mock).mockResolvedValue({
      firstName: 'Pat',
      lastName: 'Member',
      email: 'p@ex.com',
    });
    (ensureCourtesyObligation as jest.Mock).mockResolvedValue({});
    (notifyAdminsOfCourtesy as jest.Mock).mockResolvedValue(undefined);
  });

  it('covers MONTHLY with zero-amount ledger', async () => {
    const out = await resolveFirstVisitOfDay({
      memberId: 10,
      clubDate,
      entitlement: { id: 5, type: 'MONTHLY', visitsRemaining: null },
      trialEndsOn: null,
      memberEmail: 'p@ex.com',
    });
    expect(out).toMatchObject({
      kind: 'covered',
      dailyPaymentApplied: true,
      entitlementId: 5,
      paymentPurpose: 'Covered visit (MONTHLY)',
    });
    expect(prisma.clubPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amountCents: 0,
        purpose: 'Covered visit (MONTHLY)',
        status: 'SUCCEEDED',
      }),
    });
  });

  it('defers covered writes when deferWrites is true', async () => {
    const out = await resolveFirstVisitOfDay({
      memberId: 10,
      clubDate,
      entitlement: { id: 5, type: 'MONTHLY', visitsRemaining: null },
      trialEndsOn: null,
      memberEmail: 'p@ex.com',
      deferWrites: true,
    });
    expect(out).toMatchObject({ kind: 'covered', entitlementId: 5 });
    expect(prisma.clubPayment.create).not.toHaveBeenCalled();
    expect(prisma.clubEntitlement.update).not.toHaveBeenCalled();
  });

  it('decrements visit pack and ends when last visit used', async () => {
    const out = await resolveFirstVisitOfDay({
      memberId: 10,
      clubDate,
      entitlement: { id: 7, type: 'VISIT_PACK', visitsRemaining: 1 },
      trialEndsOn: null,
      memberEmail: null,
    });
    expect(out.kind).toBe('covered');
    expect(prisma.clubEntitlement.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { visitsRemaining: 0, status: 'ENDED', active: false },
    });
    expect(prisma.clubPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        purpose: 'Visit pack debit (0 remaining)',
      }),
    });
  });

  it('uses trial when no entitlement and trial still active', async () => {
    const trialEndsOn = new Date(Date.UTC(2026, 6, 31, 12, 0, 0));
    const out = await resolveFirstVisitOfDay({
      memberId: 10,
      clubDate: '2026-07-30',
      entitlement: null,
      trialEndsOn,
      memberEmail: 'p@ex.com',
    });
    expect(out).toEqual({
      kind: 'trial',
      warning: 'Trial access until 2026-07-31.',
      canPay: true,
    });
  });

  it('falls through to courtesy when pack exhausted and not on trial', async () => {
    (evaluateCourtesy as jest.Mock).mockResolvedValue({
      allowed: true,
      basis: 'visit_pack',
      message: 'Courtesy visit 1 of 2.',
    });
    (prisma.clubPayment.findFirst as jest.Mock).mockResolvedValue({
      externalRef: 'cash_1',
    });

    const out = await resolveFirstVisitOfDay({
      memberId: 10,
      clubDate,
      entitlement: { id: 7, type: 'VISIT_PACK', visitsRemaining: 0 },
      trialEndsOn: null,
      memberEmail: null,
    });

    expect(out).toMatchObject({
      kind: 'courtesy',
      visitId: 88,
      warning: 'Courtesy visit 1 of 2.',
      paymentInProgress: true,
    });
    expect(ensureCourtesyObligation).toHaveBeenCalledWith(10, 88);
    expect(notifyAdminsOfCourtesy).toHaveBeenCalled();
  });

  it('returns payment_required when courtesy denied', async () => {
    (evaluateCourtesy as jest.Mock).mockResolvedValue({
      allowed: false,
      reason: 'grace_exhausted',
      message: 'Courtesy visit limit reached.',
    });

    const out = await resolveFirstVisitOfDay({
      memberId: 10,
      clubDate,
      entitlement: null,
      trialEndsOn: null,
      memberEmail: 'p@ex.com',
    });

    expect(out).toEqual({
      kind: 'payment_required',
      warning: 'Courtesy visit limit reached.',
      canPay: true,
    });
  });

  it('requires per-visit payment for PPV without today payment', async () => {
    (prisma.clubPayment.findFirst as jest.Mock).mockResolvedValue(null);
    const out = await resolveFirstVisitOfDay({
      memberId: 10,
      clubDate,
      entitlement: { id: 9, type: 'PAY_PER_VISIT_EXTERNAL', visitsRemaining: null },
      trialEndsOn: null,
      memberEmail: 'p@ex.com',
    });
    expect(out).toEqual({
      kind: 'payment_required',
      warning: 'Per-visit payment required. Please pay at the front desk or start checkout.',
      canPay: true,
    });
  });

  it('covers PPV when today per-visit payment exists', async () => {
    (prisma.clubPayment.findFirst as jest.Mock).mockResolvedValue({ id: 44 });
    const out = await resolveFirstVisitOfDay({
      memberId: 10,
      clubDate,
      entitlement: { id: 9, type: 'PAY_PER_VISIT_EXTERNAL', visitsRemaining: null },
      trialEndsOn: null,
      memberEmail: null,
    });
    expect(out).toMatchObject({
      kind: 'covered',
      dailyPaymentApplied: true,
      entitlementId: 9,
      paymentPurpose: null,
    });
  });

  it('createTrialVisit writes a free non-courtesy visit', async () => {
    await createTrialVisit(10, clubDate);
    expect(prisma.clubVisit.create).toHaveBeenCalledWith({
      data: {
        memberId: 10,
        clubDate,
        dailyPaymentApplied: false,
        isCourtesy: false,
      },
    });
  });
});
