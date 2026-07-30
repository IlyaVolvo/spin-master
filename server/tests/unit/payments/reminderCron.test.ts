/**
 * Payment — preemptive reminder emails
 */
jest.mock('../../../src/index', () => ({
  prisma: {
    clubEntitlement: { findMany: jest.fn() },
  },
}));

jest.mock('../../../src/services/systemConfigService', () => ({
  getPaymentsConfig: jest.fn(),
}));

jest.mock('../../../src/services/mailService', () => ({
  sendMail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { prisma } from '../../../src/index';
import { getPaymentsConfig } from '../../../src/services/systemConfigService';
import { sendMail } from '../../../src/services/mailService';
import { sendPreemptivePaymentReminders } from '../../../src/payments/reminderCron';

describe('sendPreemptivePaymentReminders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getPaymentsConfig as jest.Mock).mockReturnValue({
      reminders: {
        emailEnabled: true,
        periodDaysBeforeExpiry: 3,
        visitPackVisitsRemaining: 2,
      },
    });
  });

  it('no-ops when email reminders disabled', async () => {
    (getPaymentsConfig as jest.Mock).mockReturnValue({
      reminders: { emailEnabled: false },
    });
    await expect(sendPreemptivePaymentReminders()).resolves.toEqual({
      considered: 0,
      emailed: 0,
    });
    expect(prisma.clubEntitlement.findMany).not.toHaveBeenCalled();
  });

  it('emails visit-pack and period members under thresholds', async () => {
    (prisma.clubEntitlement.findMany as jest.Mock).mockResolvedValue([
      {
        memberId: 1,
        type: 'VISIT_PACK',
        visitsRemaining: 1,
        validTo: null,
        member: { id: 1, email: 'v@ex.com', firstName: 'Visit', lastName: 'Pack' },
      },
      {
        memberId: 2,
        type: 'MONTHLY',
        visitsRemaining: null,
        validTo: new Date(Date.now() + 2 * 86400000),
        member: { id: 2, email: 't@ex.com', firstName: 'Time', lastName: 'Plan' },
      },
      {
        memberId: 3,
        type: 'MONTHLY',
        visitsRemaining: null,
        validTo: new Date(Date.now() + 20 * 86400000),
        member: { id: 3, email: 'ok@ex.com', firstName: 'Ok', lastName: 'Far' },
      },
      {
        memberId: 4,
        type: 'VISIT_PACK',
        visitsRemaining: 1,
        validTo: null,
        member: { id: 4, email: null, firstName: 'No', lastName: 'Mail' },
      },
    ]);

    const result = await sendPreemptivePaymentReminders();
    expect(result.considered).toBe(4);
    expect(result.emailed).toBe(2);
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect((sendMail as jest.Mock).mock.calls[0][0].text).toMatch(/visit\(s\) remaining/);
    expect((sendMail as jest.Mock).mock.calls[1][0].text).toMatch(/expires in/);
  });
});
