jest.mock('../../../src/index', () => ({
  prisma: {
    hostShift: { findMany: jest.fn(), update: jest.fn() },
    clubVisit: { findMany: jest.fn() },
    member: { findMany: jest.fn() },
  },
}));

jest.mock('../../../src/services/systemConfigService', () => ({
  getPaymentsConfig: jest.fn(),
  getSystemConfig: jest.fn(() => ({ branding: { clubName: 'Test Club' } })),
}));

jest.mock('../../../src/services/mailService', () => ({
  sendMail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/utils/clubDate', () => ({
  getClubDate: jest.fn(() => '2026-08-25'),
  addDaysToYmd: jest.fn((ymd: string, delta: number) => {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + delta));
    return dt.toISOString().slice(0, 10);
  }),
  clubLocalDateTimeUtc: jest.fn((ymd: string, hm: string) => new Date(`${ymd}T${hm}:00.000Z`)),
}));

jest.mock('../../../src/payments/hostNoShowNotifyAdmins', () => ({
  resolveHostNoShowNotifyEmails: jest.fn(),
}));

import { prisma } from '../../../src/index';
import { getPaymentsConfig } from '../../../src/services/systemConfigService';
import { sendMail } from '../../../src/services/mailService';
import { resolveHostNoShowNotifyEmails } from '../../../src/payments/hostNoShowNotifyAdmins';
import { processHostEmails } from '../../../src/payments/hostEmails';

const hostMember = {
  id: 318,
  email: 'polly@example.com',
  firstName: 'Polly',
  lastName: 'Wordlot',
};

function assignedShift(overrides: Record<string, unknown> = {}) {
  return {
    id: 4,
    clubDate: '2026-08-25',
    startTime: '18:00',
    endTime: '21:00',
    memberId: 318,
    claimedAt: null,
    reminderEmailedAt: null,
    noShowEmailedAt: null,
    member: hostMember,
    template: { label: null },
    ...overrides,
  };
}

describe('processHostEmails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getPaymentsConfig as jest.Mock).mockReturnValue({
      hostReminderEmailEnabled: true,
      hostReminderMinutesBeforeStart: 60,
      hostNoShowMinutesAfterStart: 15,
      hostNoShowNotifyAdminIds: [1, 2],
    });
    (resolveHostNoShowNotifyEmails as jest.Mock).mockResolvedValue([
      'admin@example.com',
      'other-admin@example.com',
    ]);
    (prisma.hostShift.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.clubVisit.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.hostShift.update as jest.Mock).mockResolvedValue({});
  });

  it('no-ops when both host emails are disabled', async () => {
    (getPaymentsConfig as jest.Mock).mockReturnValue({
      hostReminderEmailEnabled: false,
      hostNoShowEmailEnabled: false,
      hostNoShowNotifyAdminIds: [],
    });
    await expect(processHostEmails(new Date('2026-08-25T17:30:00.000Z'))).resolves.toEqual({
      reminderEmailed: 0,
      reminderSkippedNoEmail: 0,
      noShowEmailed: 0,
      noShowSkippedNoAdmins: 0,
    });
    expect(prisma.hostShift.findMany).not.toHaveBeenCalled();
  });

  it('emails the assigned host before slot start', async () => {
    (prisma.hostShift.findMany as jest.Mock).mockResolvedValue([assignedShift()]);
    const result = await processHostEmails(new Date('2026-08-25T17:15:00.000Z'));
    expect(result.reminderEmailed).toBe(1);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect((sendMail as jest.Mock).mock.calls[0][0].to).toBe('polly@example.com');
    expect((sendMail as jest.Mock).mock.calls[0][0].subject).toMatch(/Host reminder/);
    expect(prisma.hostShift.update).toHaveBeenCalledWith({
      where: { id: 4 },
      data: { reminderEmailedAt: new Date('2026-08-25T17:15:00.000Z') },
    });
  });

  it('emails selected Admins when the host has not arrived', async () => {
    (prisma.hostShift.findMany as jest.Mock).mockResolvedValue([assignedShift()]);
    const result = await processHostEmails(new Date('2026-08-25T18:16:00.000Z'));
    expect(result.noShowEmailed).toBe(1);
    expect(resolveHostNoShowNotifyEmails).toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect((sendMail as jest.Mock).mock.calls.map((c) => c[0].to).sort()).toEqual([
      'admin@example.com',
      'other-admin@example.com',
    ]);
    expect((sendMail as jest.Mock).mock.calls[0][0].subject).toMatch(/Host did not arrive/);
  });

  it('skips no-show mail when no Admins are selected', async () => {
    (getPaymentsConfig as jest.Mock).mockReturnValue({
      hostReminderEmailEnabled: false,
      hostNoShowMinutesAfterStart: 15,
      hostNoShowNotifyAdminIds: [],
    });
    (prisma.hostShift.findMany as jest.Mock).mockResolvedValue([assignedShift()]);
    const result = await processHostEmails(new Date('2026-08-25T18:16:00.000Z'));
    expect(result.noShowEmailed).toBe(0);
    expect(result.noShowSkippedNoAdmins).toBe(0);
    expect(sendMail).not.toHaveBeenCalled();
    expect(prisma.hostShift.findMany).not.toHaveBeenCalled();
  });

  it('does not send no-show mail when the host has checked in', async () => {
    (prisma.hostShift.findMany as jest.Mock).mockResolvedValue([assignedShift()]);
    (prisma.clubVisit.findMany as jest.Mock).mockResolvedValue([
      {
        memberId: 318,
        clubDate: '2026-08-25',
        checkInAt: new Date('2026-08-25T18:02:00.000Z'),
        checkOutAt: null,
      },
    ]);
    const result = await processHostEmails(new Date('2026-08-25T18:16:00.000Z'));
    expect(result.noShowEmailed).toBe(0);
    expect(sendMail).not.toHaveBeenCalled();
  });
});
