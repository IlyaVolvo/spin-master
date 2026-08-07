/**
 * Event payment — checkout, cash clear, unpaid clear, credit/cancel helpers.
 */
jest.mock('../../../src/index', () => ({
  prisma: {
    member: { findUnique: jest.fn(), update: jest.fn() },
    clubPayment: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    tournamentRegistration: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/payments/getActivePaymentProvider', () => ({
  getCashPaymentProvider: jest.fn(),
  getActivePaymentProvider: jest.fn(),
}));

jest.mock('../../../src/payments/confirmPayment', () => ({
  confirmPayment: jest.fn(),
}));

import { prisma } from '../../../src/index';
import { getCashPaymentProvider } from '../../../src/payments/getActivePaymentProvider';
import { confirmPayment } from '../../../src/payments/confirmPayment';
import {
  applyEventPaymentSuccess,
  cancelPendingEventPayment,
  clearEventCashPayment,
  clearEventUnpaid,
  countHeldRegistrations,
  creditSucceededEventPayment,
  eventPurpose,
  expirePendingEventRegistrations,
  runEventCheckout,
} from '../../../src/payments/eventPayment';

const cashProvider = {
  id: 'cash',
  startCheckout: jest.fn(),
};

function member(overrides: Record<string, unknown> = {}) {
  return {
    id: 170,
    email: 'king.adam@gmail.com',
    firstName: 'Adam',
    lastName: 'King',
    segment: 'Regular',
    isActive: true,
    purchaseCreditCents: 0,
    onlinePayConsent: false,
    ...overrides,
  };
}

describe('countHeldRegistrations / eventPurpose', () => {
  it('counts PENDING and REGISTERED only', () => {
    expect(
      countHeldRegistrations([
        { status: 'INVITED' },
        { status: 'PENDING' },
        { status: 'REGISTERED' },
        { status: 'DECLINED' },
      ]),
    ).toBe(2);
  });

  it('builds purpose from tournament name', () => {
    expect(eventPurpose('Club Championship', 35)).toBe('Event registration: Club Championship');
    expect(eventPurpose(null, 35)).toBe('Event registration: Tournament 35');
  });
});

describe('runEventCheckout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCashPaymentProvider as jest.Mock).mockReturnValue(cashProvider);
    cashProvider.startCheckout.mockResolvedValue({
      paymentId: 26,
      externalRef: 'cash_26_x',
      confirmedImmediately: false,
    });
    (prisma.member.findUnique as jest.Mock).mockResolvedValue(member());
    (prisma.tournamentRegistration.findUnique as jest.Mock).mockResolvedValue({
      id: 9,
      eventPaymentId: null,
      memberId: 170,
      tournamentId: 35,
    });
    (prisma.clubPayment.create as jest.Mock).mockImplementation(async ({ data }) => ({
      id: 26,
      ...data,
    }));
    (prisma.tournamentRegistration.update as jest.Mock).mockResolvedValue({});
    (confirmPayment as jest.Mock).mockResolvedValue({ paymentId: 26, alreadyProcessed: false });
  });

  it('rejects inactive members and invalid prices', async () => {
    (prisma.member.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(
      runEventCheckout({
        memberId: 1,
        tournamentId: 35,
        registrationId: 9,
        eventPriceCents: 1000,
        initiatedBy: 'ADMIN',
        method: 'cash',
      }),
    ).rejects.toThrow(/Member not found/);

    (prisma.member.findUnique as jest.Mock).mockResolvedValue(member());
    await expect(
      runEventCheckout({
        memberId: 170,
        tournamentId: 35,
        registrationId: 9,
        eventPriceCents: -1,
        initiatedBy: 'ADMIN',
        method: 'cash',
      }),
    ).rejects.toThrow(/eventPriceCents/);
  });

  it('creates PENDING cash payment and links registration', async () => {
    const result = await runEventCheckout({
      memberId: 170,
      tournamentId: 35,
      registrationId: 9,
      eventPriceCents: 1000,
      tournamentName: 'Club Championship',
      initiatedBy: 'ADMIN',
      method: 'cash',
    });

    expect(result.amountCents).toBe(1000);
    expect(result.paymentId).toBe(26);
    expect(prisma.clubPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amountCents: 1000,
          status: 'PENDING',
          purpose: 'Event registration: Club Championship',
        }),
      }),
    );
    expect(prisma.tournamentRegistration.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { eventPaymentId: 26 },
    });
    expect(confirmPayment).not.toHaveBeenCalled();
  });

  it('applies credit and auto-confirms zero-balance cash checkout', async () => {
    (prisma.member.findUnique as jest.Mock).mockResolvedValue(member({ purchaseCreditCents: 1500 }));

    const result = await runEventCheckout({
      memberId: 170,
      tournamentId: 35,
      registrationId: 9,
      eventPriceCents: 1000,
      tournamentName: 'Club Championship',
      initiatedBy: 'ADMIN',
      method: 'cash',
    });

    expect(result.amountCents).toBe(0);
    expect(result.creditAppliedCents).toBe(1000);
    expect(confirmPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'cash',
        status: 'SUCCEEDED',
        amountCents: 0,
      }),
    );
  });

  it('rejects when linked payment already SUCCEEDED', async () => {
    (prisma.tournamentRegistration.findUnique as jest.Mock).mockResolvedValue({
      id: 9,
      eventPaymentId: 26,
      memberId: 170,
      tournamentId: 35,
    });
    (prisma.clubPayment.findUnique as jest.Mock).mockResolvedValue({
      id: 26,
      status: 'SUCCEEDED',
    });

    await expect(
      runEventCheckout({
        memberId: 170,
        tournamentId: 35,
        registrationId: 9,
        eventPriceCents: 1000,
        initiatedBy: 'ADMIN',
        method: 'cash',
      }),
    ).rejects.toThrow(/already paid/i);
  });

  it('updates existing PENDING payment instead of creating a new one', async () => {
    (prisma.tournamentRegistration.findUnique as jest.Mock).mockResolvedValue({
      id: 9,
      eventPaymentId: 26,
      memberId: 170,
      tournamentId: 35,
    });
    (prisma.clubPayment.findUnique as jest.Mock).mockResolvedValue({
      id: 26,
      status: 'PENDING',
      amountCents: 500,
    });
    (prisma.clubPayment.update as jest.Mock).mockImplementation(async ({ data }) => ({
      id: 26,
      status: 'PENDING',
      ...data,
    }));

    await runEventCheckout({
      memberId: 170,
      tournamentId: 35,
      registrationId: 9,
      eventPriceCents: 2000,
      initiatedBy: 'ADMIN',
      method: 'cash',
    });

    expect(prisma.clubPayment.create).not.toHaveBeenCalled();
    expect(prisma.clubPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 26 },
        data: expect.objectContaining({ amountCents: 2000, listAmountCents: 2000 }),
      }),
    );
  });
});

describe('clearEventCashPayment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (confirmPayment as jest.Mock).mockResolvedValue({ paymentId: 26, alreadyProcessed: false });
  });

  it('is idempotent when payment already SUCCEEDED (zero-balance path)', async () => {
    (prisma.clubPayment.findUnique as jest.Mock).mockResolvedValue({
      id: 26,
      status: 'SUCCEEDED',
      amountCents: 0,
      metadata: { kind: 'event', product: { kind: 'event' } },
    });

    await expect(clearEventCashPayment(26)).resolves.toEqual({ paymentId: 26 });
    expect(confirmPayment).not.toHaveBeenCalled();
  });

  it('confirms PENDING event cash payment', async () => {
    (prisma.clubPayment.findUnique as jest.Mock).mockResolvedValue({
      id: 26,
      status: 'PENDING',
      amountCents: 1000,
      externalRef: null,
      metadata: {
        kind: 'event',
        product: { kind: 'event', tournamentId: 35, registrationId: 9, amountCents: 1000 },
      },
    });
    (prisma.clubPayment.update as jest.Mock).mockResolvedValue({});

    await clearEventCashPayment(26);

    expect(confirmPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'cash',
        status: 'SUCCEEDED',
        amountCents: 1000,
      }),
    );
  });

  it('rejects non-pending non-succeeded statuses', async () => {
    (prisma.clubPayment.findUnique as jest.Mock).mockResolvedValue({
      id: 26,
      status: 'CANCELLED',
      metadata: { kind: 'event' },
    });
    await expect(clearEventCashPayment(26)).rejects.toThrow(/not pending/i);
  });
});

describe('clearEventUnpaid / apply / credit / cancel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.clubPayment.create as jest.Mock).mockImplementation(async ({ data }) => ({
      id: 40,
      ...data,
    }));
    (prisma.tournamentRegistration.update as jest.Mock).mockResolvedValue({});
  });

  it('clearEventUnpaid creates obligation and marks REGISTERED', async () => {
    const out = await clearEventUnpaid({
      registrationId: 9,
      tournamentId: 35,
      memberId: 170,
      eventPriceCents: 1000,
      tournamentName: 'Club Championship',
    });
    expect(out.paymentId).toBe(40);
    expect(prisma.clubPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PENDING',
          metadata: expect.objectContaining({ kind: 'event_obligation' }),
        }),
      }),
    );
    expect(prisma.tournamentRegistration.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: expect.objectContaining({
        status: 'REGISTERED',
        eventPaymentId: 40,
      }),
    });
  });

  it('applyEventPaymentSuccess marks registration REGISTERED', async () => {
    await applyEventPaymentSuccess(26, {
      product: { kind: 'event', tournamentId: 35, registrationId: 9, amountCents: 1000 },
    } as any);
    expect(prisma.tournamentRegistration.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: expect.objectContaining({ status: 'REGISTERED', eventPaymentId: 26 }),
    });
  });

  it('creditSucceededEventPayment refunds list amount to purchase credit and keeps SUCCEEDED payment', async () => {
    (prisma.clubPayment.findUnique as jest.Mock).mockResolvedValue({
      id: 26,
      memberId: 170,
      status: 'SUCCEEDED',
      listAmountCents: 1000,
      amountCents: 0,
      purpose: 'Event registration: Club Championship',
      provider: 'test',
      metadata: {
        kind: 'event',
        product: { kind: 'event', tournamentId: 35, registrationId: 9, amountCents: 1000 },
      },
    });
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) =>
      fn({
        member: { update: prisma.member.update },
        clubPayment: { update: prisma.clubPayment.update, create: prisma.clubPayment.create },
      }),
    );

    const credited = await creditSucceededEventPayment(26);
    expect(credited).toBe(1000);
    expect(prisma.member.update).toHaveBeenCalledWith({
      where: { id: 170 },
      data: { purchaseCreditCents: { increment: 1000 } },
    });
    expect(prisma.clubPayment.update).toHaveBeenCalledWith({
      where: { id: 26 },
      data: expect.objectContaining({
        metadata: expect.objectContaining({ reimbursedAsCreditCents: 1000 }),
      }),
    });
    const updateData = (prisma.clubPayment.update as jest.Mock).mock.calls[0][0].data;
    expect(updateData.status).toBeUndefined();
    expect(prisma.clubPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        memberId: 170,
        amountCents: 1000,
        status: 'CANCELLED',
        purpose: 'Cancelled: Event registration: Club Championship',
      }),
    });
  });

  it('cancelPendingEventPayment deletes PENDING event payments', async () => {
    (prisma.clubPayment.findUnique as jest.Mock).mockResolvedValue({
      id: 26,
      status: 'PENDING',
      metadata: { kind: 'event', product: { kind: 'event' } },
    });
    await cancelPendingEventPayment(26);
    expect(prisma.clubPayment.delete).toHaveBeenCalledWith({ where: { id: 26 } });
    expect(prisma.clubPayment.update).not.toHaveBeenCalled();
  });

  it('expirePendingEventRegistrations declines overdue PENDING and deletes payment', async () => {
    const now = new Date('2026-08-05T12:00:00.000Z');
    (prisma.tournamentRegistration.findMany as jest.Mock).mockResolvedValue([
      { id: 9, eventPaymentId: 26 },
    ]);
    (prisma.clubPayment.findUnique as jest.Mock).mockResolvedValue({
      id: 26,
      status: 'PENDING',
      metadata: { kind: 'event', product: { kind: 'event' } },
    });

    const count = await expirePendingEventRegistrations(now);
    expect(count).toBe(1);
    expect(prisma.clubPayment.delete).toHaveBeenCalledWith({ where: { id: 26 } });
    expect(prisma.tournamentRegistration.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: expect.objectContaining({
        status: 'DECLINED',
        rejectionReason: 'Registration deadline passed without payment',
      }),
    });
  });
});
