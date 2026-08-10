/**
 * Admin write-off of PENDING payments — name + password gates and terminal status.
 */

jest.mock('../../../src/index', () => ({
  prisma: {
    member: { findUnique: jest.fn() },
    clubPayment: { findUnique: jest.fn(), update: jest.fn() },
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

jest.mock('../../../src/services/socketService', () => ({
  emitPaymentUpdated: jest.fn(),
}));

jest.mock('../../../src/payments/PaymentProviderRegistry', () => ({
  paymentProviderRegistry: {
    has: jest.fn().mockReturnValue(false),
    get: jest.fn(),
  },
}));

jest.mock('bcryptjs', () => ({
  __esModule: true,
  default: {
    compare: jest.fn(),
  },
}));

import bcrypt from 'bcryptjs';
import { prisma } from '../../../src/index';
import {
  memberDisplayName,
  normalizeMemberConfirmName,
  writeOffPendingPayment,
} from '../../../src/payments/writeOffPendingPayment';

describe('writeOffPendingPayment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes member confirm names', () => {
    expect(normalizeMemberConfirmName('  Ilya   Volvovski ')).toBe('ilya volvovski');
    expect(memberDisplayName({ firstName: 'Ilya', lastName: 'Volvovski' })).toBe('Ilya Volvovski');
  });

  it('writes off PENDING when name and password match', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (prisma.member.findUnique as jest.Mock).mockResolvedValue({
      id: 1,
      password: 'hash',
      roles: ['ADMIN'],
      isActive: true,
    });
    (prisma.clubPayment.findUnique as jest.Mock).mockResolvedValue({
      id: 10,
      memberId: 2,
      status: 'PENDING',
      provider: 'cash',
      externalRef: 'cash_10',
      amountCents: 3000,
      purpose: 'Weekly',
      metadata: { kind: 'checkout' },
      member: { id: 2, firstName: 'Ilya', lastName: 'Volvovski' },
    });
    (prisma.clubPayment.update as jest.Mock).mockResolvedValue({
      id: 10,
      memberId: 2,
      status: 'WRITTEN_OFF',
      provider: 'cash',
      amountCents: 3000,
      purpose: 'Weekly',
    });

    const result = await writeOffPendingPayment({
      paymentId: 10,
      adminMemberId: 1,
      memberNameConfirm: 'ilya volvovski',
      password: 'secret',
    });

    expect(result).toEqual({ paymentId: 10, status: 'WRITTEN_OFF', memberId: 2 });
    expect(prisma.clubPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10 },
        data: expect.objectContaining({ status: 'WRITTEN_OFF' }),
      }),
    );
  });

  it('rejects wrong member name', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (prisma.member.findUnique as jest.Mock).mockResolvedValue({
      id: 1,
      password: 'hash',
      roles: ['ADMIN'],
      isActive: true,
    });
    (prisma.clubPayment.findUnique as jest.Mock).mockResolvedValue({
      id: 10,
      memberId: 2,
      status: 'PENDING',
      provider: 'stripe-test',
      externalRef: 'cs_x',
      amountCents: 2000,
      purpose: 'Weekly',
      metadata: {},
      member: { id: 2, firstName: 'Ilya', lastName: 'Volvovski' },
    });

    await expect(
      writeOffPendingPayment({
        paymentId: 10,
        adminMemberId: 1,
        memberNameConfirm: 'Wrong Name',
        password: 'secret',
      }),
    ).rejects.toThrow(/Type the member name/);
    expect(prisma.clubPayment.update).not.toHaveBeenCalled();
  });

  it('rejects incorrect password', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    (prisma.member.findUnique as jest.Mock).mockResolvedValue({
      id: 1,
      password: 'hash',
      roles: ['ADMIN'],
      isActive: true,
    });

    await expect(
      writeOffPendingPayment({
        paymentId: 10,
        adminMemberId: 1,
        memberNameConfirm: 'Ilya Volvovski',
        password: 'nope',
      }),
    ).rejects.toThrow(/Incorrect password/);
  });
});
