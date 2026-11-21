import {
  parseClubArchive,
  buildClubArchive,
  importClubArchive,
} from '../../src/services/clubArchiveService';
import { CLUB_ARCHIVE_VERSION, type ClubArchiveDocument } from '../../src/services/clubArchiveTypes';

function sampleArchive(): ClubArchiveDocument {
  return {
    version: 1,
    exportedAt: '2026-07-29T12:00:00.000Z',
    members: [
      {
        id: 10,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        gender: 'FEMALE',
        birthDate: '1815-12-10',
        roles: ['PLAYER'],
        rating: 1500,
        phone: null,
        address: null,
        isActive: true,
        tournamentNotificationsEnabled: false,
        autoRelinquishPrivileges: null,
      },
      {
        id: 11,
        firstName: 'Alan',
        lastName: 'Turing',
        email: 'alan@example.com',
        gender: 'MALE',
        birthDate: null,
        roles: ['PLAYER', 'ORGANIZER'],
        rating: 1600,
        phone: '555',
        address: null,
        isActive: true,
        tournamentNotificationsEnabled: true,
        autoRelinquishPrivileges: false,
      },
    ],
    standaloneMatches: [
      {
        id: 100,
        member1Id: 10,
        member2Id: 11,
        player1Sets: 3,
        player2Sets: 1,
        player1Forfeit: false,
        player2Forfeit: false,
        notPlayed: false,
        createdAt: '2026-01-01T10:00:00.000Z',
      },
    ],
    tournaments: [
      {
        id: 1,
        name: 'Club RR',
        type: 'ROUND_ROBIN',
        status: 'COMPLETED',
        cancelled: false,
        createdAt: null,
        recordedAt: null,
        tournamentDate: '2026-02-01T00:00:00.000Z',
        minRating: null,
        maxRating: null,
        maxParticipants: null,
        groupNumber: null,
        participants: [
          { memberId: 10, playerRatingAtTime: 1480 },
          { memberId: 11, playerRatingAtTime: 1580 },
        ],
        matches: [
          {
            id: 50,
            member1Id: 10,
            member2Id: 11,
            player1Sets: 3,
            player2Sets: 2,
            player1Forfeit: false,
            player2Forfeit: false,
            notPlayed: false,
            round: null,
          },
        ],
        bracketMatches: [],
        swissData: null,
        preliminaryConfig: null,
        children: [],
      },
    ],
    ratingHistory: [],
    pointExchangeRules: [],
  };
}

function sampleV2Archive(): ClubArchiveDocument {
  const archive = sampleArchive();
  archive.version = 2;
  archive.tournaments[0].status = 'ACTIVE';
  archive.tournaments[0].createdAt = '2026-02-01T08:00:00.000Z';
  archive.tournaments[0].recordedAt = '2026-02-01T18:00:00.000Z';
  archive.tournaments[0].matches[0].createdAt = '2026-02-01T12:00:00.000Z';
  archive.tournaments[0].matches[0].updatedAt = '2026-02-01T12:05:00.000Z';
  archive.tournaments[0].children = [
    {
      id: 2,
      name: 'Final',
      type: 'PLAYOFF',
      status: 'COMPLETED',
      cancelled: false,
      createdAt: '2026-02-02T08:00:00.000Z',
      recordedAt: '2026-02-02T18:00:00.000Z',
      tournamentDate: null,
      minRating: null,
      maxRating: null,
      maxParticipants: null,
      groupNumber: 1,
      participants: [],
      matches: [],
      bracketMatches: [],
      swissData: null,
      preliminaryConfig: {
        finalSize: 4,
        autoQualifiedCount: 1,
        autoQualifiedMemberIds: [10],
        qualifiersPerGroup: 2,
      },
      children: [],
    },
  ];
  archive.ratingHistory = [
    {
      memberId: 10,
      rating: 1400,
      ratingChange: null,
      timestamp: '2026-01-01T00:00:00.000Z',
      reason: 'INITIAL_RATING',
      tournamentId: null,
      matchId: null,
    },
    {
      memberId: 10,
      rating: 1508,
      ratingChange: 8,
      timestamp: '2026-02-01T12:05:00.000Z',
      reason: 'MATCH_COMPLETED',
      tournamentId: 1,
      matchId: 50,
    },
    {
      memberId: 11,
      rating: 1590,
      ratingChange: -10,
      timestamp: '2026-02-01T12:05:00.000Z',
      reason: 'RESULT_CORRECTED',
      tournamentId: 1,
      matchId: 50,
    },
  ];
  archive.pointExchangeRules = [
    {
      minDiff: 0,
      maxDiff: 12,
      expectedPoints: 8,
      upsetPoints: 8,
      effectiveFrom: '2020-01-01T00:00:00.000Z',
    },
  ];
  return archive;
}

function withTransaction(prisma: any) {
  prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
  return prisma;
}

describe('clubArchiveService parseClubArchive', () => {
  it('accepts a valid v1 archive', () => {
    const parsed = parseClubArchive(sampleArchive());
    expect(parsed.version).toBe(1);
    expect(parsed.members).toHaveLength(2);
    expect(parsed.tournaments[0].matches).toHaveLength(1);
    expect(parsed.standaloneMatches).toHaveLength(1);
    expect(parsed.ratingHistory).toEqual([]);
    expect(parsed.pointExchangeRules).toEqual([]);
  });

  it('accepts a v2 archive with active tournaments and rating history', () => {
    const parsed = parseClubArchive(sampleV2Archive());
    expect(parsed.version).toBe(2);
    expect(parsed.tournaments[0].status).toBe('ACTIVE');
    expect(parsed.tournaments[0].children[0].preliminaryConfig?.qualifiersPerGroup).toBe(2);
    expect(parsed.ratingHistory).toHaveLength(3);
    expect(parsed.pointExchangeRules).toHaveLength(1);
  });

  it('rejects wrong version', () => {
    expect(() => parseClubArchive({ ...sampleArchive(), version: 99 })).toThrow(/version/i);
  });

  it('rejects non-completed tournament status on v1', () => {
    const bad = sampleArchive();
    (bad.tournaments[0] as any).status = 'ACTIVE';
    expect(() => parseClubArchive(bad)).toThrow(/COMPLETED/);
  });

  it('rejects a v2 archive without rating history', () => {
    const bad = sampleV2Archive() as any;
    delete bad.ratingHistory;
    expect(() => parseClubArchive(bad)).toThrow(/ratingHistory/);
  });

  it('rejects invalid member roles', () => {
    const bad = sampleArchive();
    (bad.members[0] as any).roles = ['SUPERUSER'];
    expect(() => parseClubArchive(bad)).toThrow(/roles/i);
  });
});

describe('clubArchiveService build/import with prisma mock', () => {
  it('buildClubArchive exports every tournament, history, and point-exchange rules', async () => {
    const createdAt = new Date('2026-03-01T00:00:00.000Z');
    const recordedAt = new Date('2026-03-02T00:00:00.000Z');
    const prisma: any = {
      member: {
        findMany: jest.fn(async () => [
          {
            id: 1,
            firstName: 'A',
            lastName: 'B',
            email: null,
            gender: 'NOT_SPECIFIED',
            birthDate: null,
            roles: ['PLAYER'],
            rating: 1200,
            phone: null,
            address: null,
            isActive: true,
            tournamentNotificationsEnabled: false,
            autoRelinquishPrivileges: null,
          },
        ]),
      },
      tournament: {
        findMany: jest.fn(async () => [
          {
            id: 5,
            parentTournamentId: null,
            name: 'Open',
            type: 'ROUND_ROBIN',
            status: 'ACTIVE',
            cancelled: false,
            createdAt,
            recordedAt,
            tournamentDate: createdAt,
            minRating: null,
            maxRating: null,
            maxParticipants: null,
            groupNumber: null,
            participants: [{ memberId: 1, playerRatingAtTime: 1200 }],
            matches: [
              {
                id: 9,
                member1Id: 1,
                member2Id: 1,
                player1Sets: 0,
                player2Sets: 0,
                player1Forfeit: false,
                player2Forfeit: false,
                notPlayed: true,
                round: null,
                createdAt,
                updatedAt: recordedAt,
              },
            ],
            bracketMatches: [],
            swissData: null,
            preliminaryConfig: null,
          },
          {
            id: 6,
            parentTournamentId: 5,
            name: 'Group',
            type: 'ROUND_ROBIN',
            status: 'COMPLETED',
            cancelled: false,
            createdAt,
            recordedAt,
            tournamentDate: null,
            minRating: null,
            maxRating: null,
            maxParticipants: null,
            groupNumber: 1,
            participants: [],
            matches: [],
            bracketMatches: [],
            swissData: null,
            preliminaryConfig: {
              finalSize: 8,
              autoQualifiedCount: 0,
              autoQualifiedMemberIds: [],
              qualifiersPerGroup: 3,
            },
          },
        ]),
      },
      match: {
        findMany: jest.fn(async () => []),
      },
      ratingHistory: {
        findMany: jest.fn(async () => [
          {
            memberId: 1,
            rating: 1200,
            ratingChange: null,
            timestamp: createdAt,
            reason: 'INITIAL_RATING',
            tournamentId: null,
            matchId: null,
          },
        ]),
      },
      pointExchangeRule: {
        findMany: jest.fn(async () => [
          {
            minDiff: 0,
            maxDiff: 12,
            expectedPoints: 8,
            upsetPoints: 8,
            effectiveFrom: createdAt,
          },
        ]),
      },
    };

    const archive = await buildClubArchive(prisma);
    expect(archive.version).toBe(CLUB_ARCHIVE_VERSION);
    expect(archive.version).toBe(2);
    expect(archive.members[0].rating).toBe(1200);
    expect(archive.tournaments).toHaveLength(1);
    expect(archive.tournaments[0].name).toBe('Open');
    expect(archive.tournaments[0].status).toBe('ACTIVE');
    expect(archive.tournaments[0].createdAt).toBe(createdAt.toISOString());
    expect(archive.tournaments[0].children).toHaveLength(1);
    expect(archive.tournaments[0].children[0].preliminaryConfig?.qualifiersPerGroup).toBe(3);
    expect(archive.tournaments[0].matches[0].updatedAt).toBe(recordedAt.toISOString());
    expect(archive.ratingHistory).toHaveLength(1);
    expect(archive.pointExchangeRules[0].expectedPoints).toBe(8);
    expect(prisma.tournament.findMany.mock.calls[0][0].where).toBeUndefined();
  });

  it('importClubArchive rejects when tournaments already exist', async () => {
    const prisma = withTransaction({
      tournament: { count: jest.fn(async () => 1) },
      match: { count: jest.fn(async () => 0) },
    });
    await expect(importClubArchive(prisma, sampleArchive())).rejects.toThrow(/empty/i);
  });

  it('importClubArchive v1 creates members, tournament, and trusted rating history', async () => {
    const createdMembers: any[] = [];
    const ratingHistory: any[] = [];
    const createdTournaments: any[] = [];
    const createdMatches: any[] = [];
    const createdParticipants: any[] = [];
    let nextMemberId = 100;
    let nextTournamentId = 200;
    let nextMatchId = 300;

    const prisma = withTransaction({
      tournament: {
        count: jest.fn(async () => 0),
        create: jest.fn(async ({ data }: any) => {
          const row = { id: nextTournamentId++, ...data };
          createdTournaments.push(row);
          return row;
        }),
      },
      match: {
        count: jest.fn(async () => 0),
        create: jest.fn(async ({ data }: any) => {
          const row = { id: nextMatchId++, ...data };
          createdMatches.push(row);
          return row;
        }),
      },
      member: {
        findMany: jest.fn(async () => []),
        create: jest.fn(async ({ data }: any) => {
          const row = { id: nextMemberId++, ...data };
          createdMembers.push(row);
          return row;
        }),
        update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
      },
      ratingHistory: {
        deleteMany: jest.fn(async () => ({ count: 0 })),
        create: jest.fn(async ({ data }: any) => {
          ratingHistory.push(data);
          return data;
        }),
      },
      tournamentParticipant: {
        createMany: jest.fn(async ({ data }: any) => {
          createdParticipants.push(...data);
          return { count: data.length };
        }),
      },
      swissTournamentData: { create: jest.fn() },
      preliminaryConfig: { create: jest.fn() },
      bracketMatch: { create: jest.fn(), update: jest.fn() },
      pointExchangeRule: { deleteMany: jest.fn(), createMany: jest.fn() },
    });

    const result = await importClubArchive(prisma, sampleArchive());
    expect(result.membersCreated).toBe(2);
    expect(result.membersUpdated).toBe(0);
    expect(result.tournamentsCreated).toBe(1);
    expect(result.matchesCreated).toBe(1);
    expect(result.standaloneMatchesCreated).toBe(1);
    expect(result.ratingHistoryCreated).toBe(2);
    expect(createdMembers).toHaveLength(2);
    expect(ratingHistory.every((h) => h.reason === 'INITIAL_RATING')).toBe(true);
    expect(ratingHistory.map((h) => h.rating).sort()).toEqual([1500, 1600]);
    expect(createdParticipants).toHaveLength(2);
    expect(createdMatches.filter((m) => m.tournamentId != null)).toHaveLength(1);
    expect(createdMatches.filter((m) => m.tournamentId == null)).toHaveLength(1);
    expect(prisma.pointExchangeRule.deleteMany).not.toHaveBeenCalled();
  });

  it('importClubArchive v2 remaps rating history and keeps tournament status', async () => {
    const ratingHistory: any[] = [];
    const createdTournaments: any[] = [];
    const createdMatches: any[] = [];
    const preliminaryConfigs: any[] = [];
    let nextMemberId = 100;
    let nextTournamentId = 200;
    let nextMatchId = 300;

    const prisma = withTransaction({
      tournament: {
        count: jest.fn(async () => 0),
        create: jest.fn(async ({ data }: any) => {
          const row = { id: nextTournamentId++, ...data };
          createdTournaments.push(row);
          return row;
        }),
      },
      match: {
        count: jest.fn(async () => 0),
        create: jest.fn(async ({ data }: any) => {
          const row = { id: nextMatchId++, ...data };
          createdMatches.push(row);
          return row;
        }),
      },
      member: {
        findMany: jest.fn(async () => [{ id: 7, email: 'ada@example.com' }]),
        create: jest.fn(async ({ data }: any) => ({ id: nextMemberId++, ...data })),
        update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
      },
      ratingHistory: {
        deleteMany: jest.fn(async () => ({ count: 1 })),
        create: jest.fn(async ({ data }: any) => {
          ratingHistory.push(data);
          return data;
        }),
      },
      tournamentParticipant: {
        createMany: jest.fn(async () => ({ count: 2 })),
      },
      swissTournamentData: { create: jest.fn() },
      preliminaryConfig: {
        create: jest.fn(async ({ data }: any) => {
          preliminaryConfigs.push(data);
          return data;
        }),
      },
      bracketMatch: { create: jest.fn(), update: jest.fn() },
      pointExchangeRule: {
        deleteMany: jest.fn(async () => ({ count: 1 })),
        createMany: jest.fn(async ({ data }: any) => ({ count: data.length })),
      },
    });

    const result = await importClubArchive(prisma, sampleV2Archive());
    expect(result.membersCreated).toBe(1);
    expect(result.membersUpdated).toBe(1);
    expect(result.tournamentsCreated).toBe(2);
    expect(result.ratingHistoryCreated).toBe(3);
    expect(createdTournaments[0].status).toBe('ACTIVE');
    expect(createdTournaments[0].createdAt?.toISOString()).toBe('2026-02-01T08:00:00.000Z');
    expect(createdTournaments[0].recordedAt?.toISOString()).toBe('2026-02-01T18:00:00.000Z');
    expect(createdMatches[0].updatedAt?.toISOString()).toBe('2026-02-01T12:05:00.000Z');
    expect(preliminaryConfigs[0].qualifiersPerGroup).toBe(2);
    expect(preliminaryConfigs[0].autoQualifiedMemberIds).toEqual([7]);
    expect(prisma.ratingHistory.deleteMany).toHaveBeenCalledWith({ where: { memberId: 7 } });
    expect(ratingHistory.map((row) => row.reason)).toEqual([
      'INITIAL_RATING',
      'MATCH_COMPLETED',
      'RESULT_CORRECTED',
    ]);
    expect(ratingHistory[0].memberId).toBe(7);
    expect(ratingHistory[1].memberId).toBe(7);
    expect(ratingHistory[1].tournamentId).toBe(createdTournaments[0].id);
    expect(ratingHistory[1].matchId).toBe(createdMatches[0].id);
    expect(ratingHistory[1].timestamp.toISOString()).toBe('2026-02-01T12:05:00.000Z');
    expect(ratingHistory[2].timestamp.toISOString()).toBe(ratingHistory[1].timestamp.toISOString());
    expect(prisma.pointExchangeRule.deleteMany).toHaveBeenCalled();
    expect(prisma.pointExchangeRule.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            minDiff: 0,
            maxDiff: 12,
            expectedPoints: 8,
            upsetPoints: 8,
          }),
        ],
      }),
    );
    expect(ratingHistory[0]).toEqual(
      expect.objectContaining({
        reason: 'INITIAL_RATING',
        rating: 1400,
        ratingChange: null,
        tournamentId: null,
        matchId: null,
      }),
    );
  });
});
