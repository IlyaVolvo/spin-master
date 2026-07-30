/**
 * Payment feature — entitlement queue helpers
 */
jest.mock('../../../src/index', () => ({
  prisma: {
    clubEntitlement: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { prisma } from '../../../src/index';
import {
  computeFutureReimburseCents,
  refreshCurrentEntitlement,
  serializeEntitlement,
} from '../../../src/payments/entitlementQueue';
import type { ClubEntitlement } from '@prisma/client';

function ent(partial: Partial<ClubEntitlement>): ClubEntitlement {
  return {
    id: 1,
    memberId: 10,
    type: 'MONTHLY',
    status: 'CURRENT',
    label: 'Monthly',
    validFrom: new Date('2026-07-01T12:00:00.000Z'),
    validTo: new Date('2026-08-01T12:00:00.000Z'),
    visitsRemaining: null,
    visitsTotal: null,
    amountPaidCents: 5500,
    familyKey: 'monthly',
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    planId: 1,
    planSegment: 'Regular',
    ...partial,
  } as ClubEntitlement;
}

describe('entitlementQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('serializeEntitlement', () => {
    it('returns null for missing entitlement', () => {
      expect(serializeEntitlement(null)).toBeNull();
    });

    it('serializes ISO dates and fields', () => {
      const s = serializeEntitlement(ent({}));
      expect(s?.validFrom).toBe('2026-07-01T12:00:00.000Z');
      expect(s?.validTo).toBe('2026-08-01T12:00:00.000Z');
      expect(s?.amountPaidCents).toBe(5500);
      expect(s?.familyKey).toBe('monthly');
    });
  });

  describe('computeFutureReimburseCents', () => {
    it('returns 0 when nothing was paid', () => {
      expect(computeFutureReimburseCents(ent({ amountPaidCents: 0 }))).toBe(0);
    });

    it('reimburses remaining visits proportionally', () => {
      expect(
        computeFutureReimburseCents(
          ent({
            type: 'VISIT_PACK',
            visitsTotal: 10,
            visitsRemaining: 4,
            amountPaidCents: 10000,
            validTo: null,
          }),
        ),
      ).toBe(4000);
    });

    it('reimburses remaining time proportionally', () => {
      const now = new Date('2026-07-16T12:00:00.000Z');
      const cents = computeFutureReimburseCents(
        ent({
          validFrom: new Date('2026-07-01T12:00:00.000Z'),
          validTo: new Date('2026-07-31T12:00:00.000Z'),
          amountPaidCents: 3000,
        }),
        now,
      );
      // 15 of 30 days remaining → ~1500
      expect(cents).toBe(1500);
    });

    it('returns full paid amount for period without validTo', () => {
      expect(
        computeFutureReimburseCents(
          ent({ validTo: null, amountPaidCents: 4200, type: 'YEARLY' }),
        ),
      ).toBe(4200);
    });
  });

  describe('refreshCurrentEntitlement', () => {
    it('returns null when no current entitlement', async () => {
      (prisma.clubEntitlement.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(refreshCurrentEntitlement(10)).resolves.toBeNull();
    });

    it('ends and clears expired time plans', async () => {
      const expired = ent({
        validTo: new Date('2020-01-01T00:00:00.000Z'),
      });
      (prisma.clubEntitlement.findFirst as jest.Mock).mockResolvedValue(expired);
      (prisma.clubEntitlement.update as jest.Mock).mockResolvedValue({});

      await expect(refreshCurrentEntitlement(10)).resolves.toBeNull();
      expect(prisma.clubEntitlement.update).toHaveBeenCalledWith({
        where: { id: expired.id },
        data: { status: 'ENDED', active: false },
      });
    });

    it('ends exhausted visit packs', async () => {
      const pack = ent({
        type: 'VISIT_PACK',
        visitsRemaining: 0,
        visitsTotal: 10,
        validTo: null,
      });
      (prisma.clubEntitlement.findFirst as jest.Mock).mockResolvedValue(pack);
      (prisma.clubEntitlement.update as jest.Mock).mockResolvedValue({});

      await expect(refreshCurrentEntitlement(10)).resolves.toBeNull();
      expect(prisma.clubEntitlement.update).toHaveBeenCalled();
    });

    it('returns active current entitlement', async () => {
      const current = ent({
        validTo: new Date('2099-01-01T00:00:00.000Z'),
      });
      (prisma.clubEntitlement.findFirst as jest.Mock).mockResolvedValue(current);
      await expect(refreshCurrentEntitlement(10)).resolves.toBe(current);
      expect(prisma.clubEntitlement.update).not.toHaveBeenCalled();
    });
  });
});
