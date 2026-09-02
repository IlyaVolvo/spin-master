jest.mock('../../src/index', () => ({
  prisma: {
    individualLesson: { findMany: jest.fn() },
    groupClassOccurrence: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    groupClassRegistration: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
    },
    groupClass: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    groupClassCoach: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    groupClassDesignee: { findUnique: jest.fn() },
    member: { findUnique: jest.fn(), findMany: jest.fn() },
    clubPayment: { findUnique: jest.fn() },
  },
}));

jest.mock('../../src/services/systemConfigService', () => ({
  CLUB_WEEKDAYS: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
  getLessonsConfig: () => ({
    busyBufferMinutes: 0,
    designatedAcceptDaysBeforeFirst: 3,
    horizonMonths: 3,
    groupDurations: { allowedMinutes: [30, 60, 90, 120], defaultMinutes: 60 },
    defaultOccurrenceDeadlineHours: 24,
    defaultFirstSessionDeadlineHours: 48,
  }),
}));

jest.mock('../../src/utils/clubHours', () => {
  const actual = jest.requireActual('../../src/utils/clubHours');
  return {
    ...actual,
    resolveHoursForClubDate: () => ({
      hours: { closed: false, open: '10:00', close: '22:00' },
      comment: null,
      source: 'weekly',
    }),
  };
});

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
  runLessonCheckout: jest.fn().mockResolvedValue({ paymentId: 701, method: 'cash' }),
  creditSucceededLessonPayment: jest.fn().mockResolvedValue(1500),
  cancelPendingLessonPayment: jest.fn(),
}));

import { prisma } from '../../src/index';
import { recordLessonLifecycle } from '../../src/services/lessonLifecycle';
import { runLessonCheckout, creditSucceededLessonPayment } from '../../src/payments/lessonPayment';
import { sendGroupCoachInviteEmail, sendGroupWaitlistPromotedEmail } from '../../src/services/mailService';
import {
  acceptCoachInvite,
  acceptDesignatedSeat,
  addReplacementCoach,
  autoCancelBelowMinOccurrences,
  cancelGroupOccurrence,
  createGroupClass,
  denyCoachInvite,
  dropGroupRegistration,
  finalizeGroupClass,
  registerForOccurrence,
} from '../../src/services/groupClassService';

const ILYA = { coachProfileId: 1, memberId: 10, firstName: 'Ilya', lastName: 'Volvovski' };
const DEMI = { coachProfileId: 2, memberId: 20, firstName: 'Demi', lastName: 'von Smash' };
const POLLY = {
  id: 30,
  firstName: 'Polly',
  lastName: 'Wordlot',
  email: 'polly@test.local',
  rating: 1200,
  birthDate: new Date('2010-01-01T00:00:00.000Z'),
  roles: ['PLAYER'],
  isActive: true,
};
const AMY = {
  id: 40,
  firstName: 'Amy',
  lastName: 'Turner',
  email: 'amy@test.local',
  rating: 1100,
  birthDate: new Date('2012-06-01T00:00:00.000Z'),
  roles: ['PLAYER'],
  isActive: true,
};

function emptyBusy() {
  (prisma.individualLesson.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.groupClassOccurrence.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.groupClassRegistration.findMany as jest.Mock).mockResolvedValue([]);
}

describe('createGroupClass', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    emptyBusy();
    (prisma.member.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.groupClass.findUnique as jest.Mock).mockResolvedValue({
      id: 1,
      title: 'Beginner clinic',
      startsOn: '2026-09-14',
      publicCode: 'abc123',
      slots: [{ weekday: 'mon', startTime: '16:00' }],
      designees: [],
      coaches: [],
    });
    (prisma.groupClass.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id: 1, status: 'ACCEPTING' });
    (prisma.groupClass.create as jest.Mock).mockImplementation(async ({ data }) => ({
      id: 1,
      publicCode: 'abc123',
      title: data.title,
      status: data.status,
      pricePerOccurrenceCents: data.pricePerOccurrenceCents,
      slots: data.slots.create,
      coaches: (data.coaches.create || []).map((row: { coachProfileId: number }, index: number) => ({
        id: index + 1,
        ...row,
        coachProfile: { member: { email: 'coach@test.local', firstName: 'Coach' } },
      })),
      occurrences: (data.occurrences.create || []).map((row: { clubDate: string }, index: number) => ({
        id: 100 + index,
        ...row,
      })),
      designees: data.designees.create || [],
    }));
  });

  it('rejects a duration that is not allowed for group classes', async () => {
    await expect(
      createGroupClass({
        creatorCoachProfileId: ILYA.coachProfileId,
        actorMemberId: ILYA.memberId,
        title: 'Beginner clinic',
        durationMinutes: 45,
        pricePerOccurrenceCents: 1500,
        minParticipants: 2,
        maxParticipants: 4,
        startsOn: '2026-09-14',
        slots: [{ weekday: 'mon', startTime: '16:00' }],
      }),
    ).rejects.toThrow('Duration is not allowed for group classes');
  });

  it('rejects two slots on the same weekday', async () => {
    await expect(
      createGroupClass({
        creatorCoachProfileId: ILYA.coachProfileId,
        actorMemberId: ILYA.memberId,
        title: 'Beginner clinic',
        durationMinutes: 60,
        pricePerOccurrenceCents: 1500,
        minParticipants: 2,
        maxParticipants: 4,
        startsOn: '2026-09-14',
        slots: [
          { weekday: 'mon', startTime: '16:00' },
          { weekday: 'mon', startTime: '18:00' },
        ],
      }),
    ).rejects.toThrow('At most one class time per day');
  });

  it('rejects a repeat other than every 1 or 2 weeks', async () => {
    await expect(
      createGroupClass({
        creatorCoachProfileId: ILYA.coachProfileId,
        actorMemberId: ILYA.memberId,
        title: 'Beginner clinic',
        durationMinutes: 60,
        pricePerOccurrenceCents: 1500,
        minParticipants: 2,
        maxParticipants: 4,
        intervalWeeks: 3,
        startsOn: '2026-09-14',
        slots: [{ weekday: 'mon', startTime: '16:00' }],
      }),
    ).rejects.toThrow('Group classes repeat every 1 or 2 weeks');
  });

  it('opens immediately as ACCEPTING when Ilya creates without inviting Demi', async () => {
    await createGroupClass({
      creatorCoachProfileId: ILYA.coachProfileId,
      actorMemberId: ILYA.memberId,
      title: 'Beginner clinic',
      durationMinutes: 60,
      pricePerOccurrenceCents: 1500,
      minParticipants: 2,
      maxParticipants: 4,
      startsOn: '2026-09-14',
      durationWeeks: 1,
      slots: [{ weekday: 'mon', startTime: '16:00' }],
    });
    expect(prisma.groupClass.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'ACCEPTING',
          creatorCoachProfileId: ILYA.coachProfileId,
        }),
      }),
    );
    expect(sendGroupCoachInviteEmail).not.toHaveBeenCalled();
    expect(recordLessonLifecycle).toHaveBeenCalledWith(expect.objectContaining({ action: 'CLASS_CREATE' }));
  });

  it('stays PENDING and emails Demi when Ilya invites her', async () => {
    (prisma.groupClass.findUnique as jest.Mock).mockResolvedValue({
      id: 1,
      title: 'Beginner clinic',
      startsOn: '2026-09-14',
      publicCode: 'abc123',
      slots: [{ weekday: 'mon', startTime: '16:00' }],
      coaches: [
        {
          id: 2,
          inviteToken: 'token-demi',
          coachProfile: { member: { email: 'demi@test.local', firstName: 'Demi' } },
        },
      ],
    });
    await createGroupClass({
      creatorCoachProfileId: ILYA.coachProfileId,
      actorMemberId: ILYA.memberId,
      title: 'Beginner clinic',
      durationMinutes: 60,
      pricePerOccurrenceCents: 1500,
      minParticipants: 2,
      maxParticipants: 4,
      startsOn: '2026-09-14',
      durationWeeks: 1,
      slots: [{ weekday: 'mon', startTime: '16:00' }],
      additionalCoachProfileIds: [DEMI.coachProfileId],
    });
    const created = (prisma.groupClass.create as jest.Mock).mock.calls[0][0].data;
    expect(created.status).toBe('PENDING');
    expect(created.coaches.create).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ coachProfileId: ILYA.coachProfileId, inviteStatus: 'ACCEPTED' }),
        expect.objectContaining({ coachProfileId: DEMI.coachProfileId, inviteStatus: 'INVITED' }),
      ]),
    );
    expect(sendGroupCoachInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({ toEmail: 'demi@test.local', firstName: 'Demi' }),
    );
  });

  it('cannot designate more players than maxParticipants', async () => {
    (prisma.member.findMany as jest.Mock).mockResolvedValue([POLLY, AMY]);
    await expect(
      createGroupClass({
        creatorCoachProfileId: ILYA.coachProfileId,
        actorMemberId: ILYA.memberId,
        title: 'Beginner clinic',
        durationMinutes: 60,
        pricePerOccurrenceCents: 1500,
        minParticipants: 1,
        maxParticipants: 1,
        startsOn: '2026-09-14',
        durationWeeks: 1,
        slots: [{ weekday: 'mon', startTime: '16:00' }],
        designeeMemberIds: [POLLY.id, AMY.id],
      }),
    ).rejects.toThrow('Cannot designate more players than the class maximum');
  });
});

describe('coach invites', () => {
  const inviteRow = {
    id: 22,
    classId: 1,
    coachProfileId: DEMI.coachProfileId,
    inviteStatus: 'INVITED',
    coachProfile: { memberId: DEMI.memberId },
    groupClass: { id: 1, status: 'PENDING' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    emptyBusy();
    (prisma.groupClassCoach.findUnique as jest.Mock).mockResolvedValue(inviteRow);
    (prisma.groupClassCoach.update as jest.Mock).mockResolvedValue({ ...inviteRow, inviteStatus: 'ACCEPTED' });
    (prisma.groupClassCoach.count as jest.Mock).mockResolvedValue(0);
    (prisma.groupClass.findUnique as jest.Mock).mockResolvedValue({ id: 1, status: 'PENDING', slots: [], designees: [] });
    (prisma.groupClass.update as jest.Mock).mockResolvedValue({ id: 1, status: 'ACCEPTING' });
    (prisma.groupClass.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id: 1, status: 'ACCEPTING' });
    (prisma.member.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('lets Demi accept Ilya’s invite and opens the class', async () => {
    await acceptCoachInvite({ coachRowId: 22, actorMemberId: DEMI.memberId });
    expect(prisma.groupClassCoach.update).toHaveBeenCalledWith({
      where: { id: 22 },
      data: expect.objectContaining({ inviteStatus: 'ACCEPTED' }),
    });
    expect(prisma.groupClass.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'ACCEPTING' },
    });
    expect(recordLessonLifecycle).toHaveBeenCalledWith(expect.objectContaining({ action: 'CLASS_INVITE_ACCEPT' }));
  });

  it('rejects Ilya accepting Demi’s invite', async () => {
    await expect(acceptCoachInvite({ coachRowId: 22, actorMemberId: ILYA.memberId })).rejects.toThrow(
      'Not your invitation',
    );
  });

  it('lets Demi deny and still opens the class once no invites remain', async () => {
    await denyCoachInvite({ coachRowId: 22, actorMemberId: DEMI.memberId });
    expect(prisma.groupClassCoach.update).toHaveBeenCalledWith({
      where: { id: 22 },
      data: expect.objectContaining({ inviteStatus: 'DECLINED' }),
    });
    expect(prisma.groupClass.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'ACCEPTING' },
    });
  });

  it('lets Ilya finalize remaining invites as declined', async () => {
    (prisma.groupClass.findUnique as jest.Mock).mockResolvedValue({
      id: 1,
      status: 'PENDING',
      creatorCoachProfileId: ILYA.coachProfileId,
      coaches: [inviteRow],
      slots: [],
      designees: [],
    });
    await finalizeGroupClass({
      classId: 1,
      actorMemberId: ILYA.memberId,
      actorCoachProfileId: ILYA.coachProfileId,
      isAdmin: false,
    });
    expect(prisma.groupClassCoach.updateMany).toHaveBeenCalledWith({
      where: { classId: 1, inviteStatus: 'INVITED' },
      data: expect.objectContaining({ inviteStatus: 'DECLINED' }),
    });
    expect(recordLessonLifecycle).toHaveBeenCalledWith(expect.objectContaining({ action: 'CLASS_FINALIZE' }));
  });

  it('blocks Demi from finalizing Ilya’s class', async () => {
    (prisma.groupClass.findUnique as jest.Mock).mockResolvedValue({
      id: 1,
      status: 'PENDING',
      creatorCoachProfileId: ILYA.coachProfileId,
      coaches: [],
    });
    await expect(
      finalizeGroupClass({
        classId: 1,
        actorMemberId: DEMI.memberId,
        actorCoachProfileId: DEMI.coachProfileId,
        isAdmin: false,
      }),
    ).rejects.toThrow('Only the creator can finalize this class');
  });

  it('lets Ilya invite Demi as a replacement while PENDING', async () => {
    (prisma.groupClass.findUnique as jest.Mock)
      .mockResolvedValueOnce({
        id: 1,
        status: 'PENDING',
        creatorCoachProfileId: ILYA.coachProfileId,
        coaches: [{ coachProfileId: ILYA.coachProfileId, inviteStatus: 'ACCEPTED' }],
      })
      .mockResolvedValueOnce({
        id: 1,
        title: 'Beginner clinic',
        startsOn: '2026-09-14',
        slots: [{ weekday: 'mon', startTime: '16:00' }],
        coaches: [
          {
            id: 9,
            inviteToken: 'new-token',
            coachProfile: { member: { email: 'demi@test.local', firstName: 'Demi' } },
          },
        ],
      });
    (prisma.groupClassCoach.create as jest.Mock).mockResolvedValue({ id: 9 });
    (prisma.groupClass.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id: 1 });
    await addReplacementCoach({
      classId: 1,
      coachProfileId: DEMI.coachProfileId,
      actorMemberId: ILYA.memberId,
      actorCoachProfileId: ILYA.coachProfileId,
      isAdmin: false,
    });
    expect(prisma.groupClassCoach.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          classId: 1,
          coachProfileId: DEMI.coachProfileId,
          inviteStatus: 'INVITED',
        }),
      }),
    );
  });
});

function acceptingOccurrence(overrides: Record<string, unknown> = {}) {
  return {
    id: 100,
    cancelled: false,
    clubDate: '2026-09-14',
    startTime: '16:00',
    endTime: '17:00',
    registrations: [],
    groupClass: {
      id: 1,
      title: 'Beginner clinic',
      status: 'ACCEPTING',
      pricePerOccurrenceCents: 1500,
      minParticipants: 2,
      maxParticipants: 2,
      ratingMin: null,
      ratingMax: null,
      ageMin: null,
      ageMax: null,
      occurrenceDeadlineHours: 24,
      creatorCoachProfileId: ILYA.coachProfileId,
      coaches: [{ coachProfileId: ILYA.coachProfileId, inviteStatus: 'ACCEPTED' }],
      designees: [],
    },
    ...overrides,
  };
}

describe('registerForOccurrence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    emptyBusy();
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-10T16:00:00.000Z'));
    (prisma.groupClassOccurrence.findUnique as jest.Mock).mockResolvedValue(acceptingOccurrence());
    (prisma.member.findUnique as jest.Mock).mockResolvedValue(POLLY);
    (prisma.groupClassRegistration.create as jest.Mock).mockResolvedValue({
      id: 300,
      memberId: POLLY.id,
      status: 'ACCEPTED',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('lets Polly take an open seat and starts checkout', async () => {
    const result = await registerForOccurrence({
      occurrenceId: 100,
      playerMemberId: POLLY.id,
      actorMemberId: POLLY.id,
      actorType: 'PLAYER',
      initiatedBy: 'MEMBER',
    });
    expect(result).toEqual(expect.objectContaining({ status: 'ACCEPTED' }));
    expect(runLessonCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        memberId: POLLY.id,
        product: expect.objectContaining({ kind: 'lesson_group' }),
      }),
    );
    expect(recordLessonLifecycle).toHaveBeenCalledWith(expect.objectContaining({ action: 'REGISTER' }));
  });

  it('waitlists Amy when the class is full', async () => {
    (prisma.groupClassOccurrence.findUnique as jest.Mock).mockResolvedValue(
      acceptingOccurrence({
        registrations: [{ memberId: POLLY.id, status: 'ACCEPTED' }, { memberId: 99, status: 'ACCEPTED' }],
      }),
    );
    (prisma.member.findUnique as jest.Mock).mockResolvedValue(AMY);
    (prisma.groupClassRegistration.create as jest.Mock).mockResolvedValue({
      id: 301,
      memberId: AMY.id,
      status: 'WAITING',
    });
    const result = await registerForOccurrence({
      occurrenceId: 100,
      playerMemberId: AMY.id,
      actorMemberId: AMY.id,
      actorType: 'PLAYER',
      waitlistIfFull: true,
      initiatedBy: 'MEMBER',
    });
    expect(result).toEqual(expect.objectContaining({ status: 'WAITING' }));
    expect(runLessonCheckout).not.toHaveBeenCalled();
    expect(recordLessonLifecycle).toHaveBeenCalledWith(expect.objectContaining({ action: 'WAITLIST' }));
  });

  it('rejects registration while the class is still PENDING', async () => {
    (prisma.groupClassOccurrence.findUnique as jest.Mock).mockResolvedValue(
      acceptingOccurrence({
        groupClass: {
          ...acceptingOccurrence().groupClass,
          status: 'PENDING',
        },
      }),
    );
    await expect(
      registerForOccurrence({
        occurrenceId: 100,
        playerMemberId: POLLY.id,
        actorMemberId: POLLY.id,
        actorType: 'PLAYER',
        initiatedBy: 'MEMBER',
      }),
    ).rejects.toThrow('This class is not open for registration yet');
  });

  it('routes Polly from a designated PENDING hold to acceptDesignatedSeat', async () => {
    (prisma.groupClassOccurrence.findUnique as jest.Mock).mockResolvedValue(
      acceptingOccurrence({
        registrations: [{ id: 300, memberId: POLLY.id, status: 'PENDING' }],
        groupClass: {
          ...acceptingOccurrence().groupClass,
          designees: [{ memberId: POLLY.id }],
        },
      }),
    );
    (prisma.groupClassDesignee.findUnique as jest.Mock).mockResolvedValue({
      memberId: POLLY.id,
      classId: 1,
      groupClass: { title: 'Beginner clinic', pricePerOccurrenceCents: 1500, creatorCoachProfileId: ILYA.coachProfileId },
      member: POLLY,
    });
    (prisma.groupClassRegistration.findMany as jest.Mock).mockResolvedValue([
      { id: 300, occurrenceId: 100, occurrence: { clubDate: '2026-09-14', startTime: '16:00' } },
    ]);
    (prisma.groupClassRegistration.update as jest.Mock).mockResolvedValue({ id: 300, status: 'ACCEPTED' });
    const result = await registerForOccurrence({
      occurrenceId: 100,
      playerMemberId: POLLY.id,
      actorMemberId: POLLY.id,
      actorType: 'PLAYER',
      initiatedBy: 'MEMBER',
    });
    expect(result).toEqual(expect.objectContaining({ accepted: 1 }));
    expect(prisma.groupClassRegistration.update).toHaveBeenCalledWith({
      where: { id: 300 },
      data: { status: 'ACCEPTED', waitlistPosition: null },
    });
  });
});

describe('acceptDesignatedSeat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.groupClassDesignee.findUnique as jest.Mock).mockResolvedValue({
      memberId: POLLY.id,
      classId: 1,
      groupClass: { title: 'Beginner clinic', pricePerOccurrenceCents: 1500, creatorCoachProfileId: ILYA.coachProfileId },
      member: POLLY,
    });
    (prisma.groupClassRegistration.findMany as jest.Mock).mockResolvedValue([
      { id: 300, occurrenceId: 100, occurrence: { clubDate: '2026-09-14', startTime: '16:00' } },
    ]);
    (prisma.groupClassRegistration.update as jest.Mock).mockResolvedValue({ id: 300, status: 'ACCEPTED' });
  });

  it('blocks Amy from accepting Polly’s reserved seat', async () => {
    await expect(
      acceptDesignatedSeat({ classId: 1, actorMemberId: AMY.id, initiatedBy: 'MEMBER' }),
    ).rejects.toThrow('Not your reserved seat');
  });
});

describe('dropGroupRegistration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    emptyBusy();
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-10T16:00:00.000Z'));
    (prisma.groupClassRegistration.findUnique as jest.Mock).mockResolvedValue({
      id: 300,
      memberId: POLLY.id,
      status: 'ACCEPTED',
      paymentId: 701,
      occurrence: {
        id: 100,
        clubDate: '2026-09-14',
        startTime: '16:00',
        groupClass: {
          occurrenceDeadlineHours: 24,
          maxParticipants: 2,
          pricePerOccurrenceCents: 1500,
          title: 'Beginner clinic',
          creatorCoachProfileId: ILYA.coachProfileId,
        },
      },
    });
    (prisma.clubPayment.findUnique as jest.Mock).mockResolvedValue({ id: 701, status: 'SUCCEEDED' });
    (prisma.groupClassRegistration.update as jest.Mock).mockResolvedValue({ id: 300, status: 'DROPPED' });
    (prisma.groupClassOccurrence.findUnique as jest.Mock).mockResolvedValue({
      id: 100,
      clubDate: '2026-09-14',
      startTime: '16:00',
      groupClass: {
        maxParticipants: 2,
        pricePerOccurrenceCents: 1500,
        title: 'Beginner clinic',
        ratingMin: null,
        ratingMax: null,
        ageMin: null,
        ageMax: null,
      },
      registrations: [{ id: 301, memberId: AMY.id, status: 'WAITING', member: AMY, waitlistPosition: 1 }],
    });
    (prisma.groupClassRegistration.count as jest.Mock).mockResolvedValue(0);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('credits Polly and promotes Amy from the waitlist', async () => {
    await dropGroupRegistration({
      registrationId: 300,
      actorMemberId: POLLY.id,
      actorType: 'PLAYER',
      isAdmin: false,
    });
    expect(creditSucceededLessonPayment).toHaveBeenCalledWith(701);
    expect(prisma.groupClassRegistration.update).toHaveBeenCalledWith({
      where: { id: 301 },
      data: { status: 'ACCEPTED', waitlistPosition: null },
    });
    expect(sendGroupWaitlistPromotedEmail).toHaveBeenCalledWith(expect.objectContaining({ firstName: 'Amy' }));
    expect(recordLessonLifecycle).toHaveBeenCalledWith(expect.objectContaining({ action: 'PROMOTE' }));
  });

  it('blocks Polly after the occurrence deadline', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-13T16:00:01.000Z'));
    await expect(
      dropGroupRegistration({
        registrationId: 300,
        actorMemberId: POLLY.id,
        actorType: 'PLAYER',
        isAdmin: false,
      }),
    ).rejects.toThrow('Cancellation deadline has passed');
  });
});

describe('cancelGroupOccurrence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.groupClassOccurrence.findUnique as jest.Mock).mockResolvedValue({
      id: 100,
      cancelled: false,
      clubDate: '2026-09-14',
      startTime: '16:00',
      groupClass: { title: 'Beginner clinic', creatorCoachProfileId: ILYA.coachProfileId },
      registrations: [
        { id: 300, status: 'ACCEPTED', paymentId: 701, member: { email: POLLY.email, firstName: POLLY.firstName } },
      ],
    });
    (prisma.clubPayment.findUnique as jest.Mock).mockResolvedValue({ id: 701, status: 'SUCCEEDED' });
    (prisma.groupClassOccurrence.update as jest.Mock).mockResolvedValue({ cancelled: true });
    (prisma.groupClassRegistration.update as jest.Mock).mockResolvedValue({ status: 'DROPPED' });
  });

  it('lets Ilya cancel and refunds Polly', async () => {
    await cancelGroupOccurrence({
      occurrenceId: 100,
      actorMemberId: ILYA.memberId,
      isAdmin: false,
      actorCoachProfileId: ILYA.coachProfileId,
    });
    expect(prisma.groupClassOccurrence.update).toHaveBeenCalledWith({
      where: { id: 100 },
      data: { cancelled: true },
    });
    expect(creditSucceededLessonPayment).toHaveBeenCalledWith(701);
  });

  it('blocks Demi from cancelling Ilya’s class time', async () => {
    await expect(
      cancelGroupOccurrence({
        occurrenceId: 100,
        actorMemberId: DEMI.memberId,
        isAdmin: false,
        actorCoachProfileId: DEMI.coachProfileId,
      }),
    ).rejects.toThrow('Only the creator or an admin can cancel this class time');
  });
});

describe('autoCancelBelowMinOccurrences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-13T16:00:00.000Z'));
    (prisma.groupClassOccurrence.findMany as jest.Mock).mockResolvedValue([
      {
        id: 100,
        cancelled: false,
        clubDate: '2026-09-14',
        startTime: '16:00',
        endTime: '17:00',
        groupClass: { minParticipants: 2, occurrenceDeadlineHours: 24, title: 'Beginner clinic', creatorCoachProfileId: ILYA.coachProfileId },
        registrations: [{ status: 'ACCEPTED' }],
      },
    ]);
    (prisma.groupClassOccurrence.findUnique as jest.Mock).mockResolvedValue({
      id: 100,
      cancelled: false,
      clubDate: '2026-09-14',
      startTime: '16:00',
      groupClass: { title: 'Beginner clinic', creatorCoachProfileId: ILYA.coachProfileId },
      registrations: [],
    });
    (prisma.groupClassOccurrence.update as jest.Mock).mockResolvedValue({ cancelled: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('cancels Ilya’s class when only Polly is accepted at the deadline', async () => {
    const result = await autoCancelBelowMinOccurrences();
    expect(result.cancelled).toBe(1);
    expect(recordLessonLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CLASS_AUTO_CANCEL', actorType: 'SYSTEM' }),
    );
  });

  it('leaves the class when min is met', async () => {
    (prisma.groupClassOccurrence.findMany as jest.Mock).mockResolvedValue([
      {
        id: 100,
        cancelled: false,
        clubDate: '2026-09-14',
        startTime: '16:00',
        endTime: '17:00',
        groupClass: { minParticipants: 2, occurrenceDeadlineHours: 24 },
        registrations: [{ status: 'ACCEPTED' }, { status: 'ACCEPTED' }],
      },
    ]);
    const result = await autoCancelBelowMinOccurrences();
    expect(result.cancelled).toBe(0);
  });
});
