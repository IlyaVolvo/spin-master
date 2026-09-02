jest.mock('../../src/index', () => ({
  prisma: {
    member: { findUnique: jest.fn() },
    coachProfile: { findUnique: jest.fn(), findMany: jest.fn() },
    coachAvailabilityOccurrence: { findMany: jest.fn() },
    individualLesson: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    individualLessonSeries: { create: jest.fn() },
    clubPayment: { findUnique: jest.fn() },
  },
}));

jest.mock('../../src/services/systemConfigService', () => ({
  getLessonsConfig: () => ({
    individualDurations: { allowedMinutes: [30, 60, 90, 120], defaultMinutes: 60 },
    groupDurations: { allowedMinutes: [30, 60, 90, 120], defaultMinutes: 60 },
    horizonMonths: 3,
    busyBufferMinutes: 0,
    studentCancelHours: 24,
    coachCancelHours: 2,
  }),
}));

jest.mock('../../src/services/availabilityService', () => ({
  materializeAvailabilitySeriesForCoach: jest.fn().mockResolvedValue(0),
}));

jest.mock('../../src/services/busyTimeService', () => ({
  assertCoachAndPlayerFree: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/coachEditSession', () => ({
  assertCoachBookingNotFrozen: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/lessonLifecycle', () => ({
  recordLessonLifecycle: jest.fn(),
}));

jest.mock('../../src/services/lessonCalendarEvents', () => ({
  notifyLessonCalendar: jest.fn(),
}));

jest.mock('../../src/payments/lessonPayment', () => ({
  runLessonCheckout: jest.fn().mockResolvedValue({ paymentId: 501, method: 'cash' }),
  creditSucceededLessonPayment: jest.fn().mockResolvedValue(6000),
  cancelPendingLessonPayment: jest.fn(),
}));

jest.mock('../../src/services/mailService', () => ({
  sendIndividualLessonBookedEmail: jest.fn().mockResolvedValue(undefined),
  sendIndividualLessonCancelledEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn(), auditInfo: jest.fn() },
}));

import { prisma } from '../../src/index';
import { assertCoachAndPlayerFree } from '../../src/services/busyTimeService';
import { assertCoachBookingNotFrozen } from '../../src/services/coachEditSession';
import { recordLessonLifecycle } from '../../src/services/lessonLifecycle';
import {
  runLessonCheckout,
  creditSucceededLessonPayment,
  cancelPendingLessonPayment,
} from '../../src/payments/lessonPayment';
import {
  bookIndividualLesson,
  bookIndividualSeries,
  cancelIndividualLesson,
  coachAcceptsPlayerRating,
  eligibilityError,
  reduceIndividualLessonRate,
  searchIndividualSlots,
} from '../../src/services/individualLessonService';

const ILYA = {
  coachProfileId: 1,
  memberId: 10,
  firstName: 'Ilya',
  lastName: 'Volvovski',
  email: 'ilya@volvovski.com',
};
const POLLY = {
  memberId: 30,
  firstName: 'Polly',
  lastName: 'Wordlot',
  email: 'polly@test.local',
  rating: 1200,
  birthDate: new Date('2010-01-01T00:00:00.000Z'),
};
const AMY = {
  memberId: 40,
  firstName: 'Amy',
  lastName: 'Turner',
  email: 'amy@test.local',
  rating: 400,
  birthDate: new Date('2012-06-01T00:00:00.000Z'),
};

function playerMember(overrides: Record<string, unknown> = {}) {
  return {
    id: POLLY.memberId,
    rating: POLLY.rating,
    birthDate: POLLY.birthDate,
    roles: ['PLAYER'],
    firstName: POLLY.firstName,
    lastName: POLLY.lastName,
    email: POLLY.email,
    isActive: true,
    ...overrides,
  };
}

function ilyaCoach(overrides: Record<string, unknown> = {}) {
  return {
    id: ILYA.coachProfileId,
    memberId: ILYA.memberId,
    teachingActive: true,
    hourlyRateCents: 6000,
    studentRatingMin: null,
    studentRatingMax: null,
    editSessionUntil: null,
    member: {
      id: ILYA.memberId,
      firstName: ILYA.firstName,
      lastName: ILYA.lastName,
      email: ILYA.email,
    },
    ...overrides,
  };
}

function containingOccurrence(overrides: Record<string, unknown> = {}) {
  return {
    id: 77,
    clubDate: '2026-09-14',
    startTime: '16:00',
    endTime: '18:00',
    cancelled: false,
    ratingMin: null,
    ratingMax: null,
    ageMin: null,
    ageMax: null,
    ...overrides,
  };
}

describe('coachAcceptsPlayerRating', () => {
  it('accepts any rating when Ilya has no band', () => {
    expect(coachAcceptsPlayerRating({ studentRatingMin: null, studentRatingMax: null }, 1200)).toBe(true);
    expect(coachAcceptsPlayerRating({ studentRatingMin: null, studentRatingMax: null }, null)).toBe(true);
  });

  it('rejects Polly when Ilya only teaches lower ratings', () => {
    expect(coachAcceptsPlayerRating({ studentRatingMin: null, studentRatingMax: 800 }, POLLY.rating)).toBe(false);
  });

  it('rejects Amy when Ilya only teaches higher ratings', () => {
    expect(coachAcceptsPlayerRating({ studentRatingMin: 1000, studentRatingMax: null }, AMY.rating)).toBe(false);
  });

  it('rejects a player with no rating once Ilya sets a band', () => {
    expect(coachAcceptsPlayerRating({ studentRatingMin: 500, studentRatingMax: 1400 }, null)).toBe(false);
  });

  it('accepts Polly inside Ilya’s intermediate band', () => {
    expect(coachAcceptsPlayerRating({ studentRatingMin: 1000, studentRatingMax: 1400 }, POLLY.rating)).toBe(true);
  });
});

describe('eligibilityError', () => {
  const slot = { ratingMin: 1000, ratingMax: 1400, ageMin: 12, ageMax: 18 };

  it('returns null when admin or coach bypasses checks', () => {
    expect(eligibilityError(slot, { rating: null, birthDate: null }, '2026-09-14', true)).toBeNull();
  });

  it('requires a rating when the slot is banded', () => {
    expect(eligibilityError(slot, { rating: null, birthDate: POLLY.birthDate }, '2026-09-14', false)).toBe(
      'A rating is required for this time',
    );
  });

  it('blocks Amy when her rating is below Ilya’s slot', () => {
    expect(eligibilityError(slot, { rating: AMY.rating, birthDate: AMY.birthDate }, '2026-09-14', false)).toBe(
      'Player rating is below this slot’s range',
    );
  });

  it('blocks a player above the slot max', () => {
    expect(eligibilityError(slot, { rating: 1800, birthDate: POLLY.birthDate }, '2026-09-14', false)).toBe(
      'Player rating is above this slot’s range',
    );
  });

  it('requires a birth date when the slot has an age range', () => {
    expect(eligibilityError(slot, { rating: POLLY.rating, birthDate: null }, '2026-09-14', false)).toBe(
      'A birth date is required for this time',
    );
  });

  it('blocks a player younger or older than the slot allows', () => {
    expect(
      eligibilityError(slot, { rating: POLLY.rating, birthDate: new Date('2016-09-14') }, '2026-09-14', false),
    ).toBe('Player is younger than this slot allows');
    expect(
      eligibilityError(slot, { rating: POLLY.rating, birthDate: new Date('2005-09-14') }, '2026-09-14', false),
    ).toBe('Player is older than this slot allows');
  });

  it('allows Polly when rating and age fit', () => {
    expect(eligibilityError(slot, { rating: POLLY.rating, birthDate: POLLY.birthDate }, '2026-09-14', false)).toBeNull();
  });
});

describe('searchIndividualSlots', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (assertCoachAndPlayerFree as jest.Mock).mockResolvedValue(undefined);
    (prisma.member.findUnique as jest.Mock).mockResolvedValue(playerMember());
    (prisma.coachProfile.findMany as jest.Mock).mockResolvedValue([ilyaCoach()]);
    (prisma.coachAvailabilityOccurrence.findMany as jest.Mock).mockResolvedValue([
      {
        ...containingOccurrence(),
        series: {
          coachProfileId: ILYA.coachProfileId,
          coach: ilyaCoach(),
        },
      },
    ]);
  });

  it('rejects a duration that is not allowed for private lessons', async () => {
    await expect(
      searchIndividualSlots({
        playerMemberId: POLLY.memberId,
        durationMinutes: 45,
        timeRanges: [{ clubDate: '2026-09-14', startTime: '16:00', endTime: '18:00' }],
      }),
    ).rejects.toThrow('Duration is not allowed for individual lessons');
  });

  it('rejects a non-player', async () => {
    (prisma.member.findUnique as jest.Mock).mockResolvedValue(playerMember({ roles: ['ORGANIZER'] }));
    await expect(
      searchIndividualSlots({
        playerMemberId: POLLY.memberId,
        durationMinutes: 60,
        timeRanges: [{ clubDate: '2026-09-14', startTime: '16:00', endTime: '18:00' }],
      }),
    ).rejects.toThrow('Only players can book lessons');
  });

  it('returns 15-minute starts inside Ilya’s window for Polly', async () => {
    const matches = await searchIndividualSlots({
      playerMemberId: POLLY.memberId,
      durationMinutes: 60,
      timeRanges: [{ clubDate: '2026-09-14', startTime: '16:00', endTime: '18:00' }],
    });
    expect(matches.map((m) => m.startTime)).toEqual(['16:00', '16:15', '16:30', '16:45', '17:00']);
    expect(matches[0]).toMatchObject({
      coachProfileId: ILYA.coachProfileId,
      coachName: 'Ilya Volvovski',
      priceCents: 6000,
      endTime: '17:00',
    });
  });

  it('skips starts that conflict with existing busy time', async () => {
    (assertCoachAndPlayerFree as jest.Mock).mockImplementation(async ({ startTime }) => {
      if (startTime === '16:00') throw new Error('busy');
    });
    const matches = await searchIndividualSlots({
      playerMemberId: POLLY.memberId,
      durationMinutes: 60,
      timeRanges: [{ clubDate: '2026-09-14', startTime: '16:00', endTime: '18:00' }],
    });
    expect(matches.map((m) => m.startTime)).not.toContain('16:00');
    expect(matches[0].startTime).toBe('16:15');
  });
});

describe('bookIndividualLesson', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (assertCoachAndPlayerFree as jest.Mock).mockResolvedValue(undefined);
    (assertCoachBookingNotFrozen as jest.Mock).mockResolvedValue(undefined);
    (prisma.member.findUnique as jest.Mock).mockResolvedValue(playerMember());
    (prisma.coachProfile.findUnique as jest.Mock).mockResolvedValue(ilyaCoach());
    (prisma.coachAvailabilityOccurrence.findMany as jest.Mock).mockResolvedValue([containingOccurrence()]);
    (prisma.individualLesson.create as jest.Mock).mockResolvedValue({ id: 88, clubDate: '2026-09-14' });
    (prisma.individualLesson.findUnique as jest.Mock).mockResolvedValue({ id: 88, status: 'CONFIRMED' });
  });

  it('books Polly with Ilya and starts checkout', async () => {
    const result = await bookIndividualLesson({
      actorMemberId: POLLY.memberId,
      actorType: 'PLAYER',
      playerMemberId: POLLY.memberId,
      coachProfileId: ILYA.coachProfileId,
      clubDate: '2026-09-14',
      startTime: '16:00',
      durationMinutes: 60,
      initiatedBy: 'MEMBER',
    });
    expect(prisma.individualLesson.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          coachProfileId: ILYA.coachProfileId,
          playerMemberId: POLLY.memberId,
          startTime: '16:00',
          endTime: '17:00',
          priceCents: 6000,
          status: 'CONFIRMED',
        }),
      }),
    );
    expect(runLessonCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        memberId: POLLY.memberId,
        amountCents: 6000,
        product: expect.objectContaining({ kind: 'lesson_individual', lessonId: 88 }),
      }),
    );
    expect(recordLessonLifecycle).toHaveBeenCalledWith(expect.objectContaining({ action: 'REGISTER' }));
    expect(result.checkout).toEqual({ paymentId: 501, method: 'cash' });
  });

  it('rejects a start that is not on a 15-minute mark', async () => {
    await expect(
      bookIndividualLesson({
        actorMemberId: POLLY.memberId,
        actorType: 'PLAYER',
        playerMemberId: POLLY.memberId,
        coachProfileId: ILYA.coachProfileId,
        clubDate: '2026-09-14',
        startTime: '16:10',
        durationMinutes: 60,
        initiatedBy: 'MEMBER',
      }),
    ).rejects.toThrow('Start time must snap to 15 minutes');
  });

  it('rejects Amy when Ilya only teaches 1000–1400', async () => {
    (prisma.member.findUnique as jest.Mock).mockResolvedValue(playerMember({ ...AMY, id: AMY.memberId }));
    (prisma.coachProfile.findUnique as jest.Mock).mockResolvedValue(
      ilyaCoach({ studentRatingMin: 1000, studentRatingMax: 1400 }),
    );
    await expect(
      bookIndividualLesson({
        actorMemberId: AMY.memberId,
        actorType: 'PLAYER',
        playerMemberId: AMY.memberId,
        coachProfileId: ILYA.coachProfileId,
        clubDate: '2026-09-14',
        startTime: '16:00',
        durationMinutes: 60,
        initiatedBy: 'MEMBER',
      }),
    ).rejects.toThrow('This coach does not teach players at that rating');
  });

  it('rejects a time that is not on Ilya’s availability', async () => {
    (prisma.coachAvailabilityOccurrence.findMany as jest.Mock).mockResolvedValue([
      containingOccurrence({ startTime: '16:00', endTime: '17:00' }),
    ]);
    await expect(
      bookIndividualLesson({
        actorMemberId: POLLY.memberId,
        actorType: 'PLAYER',
        playerMemberId: POLLY.memberId,
        coachProfileId: ILYA.coachProfileId,
        clubDate: '2026-09-14',
        startTime: '17:00',
        durationMinutes: 60,
        initiatedBy: 'MEMBER',
      }),
    ).rejects.toThrow('That time is not on the coach’s availability calendar');
  });

  it('blocks inactive Polly from booking herself', async () => {
    (prisma.member.findUnique as jest.Mock).mockResolvedValue(playerMember({ isActive: false }));
    await expect(
      bookIndividualLesson({
        actorMemberId: POLLY.memberId,
        actorType: 'PLAYER',
        playerMemberId: POLLY.memberId,
        coachProfileId: ILYA.coachProfileId,
        clubDate: '2026-09-14',
        startTime: '16:00',
        durationMinutes: 60,
        initiatedBy: 'MEMBER',
      }),
    ).rejects.toThrow('Inactive members cannot book lessons themselves');
  });
});

describe('bookIndividualSeries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (assertCoachAndPlayerFree as jest.Mock).mockResolvedValue(undefined);
    (assertCoachBookingNotFrozen as jest.Mock).mockResolvedValue(undefined);
    (prisma.coachProfile.findUnique as jest.Mock).mockResolvedValue(ilyaCoach());
    (prisma.member.findUnique as jest.Mock).mockResolvedValue(playerMember());
    (prisma.coachAvailabilityOccurrence.findMany as jest.Mock).mockResolvedValue([
      containingOccurrence({ clubDate: '2026-09-14' }),
      containingOccurrence({ id: 78, clubDate: '2026-09-21' }),
    ]);
    (prisma.individualLessonSeries.create as jest.Mock).mockResolvedValue({
      id: 9,
      coachProfileId: ILYA.coachProfileId,
      playerMemberId: POLLY.memberId,
      durationMinutes: 60,
      startTime: '16:00',
      weekdays: ['mon'],
      intervalWeeks: 1,
      startsOn: '2026-09-14',
      untilOn: '2026-09-21',
    });
    let lessonId = 200;
    (prisma.individualLesson.create as jest.Mock).mockImplementation(async () => ({ id: ++lessonId }));
    (prisma.individualLesson.findUnique as jest.Mock).mockImplementation(async ({ where }) => ({
      id: where.id,
      status: 'CONFIRMED',
    }));
  });

  it('books matching Mondays and records skipped dates', async () => {
    (prisma.coachAvailabilityOccurrence.findMany as jest.Mock).mockImplementation(async ({ where }) => {
      const date = where.clubDate;
      if (date === '2026-09-21') return [];
      return [containingOccurrence({ clubDate: date })];
    });
    const result = await bookIndividualSeries({
      actorMemberId: POLLY.memberId,
      actorType: 'PLAYER',
      playerMemberId: POLLY.memberId,
      coachProfileId: ILYA.coachProfileId,
      startTime: '16:00',
      durationMinutes: 60,
      weekdays: ['mon'],
      startsOn: '2026-09-14',
      untilOn: '2026-09-21',
      initiatedBy: 'MEMBER',
    });
    expect(result.booked.length).toBe(1);
    expect(result.skipped).toContain('2026-09-21');
  });
});

describe('cancelIndividualLesson', () => {
  const lesson = {
    id: 88,
    status: 'CONFIRMED',
    clubDate: '2026-09-14',
    startTime: '16:00',
    playerMemberId: POLLY.memberId,
    coachProfileId: ILYA.coachProfileId,
    paymentId: 501,
    studentCancelHoursOverride: null,
    coach: { memberId: ILYA.memberId },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-13T16:00:00.000Z'));
    (prisma.individualLesson.findUnique as jest.Mock).mockResolvedValue(lesson);
    (prisma.individualLesson.update as jest.Mock).mockResolvedValue({ ...lesson, status: 'CANCELLED' });
    (prisma.clubPayment.findUnique as jest.Mock).mockResolvedValue({ id: 501, status: 'SUCCEEDED' });
    (prisma.member.findUnique as jest.Mock).mockImplementation(async ({ where }) => {
      if (where.id === POLLY.memberId) {
        return { email: POLLY.email, firstName: POLLY.firstName, lastName: POLLY.lastName };
      }
      return { email: ILYA.email, firstName: ILYA.firstName };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('lets Polly cancel at the 24-hour student window and credits her', async () => {
    const result = await cancelIndividualLesson({
      lessonId: 88,
      actorMemberId: POLLY.memberId,
      actorType: 'PLAYER',
      isAdmin: false,
      cancelReason: 'Schedule conflict',
    });
    expect(creditSucceededLessonPayment).toHaveBeenCalledWith(501);
    expect(result.creditedCents).toBe(6000);
    expect(prisma.individualLesson.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CANCELLED', cancelReason: 'Schedule conflict' }),
      }),
    );
  });

  it('requires a reason when Polly cancels', async () => {
    await expect(
      cancelIndividualLesson({
        lessonId: 88,
        actorMemberId: POLLY.memberId,
        actorType: 'PLAYER',
        isAdmin: false,
      }),
    ).rejects.toThrow('A cancellation reason is required');
  });

  it('blocks Polly after the student window closes', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-13T16:00:01.000Z'));
    await expect(
      cancelIndividualLesson({
        lessonId: 88,
        actorMemberId: POLLY.memberId,
        actorType: 'PLAYER',
        isAdmin: false,
        cancelReason: 'Late',
      }),
    ).rejects.toThrow('Cancellation window for the student has closed');
  });

  it('blocks Ilya inside the 2-hour coach window', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-14T14:30:00.000Z'));
    await expect(
      cancelIndividualLesson({
        lessonId: 88,
        actorMemberId: ILYA.memberId,
        actorType: 'COACH',
        isAdmin: false,
      }),
    ).rejects.toThrow('Cancellation window for the coach has closed');
  });

  it('blocks Amy from cancelling Polly’s lesson', async () => {
    await expect(
      cancelIndividualLesson({
        lessonId: 88,
        actorMemberId: AMY.memberId,
        actorType: 'PLAYER',
        isAdmin: false,
        cancelReason: 'Not mine',
      }),
    ).rejects.toThrow('Not allowed to cancel this lesson');
  });

  it('cancels a pending payment without a credit', async () => {
    (prisma.clubPayment.findUnique as jest.Mock).mockResolvedValue({ id: 501, status: 'PENDING' });
    const result = await cancelIndividualLesson({
      lessonId: 88,
      actorMemberId: ILYA.memberId,
      actorType: 'COACH',
      isAdmin: false,
    });
    expect(cancelPendingLessonPayment).toHaveBeenCalledWith(501);
    expect(creditSucceededLessonPayment).not.toHaveBeenCalled();
    expect(result.creditedCents).toBe(0);
  });
});

describe('reduceIndividualLessonRate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.individualLesson.findUnique as jest.Mock).mockResolvedValue({
      id: 88,
      status: 'CONFIRMED',
      hourlyRateCents: 6000,
      durationMinutes: 90,
    });
    (prisma.individualLesson.update as jest.Mock).mockImplementation(async ({ data }) => ({ id: 88, ...data }));
  });

  it('lets Ilya lower the hourly rate and reprices the lesson', async () => {
    const updated = await reduceIndividualLessonRate({
      lessonId: 88,
      hourlyRateCents: 4000,
      actorMemberId: ILYA.memberId,
    });
    expect(updated).toMatchObject({ hourlyRateCents: 4000, priceCents: 6000 });
    expect(recordLessonLifecycle).toHaveBeenCalledWith(expect.objectContaining({ action: 'RATE_REDUCE' }));
  });

  it('does not allow a rate increase', async () => {
    await expect(
      reduceIndividualLessonRate({ lessonId: 88, hourlyRateCents: 7000, actorMemberId: ILYA.memberId }),
    ).rejects.toThrow('Rate can only be reduced');
  });
});
