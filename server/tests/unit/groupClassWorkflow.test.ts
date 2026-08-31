jest.mock('../../src/index', () => ({
  prisma: {
    individualLesson: { findMany: jest.fn() },
    groupClassOccurrence: { findMany: jest.fn(), findUnique: jest.fn() },
    groupClassRegistration: { findMany: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
    groupClass: { findMany: jest.fn() },
  },
}));

jest.mock('../../src/services/systemConfigService', () => ({
  getLessonsConfig: () => ({
    busyBufferMinutes: 0,
    designatedAcceptDaysBeforeFirst: 3,
    horizonMonths: 3,
  }),
}));

jest.mock('../../src/utils/clubDate', () => {
  const actual = jest.requireActual('../../src/utils/clubDate');
  return {
    ...actual,
    getClubDate: jest.fn(() => '2026-09-10'),
    getClubTimezone: () => 'UTC',
  };
});

jest.mock('../../src/services/mailService', () => ({
  sendGroupDesignatedExpiredEmail: jest.fn(),
  sendGroupOccurrenceCancelledEmail: jest.fn(),
  sendGroupClassBlastEmail: jest.fn(),
  sendGroupClassRegisteredEmail: jest.fn(),
  sendGroupCoachInviteEmail: jest.fn(),
  sendGroupDesignatedSeatEmail: jest.fn(),
  sendGroupWaitlistPromotedEmail: jest.fn(),
}));

jest.mock('../../src/services/lessonLifecycle', () => ({
  recordLessonLifecycle: jest.fn(),
}));

jest.mock('../../src/services/lessonCalendarEvents', () => ({
  notifyLessonCalendar: jest.fn(),
}));

jest.mock('../../src/payments/lessonPayment', () => ({
  runLessonCheckout: jest.fn(),
  creditSucceededLessonPayment: jest.fn(),
  cancelPendingLessonPayment: jest.fn(),
}));

import { prisma } from '../../src/index';
import { coachBusyIntervals, playerBusyIntervals } from '../../src/services/busyTimeService';
import {
  belowMinCancelDue,
  countsTowardCapacity,
  designatedHoldExpired,
  expireDesignatedHolds,
} from '../../src/services/groupClassService';

describe('group class workflow helpers', () => {
  it('counts PENDING and ACCEPTED toward capacity', () => {
    expect(countsTowardCapacity('PENDING')).toBe(true);
    expect(countsTowardCapacity('ACCEPTED')).toBe(true);
    expect(countsTowardCapacity('WAITING')).toBe(false);
    expect(countsTowardCapacity('DROPPED')).toBe(false);
  });

  it('expires designated holds on the deadline day', () => {
    expect(designatedHoldExpired('2026-09-13', 3, '2026-09-09')).toBe(false);
    expect(designatedHoldExpired('2026-09-13', 3, '2026-09-10')).toBe(true);
    expect(designatedHoldExpired('2026-09-13', 3, '2026-09-12')).toBe(true);
  });

  it('treats the cancellation deadline as reached when hours remaining are at or below the window', () => {
    expect(belowMinCancelDue(25, 24)).toBe(false);
    expect(belowMinCancelDue(24, 24)).toBe(true);
    expect(belowMinCancelDue(1, 24)).toBe(true);
  });
});

describe('busyTimeService group filters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.individualLesson.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.groupClassOccurrence.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.groupClassRegistration.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('loads group busy only for ACCEPTED coaches', async () => {
    await coachBusyIntervals(7, '2026-09-01', '2026-09-07');
    expect(prisma.groupClassOccurrence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          groupClass: { coaches: { some: { coachProfileId: 7, inviteStatus: 'ACCEPTED' } } },
        }),
      }),
    );
  });

  it('loads player busy for ACCEPTED and PENDING holds', async () => {
    await playerBusyIntervals(3, '2026-09-01', '2026-09-07');
    expect(prisma.groupClassRegistration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          memberId: 3,
          status: { in: ['ACCEPTED', 'PENDING'] },
        }),
      }),
    );
  });
});

describe('expireDesignatedHolds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.groupClass.findMany as jest.Mock).mockResolvedValue([
      {
        id: 1,
        title: 'Morning group',
        designees: [{ memberId: 9, member: { email: 'a@x.com', firstName: 'Ann' } }],
        occurrences: [{ clubDate: '2026-09-13' }],
      },
    ]);
    (prisma.groupClassRegistration.findMany as jest.Mock).mockResolvedValue([
      { id: 44, memberId: 9, occurrenceId: 2 },
    ]);
    (prisma.groupClassRegistration.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.groupClassRegistration.count as jest.Mock).mockResolvedValue(0);
    (prisma.groupClassOccurrence.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.groupClassOccurrence.findUnique as jest.Mock).mockResolvedValue(null);
  });

  it('drops remaining PENDING designated rows after the hold date', async () => {
    const result = await expireDesignatedHolds();
    expect(result.expiredPlayers).toBe(1);
    expect(result.dropped).toBe(1);
    expect(prisma.groupClassRegistration.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [44] } },
      data: { status: 'DROPPED', waitlistPosition: null },
    });
  });
});
