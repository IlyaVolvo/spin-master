/**
 * Payment feature — courtesy check-in evaluation
 */
jest.mock('../../../src/index', () => ({
  prisma: {
    member: { findUnique: jest.fn() },
    clubEntitlement: { findFirst: jest.fn() },
    clubVisit: { count: jest.fn() },
  },
}));

jest.mock('../../../src/services/systemConfigService', () => ({
  getSystemConfig: jest.fn(),
}));

jest.mock('../../../src/services/mailService', () => ({
  sendMail: jest.fn(),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { prisma } from '../../../src/index';
import { getSystemConfig } from '../../../src/services/systemConfigService';
import { evaluateCourtesy } from '../../../src/payments/courtesy';

describe('evaluateCourtesy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getSystemConfig as jest.Mock).mockReturnValue({
      payments: {
        courtesyExtraVisits: 2,
        courtesyGraceDays: 3,
      },
    });
  });

  it('denies missing members and suspended courtesy', async () => {
    (prisma.member.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(evaluateCourtesy(1)).resolves.toMatchObject({
      allowed: false,
      reason: 'no_plan',
    });

    (prisma.member.findUnique as jest.Mock).mockResolvedValue({ courtesySuspended: true });
    await expect(evaluateCourtesy(1)).resolves.toMatchObject({
      allowed: false,
      reason: 'suspended',
    });
  });

  it('denies when no entitlement or pay-per-visit', async () => {
    (prisma.member.findUnique as jest.Mock).mockResolvedValue({ courtesySuspended: false });
    (prisma.clubEntitlement.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(evaluateCourtesy(1)).resolves.toMatchObject({ reason: 'no_plan' });

    (prisma.clubEntitlement.findFirst as jest.Mock).mockResolvedValue({
      type: 'PAY_PER_VISIT_EXTERNAL',
      active: true,
    });
    await expect(evaluateCourtesy(1)).resolves.toMatchObject({ reason: 'ppv' });
  });

  it('allows visit-pack courtesy only after pack exhaustion and under grace limit', async () => {
    (prisma.member.findUnique as jest.Mock).mockResolvedValue({ courtesySuspended: false });
    (prisma.clubEntitlement.findFirst as jest.Mock).mockResolvedValue({
      type: 'VISIT_PACK',
      active: true,
      visitsRemaining: 2,
    });
    await expect(evaluateCourtesy(1)).resolves.toMatchObject({
      allowed: false,
      reason: 'no_plan',
    });

    (prisma.clubEntitlement.findFirst as jest.Mock).mockResolvedValue({
      type: 'VISIT_PACK',
      active: false,
      visitsRemaining: 0,
    });
    (prisma.clubVisit.count as jest.Mock).mockResolvedValue(1);
    await expect(evaluateCourtesy(1)).resolves.toMatchObject({
      allowed: true,
      basis: 'visit_pack',
    });

    (prisma.clubVisit.count as jest.Mock).mockResolvedValue(2);
    await expect(evaluateCourtesy(1)).resolves.toMatchObject({
      allowed: false,
      reason: 'grace_exhausted',
    });
  });

  it('allows period courtesy within grace days after validTo', async () => {
    (prisma.member.findUnique as jest.Mock).mockResolvedValue({ courtesySuspended: false });
    const validTo = new Date();
    validTo.setUTCDate(validTo.getUTCDate() - 1);
    (prisma.clubEntitlement.findFirst as jest.Mock).mockResolvedValue({
      type: 'MONTHLY',
      active: false,
      validTo,
      validFrom: new Date('2026-01-01T00:00:00.000Z'),
    });

    await expect(evaluateCourtesy(1)).resolves.toMatchObject({
      allowed: true,
      basis: 'period',
    });
  });

  it('denies period courtesy after grace days exhausted', async () => {
    (prisma.member.findUnique as jest.Mock).mockResolvedValue({ courtesySuspended: false });
    const validTo = new Date();
    validTo.setUTCDate(validTo.getUTCDate() - 10);
    (prisma.clubEntitlement.findFirst as jest.Mock).mockResolvedValue({
      type: 'MONTHLY',
      active: false,
      validTo,
      validFrom: new Date('2026-01-01T00:00:00.000Z'),
    });

    await expect(evaluateCourtesy(1)).resolves.toMatchObject({
      allowed: false,
      reason: 'grace_exhausted',
    });
  });
});
