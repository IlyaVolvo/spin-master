jest.mock('../../../src/index', () => ({
  prisma: {
    member: { findMany: jest.fn() },
  },
}));

jest.mock('../../../src/services/systemConfigService', () => ({
  getPaymentsConfig: jest.fn(),
  getSystemConfig: jest.fn(() => ({ branding: { clubName: 'Test Club' } })),
  updateSystemConfig: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../../src/services/mailService', () => ({
  sendMail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { prisma } from '../../../src/index';
import {
  getPaymentsConfig,
  updateSystemConfig,
} from '../../../src/services/systemConfigService';
import { sendMail } from '../../../src/services/mailService';
import {
  removeHostNoShowNotifyAdminIfListed,
  resolveHostNoShowNotifyEmails,
} from '../../../src/payments/hostNoShowNotifyAdmins';

describe('hostNoShowNotifyAdmins', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves emails only for selected active Admins', async () => {
    (getPaymentsConfig as jest.Mock).mockReturnValue({ hostNoShowNotifyAdminIds: [1, 2, 3] });
    (prisma.member.findMany as jest.Mock).mockResolvedValue([
      { id: 1, email: 'a@example.com' },
      { id: 2, email: 'b@example.com' },
    ]);
    await expect(resolveHostNoShowNotifyEmails()).resolves.toEqual([
      'a@example.com',
      'b@example.com',
    ]);
    expect(prisma.member.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: [1, 2, 3] },
          isActive: true,
          roles: { has: 'ADMIN' },
        }),
      }),
    );
  });

  it('removes a listed Admin and notifies other Admins', async () => {
    (getPaymentsConfig as jest.Mock).mockReturnValue({ hostNoShowNotifyAdminIds: [10, 11] });
    (prisma.member.findMany as jest.Mock).mockResolvedValue([{ email: 'other@example.com' }]);

    const removed = await removeHostNoShowNotifyAdminIfListed(
      { id: 10, firstName: 'Ada', lastName: 'Admin' },
      'deactivated',
    );

    expect(removed).toBe(true);
    expect(updateSystemConfig).toHaveBeenCalledWith({
      payments: { hostNoShowNotifyAdminIds: [11] },
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'other@example.com',
        subject: expect.stringMatching(/Ada Admin removed/),
      }),
    );
  });

  it('no-ops when the Admin is not on the list', async () => {
    (getPaymentsConfig as jest.Mock).mockReturnValue({ hostNoShowNotifyAdminIds: [11] });
    const removed = await removeHostNoShowNotifyAdminIfListed(
      { id: 10, firstName: 'Ada', lastName: 'Admin' },
      'deleted',
    );
    expect(removed).toBe(false);
    expect(updateSystemConfig).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });
});
