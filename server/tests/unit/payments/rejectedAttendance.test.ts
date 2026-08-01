/**
 * Rejected check-in persistence for Attendance Log
 */
jest.mock('../../../src/index', () => ({
  prisma: {
    clubVisit: {
      create: jest.fn(),
    },
  },
}));

import { prisma } from '../../../src/index';
import {
  buildRejectedVisitCreateData,
  recordRejectedCheckIn,
} from '../../../src/payments/recordRejectedCheckIn';
import {
  attendanceStatusWhere,
  parseAttendanceStatusFilter,
} from '../../../src/payments/attendanceLogFilters';

describe('rejected attendance path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('buildRejectedVisitCreateData / recordRejectedCheckIn', () => {
    it('builds a closed visit with rejectedAt and reason', () => {
      const at = new Date('2026-08-01T02:20:40.909Z');
      expect(
        buildRejectedVisitCreateData({
          memberId: 170,
          clubDate: '2026-08-01',
          closedBy: 'MANUAL',
          reason: 'Payment is required.',
          at,
        }),
      ).toEqual({
        memberId: 170,
        clubDate: '2026-08-01',
        checkInAt: at,
        checkOutAt: at,
        closedBy: 'MANUAL',
        dailyPaymentApplied: false,
        rejectedAt: at,
        rejectionReason: 'Payment is required.',
      });
    });

    it('defaults reason text when empty', () => {
      const data = buildRejectedVisitCreateData({
        memberId: 1,
        clubDate: '2026-07-31',
        closedBy: 'SCAN',
        reason: '',
        at: new Date('2026-07-31T12:00:00.000Z'),
      });
      expect(data.rejectionReason).toBe('Check-in rejected');
    });

    it('persists via prisma.clubVisit.create', async () => {
      const created = { id: 18 };
      (prisma.clubVisit.create as jest.Mock).mockResolvedValue(created);
      const at = new Date('2026-08-01T02:24:05.800Z');

      await expect(
        recordRejectedCheckIn({
          memberId: 97,
          clubDate: '2026-08-01',
          closedBy: 'MANUAL',
          reason: 'Courtesy check-in is suspended for this member. Payment is required.',
          at,
        }),
      ).resolves.toBe(created);

      expect(prisma.clubVisit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          memberId: 97,
          rejectedAt: at,
          checkOutAt: at,
          rejectionReason:
            'Courtesy check-in is suspended for this member. Payment is required.',
        }),
      });
    });
  });

  describe('attendanceStatusWhere / parseAttendanceStatusFilter', () => {
    it('parses status query and legacy present flags', () => {
      expect(parseAttendanceStatusFilter({ status: 'rejected' })).toBe('rejected');
      expect(parseAttendanceStatusFilter({ status: 'PRESENT' })).toBe('present');
      expect(parseAttendanceStatusFilter({ present: '1' })).toBe('present');
      expect(parseAttendanceStatusFilter({ onlyPresent: 'true' })).toBe('present');
      expect(parseAttendanceStatusFilter({})).toBe('all');
    });

    it('maps filters so rejected rows are isolated from Present', () => {
      expect(attendanceStatusWhere('present')).toEqual({
        checkOutAt: null,
        rejectedAt: null,
      });
      expect(attendanceStatusWhere('rejected')).toEqual({
        rejectedAt: { not: null },
      });
      expect(attendanceStatusWhere('all')).toEqual({});
    });
  });
});
