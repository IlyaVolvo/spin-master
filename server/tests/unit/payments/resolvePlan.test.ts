/**
 * Payment feature — plan pricing and segment resolution
 */
jest.mock('../../../src/index', () => ({
  prisma: {
    clubPlan: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

import { prisma } from '../../../src/index';
import {
  listActivePlanFamilies,
  planChargeAmountCents,
  resolvePlanForMember,
} from '../../../src/payments/resolvePlan';

describe('resolvePlan', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('planChargeAmountCents', () => {
    it('uses priceCents as total for TIME plans', () => {
      expect(planChargeAmountCents({ kind: 'TIME', priceCents: 5500, visitCount: null })).toBe(5500);
    });

    it('multiplies price × visits for VISIT plans', () => {
      expect(planChargeAmountCents({ kind: 'VISIT', priceCents: 850, visitCount: 10 })).toBe(8500);
    });

    it('treats missing/negative values safely', () => {
      expect(planChargeAmountCents({ kind: 'VISIT', priceCents: -10, visitCount: 5 })).toBe(0);
      expect(planChargeAmountCents({ kind: 'VISIT', priceCents: 100, visitCount: null })).toBe(0);
      expect(planChargeAmountCents({ kind: 'TIME', priceCents: null as any, visitCount: null })).toBe(0);
    });
  });

  describe('resolvePlanForMember', () => {
    it('returns the member segment variant when present', async () => {
      const plan = { id: 1, familyKey: 'monthly', segment: 'Senior', isActive: true };
      (prisma.clubPlan.findFirst as jest.Mock).mockResolvedValueOnce(plan);

      await expect(resolvePlanForMember('monthly', 'Senior')).resolves.toBe(plan);
      expect(prisma.clubPlan.findFirst).toHaveBeenCalledWith({
        where: { familyKey: 'monthly', segment: 'Senior', isActive: true },
      });
    });

    it('maps legacy Normal segment to Regular', async () => {
      const plan = { id: 2, familyKey: 'monthly', segment: 'Regular', isActive: true };
      (prisma.clubPlan.findFirst as jest.Mock).mockResolvedValueOnce(plan);

      await resolvePlanForMember('monthly', 'Normal');
      expect(prisma.clubPlan.findFirst).toHaveBeenCalledWith({
        where: { familyKey: 'monthly', segment: 'Regular', isActive: true },
      });
    });

    it('falls back to Regular when segment variant is missing', async () => {
      const regular = { id: 3, familyKey: 'monthly', segment: 'Regular', isActive: true };
      (prisma.clubPlan.findFirst as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(regular);

      await expect(resolvePlanForMember('monthly', 'Junior')).resolves.toBe(regular);
      expect(prisma.clubPlan.findFirst).toHaveBeenCalledTimes(2);
    });

    it('throws when no active plan exists', async () => {
      (prisma.clubPlan.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(resolvePlanForMember('missing', 'Regular')).rejects.toThrow(/No active plan/);
    });
  });

  describe('listActivePlanFamilies', () => {
    it('dedupes by familyKey and sorts by sortOrder then name', async () => {
      (prisma.clubPlan.findMany as jest.Mock).mockResolvedValue([
        { familyKey: 'b', name: 'B', kind: 'TIME', sortOrder: 2 },
        { familyKey: 'a', name: 'A Senior', kind: 'TIME', sortOrder: 1 },
        { familyKey: 'a', name: 'A Regular', kind: 'TIME', sortOrder: 1 },
        { familyKey: 'c', name: 'C', kind: 'VISIT', sortOrder: 1 },
      ]);

      const families = await listActivePlanFamilies();
      expect(families.map((f) => f.familyKey)).toEqual(['a', 'c', 'b']);
      expect(families[0].name).toBe('A Senior');
    });
  });
});
