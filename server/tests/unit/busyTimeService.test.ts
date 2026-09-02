jest.mock('../../src/index', () => ({
  prisma: {
    individualLesson: { findMany: jest.fn() },
    groupClassOccurrence: { findMany: jest.fn() },
    groupClassRegistration: { findMany: jest.fn() },
  },
}));

jest.mock('../../src/services/systemConfigService', () => ({
  getLessonsConfig: jest.fn(() => ({ busyBufferMinutes: 0 })),
}));

import { prisma } from '../../src/index';
import { getLessonsConfig } from '../../src/services/systemConfigService';
import {
  assertCoachAndPlayerFree,
  intervalConflicts,
  type BusyInterval,
} from '../../src/services/busyTimeService';

const ILYA_LESSON: BusyInterval = {
  id: 88,
  clubDate: '2026-09-14',
  startTime: '16:00',
  endTime: '17:00',
  kind: 'individual',
  playerFirstName: 'Polly',
  playerLastName: 'Wordlot',
};

describe('intervalConflicts', () => {
  it('ignores busy time on another day', () => {
    expect(intervalConflicts([ILYA_LESSON], '2026-09-15', '16:00', '17:00')).toBeNull();
  });

  it('allows a lesson that only touches the existing end', () => {
    expect(intervalConflicts([ILYA_LESSON], '2026-09-14', '17:00', '18:00')).toBeNull();
  });

  it('detects overlap with Polly’s private lesson on Ilya', () => {
    expect(intervalConflicts([ILYA_LESSON], '2026-09-14', '16:30', '17:30')).toEqual(ILYA_LESSON);
  });

  it('applies the busy buffer around Ilya’s lesson', () => {
    (getLessonsConfig as jest.Mock).mockReturnValue({ busyBufferMinutes: 15 });
    expect(intervalConflicts([ILYA_LESSON], '2026-09-14', '17:00', '18:00')).toEqual(ILYA_LESSON);
    expect(intervalConflicts([ILYA_LESSON], '2026-09-14', '17:15', '18:15')).toBeNull();
  });
});

describe('assertCoachAndPlayerFree', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getLessonsConfig as jest.Mock).mockReturnValue({ busyBufferMinutes: 0 });
    (prisma.individualLesson.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.groupClassOccurrence.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.groupClassRegistration.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('throws when Ilya already has Polly at that time', async () => {
    (prisma.individualLesson.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 88,
        clubDate: '2026-09-14',
        startTime: '16:00',
        endTime: '17:00',
        player: { firstName: 'Polly', lastName: 'Wordlot' },
      },
    ]);
    await expect(
      assertCoachAndPlayerFree({
        coachProfileId: 1,
        playerMemberId: 40,
        clubDate: '2026-09-14',
        startTime: '16:00',
        endTime: '17:00',
      }),
    ).rejects.toThrow('Time conflicts with an existing lesson or class for this coach');
  });

  it('throws when Polly is already in a group class', async () => {
    (prisma.individualLesson.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    (prisma.groupClassOccurrence.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.groupClassRegistration.findMany as jest.Mock).mockResolvedValue([
      {
        id: 300,
        occurrence: { clubDate: '2026-09-14', startTime: '16:00', endTime: '17:00' },
      },
    ]);
    await expect(
      assertCoachAndPlayerFree({
        coachProfileId: 2,
        playerMemberId: 30,
        clubDate: '2026-09-14',
        startTime: '16:00',
        endTime: '17:00',
      }),
    ).rejects.toThrow('Time conflicts with another lesson for this player');
  });
});
