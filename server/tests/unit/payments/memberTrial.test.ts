/**
 * Payment feature — trial date helpers and expiry notification
 */
jest.mock('../../../src/index', () => ({
  prisma: {
    member: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../../../src/services/mailService', () => ({
  sendMail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { prisma } from '../../../src/index';
import { sendMail } from '../../../src/services/mailService';
import {
  addDaysToYmd,
  isMemberInTrialPeriod,
  notifyCompletedTrials,
  parseTrialEndsOnInput,
  trialEndsOnToYmd,
  trialPlanStartYmd,
} from '../../../src/payments/memberTrial';

describe('memberTrial', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('trialEndsOnToYmd', () => {
    it('returns null for missing values', () => {
      expect(trialEndsOnToYmd(null)).toBeNull();
      expect(trialEndsOnToYmd(undefined)).toBeNull();
    });

    it('formats UTC noon dates as YYYY-MM-DD', () => {
      expect(trialEndsOnToYmd(new Date(Date.UTC(2026, 7, 8, 12, 0, 0)))).toBe('2026-08-08');
    });
  });

  describe('parseTrialEndsOnInput', () => {
    it('clears on null / empty', () => {
      expect(parseTrialEndsOnInput(null)).toBeNull();
      expect(parseTrialEndsOnInput('')).toBeNull();
      expect(parseTrialEndsOnInput(undefined)).toBeNull();
    });

    it('parses YYYY-MM-DD to UTC noon', () => {
      const d = parseTrialEndsOnInput('2026-08-08');
      expect(d?.toISOString()).toBe('2026-08-08T12:00:00.000Z');
    });

    it('rejects invalid shapes', () => {
      expect(() => parseTrialEndsOnInput('08/08/2026')).toThrow(/trialEndsOn/);
      expect(() => parseTrialEndsOnInput(123)).toThrow(/trialEndsOn/);
    });
  });

  describe('isMemberInTrialPeriod', () => {
    const end = new Date(Date.UTC(2026, 7, 8, 12, 0, 0));

    it('is inclusive of the trial end day', () => {
      expect(isMemberInTrialPeriod(end, '2026-08-08')).toBe(true);
      expect(isMemberInTrialPeriod(end, '2026-08-07')).toBe(true);
    });

    it('is false after the trial end day', () => {
      expect(isMemberInTrialPeriod(end, '2026-08-09')).toBe(false);
    });

    it('is false with no trial end', () => {
      expect(isMemberInTrialPeriod(null, '2026-08-08')).toBe(false);
    });
  });

  describe('addDaysToYmd / trialPlanStartYmd', () => {
    it('adds calendar days across month boundaries', () => {
      expect(addDaysToYmd('2026-01-31', 1)).toBe('2026-02-01');
      expect(addDaysToYmd('2026-12-31', 1)).toBe('2027-01-01');
    });

    it('returns day after inclusive trial end', () => {
      expect(trialPlanStartYmd(new Date(Date.UTC(2026, 7, 8, 12, 0, 0)))).toBe('2026-08-09');
      expect(trialPlanStartYmd(null)).toBeNull();
    });
  });

  describe('notifyCompletedTrials', () => {
    it('emails and marks members whose trial ended before club date', async () => {
      (prisma.member.findMany as jest.Mock).mockResolvedValue([
        {
          id: 1,
          email: 'a@ex.com',
          firstName: 'Ada',
          lastName: 'Lovelace',
          trialEndsOn: new Date(Date.UTC(2026, 7, 1, 12, 0, 0)),
        },
        {
          id: 2,
          email: 'b@ex.com',
          firstName: 'Still',
          lastName: 'Trial',
          trialEndsOn: new Date(Date.UTC(2026, 7, 10, 12, 0, 0)),
        },
        {
          id: 3,
          email: null,
          firstName: 'No',
          lastName: 'Email',
          trialEndsOn: new Date(Date.UTC(2026, 6, 1, 12, 0, 0)),
        },
      ]);
      (prisma.member.update as jest.Mock).mockResolvedValue({});

      const result = await notifyCompletedTrials('2026-08-05');

      expect(result.considered).toBe(3);
      expect(result.emailed).toBe(1);
      expect(result.marked).toBe(2);
      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(prisma.member.update).toHaveBeenCalledTimes(2);
    });

    it('still marks when email send fails', async () => {
      (prisma.member.findMany as jest.Mock).mockResolvedValue([
        {
          id: 9,
          email: 'fail@ex.com',
          firstName: 'Fail',
          lastName: 'Mail',
          trialEndsOn: new Date(Date.UTC(2026, 6, 1, 12, 0, 0)),
        },
      ]);
      (sendMail as jest.Mock).mockRejectedValueOnce(new Error('smtp down'));
      (prisma.member.update as jest.Mock).mockResolvedValue({});

      const result = await notifyCompletedTrials('2026-08-05');
      expect(result.emailed).toBe(0);
      expect(result.marked).toBe(1);
    });
  });
});
