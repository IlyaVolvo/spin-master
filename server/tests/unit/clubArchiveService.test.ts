import {
  parseClubArchive,
  buildClubArchive,
  importClubArchive,
} from '../../src/services/clubArchiveService';
import { CLUB_ARCHIVE_VERSION, type ClubArchiveDocument } from '../../src/services/clubArchiveTypes';

function sampleArchive(): ClubArchiveDocument {
  return {
    version: CLUB_ARCHIVE_VERSION,
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
  };
}

describe('clubArchiveService parseClubArchive', () => {
  it('accepts a valid v1 archive', () => {
    const parsed = parseClubArchive(sampleArchive());
    expect(parsed.version).toBe(1);
    expect(parsed.members).toHaveLength(2);
    expect(parsed.tournaments[0].matches).toHaveLength(1);
    expect(parsed.standaloneMatches).toHaveLength(1);
  });

  it('rejects wrong version', () => {
    expect(() => parseClubArchive({ ...sampleArchive(), version: 99 })).toThrow(/version/i);
  });

  it('rejects non-completed tournament status', () => {
    const bad = sampleArchive();
    (bad.tournaments[0] as any).status = 'ACTIVE';
    expect(() => parseClubArchive(bad)).toThrow(/COMPLETED/);
  });

  it('rejects invalid member roles', () => {
    const bad = sampleArchive();
    (bad.members[0] as any).roles = ['SUPERUSER'];
    expect(() => parseClubArchive(bad)).toThrow(/roles/i);
  });
});

describe('clubArchiveService build/import with prisma mock', () => {
  it('buildClubArchive serializes completed roots only shape', async () => {
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
            name: 'Done',
            type: 'ROUND_ROBIN',
            status: 'COMPLETED',
            cancelled: false,
            tournamentDate: new Date('2026-03-01T00:00:00.000Z'),
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
              },
            ],
            bracketMatches: [],
            swissData: null,
            preliminaryConfig: null,
            childTournaments: [],
          },
        ]),
      },
      match: {
        findMany: jest.fn(async () => []),
      },
    };

    const archive = await buildClubArchive(prisma);
    expect(archive.version).toBe(1);
    expect(archive.members[0].rating).toBe(1200);
    expect(archive.tournaments[0].name).toBe('Done');
    expect(archive.tournaments[0].status).toBe('COMPLETED');
    expect(prisma.tournament.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'COMPLETED', parentTournamentId: null },
      }),
    );
  });

  it('importClubArchive rejects when tournaments already exist', async () => {
    const prisma: any = {
      tournament: { count: jest.fn(async () => 1) },
      match: { count: jest.fn(async () => 0) },
    };
    await expect(importClubArchive(prisma, sampleArchive())).rejects.toThrow(/empty/i);
  });

  it('importClubArchive creates members, tournament, and trusted rating history', async () => {
    const createdMembers: any[] = [];
    const ratingHistory: any[] = [];
    const createdTournaments: any[] = [];
    const createdMatches: any[] = [];
    const createdParticipants: any[] = [];
    let nextMemberId = 100;
    let nextTournamentId = 200;
    let nextMatchId = 300;

    const prisma: any = {
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
    };

    const result = await importClubArchive(prisma, sampleArchive());
    expect(result.membersCreated).toBe(2);
    expect(result.membersUpdated).toBe(0);
    expect(result.tournamentsCreated).toBe(1);
    expect(result.matchesCreated).toBe(1);
    expect(result.standaloneMatchesCreated).toBe(1);
    expect(createdMembers).toHaveLength(2);
    expect(ratingHistory.every((h) => h.reason === 'INITIAL_RATING')).toBe(true);
    expect(ratingHistory.map((h) => h.rating).sort()).toEqual([1500, 1600]);
    expect(createdParticipants).toHaveLength(2);
    expect(createdMatches.filter((m) => m.tournamentId != null)).toHaveLength(1);
    expect(createdMatches.filter((m) => m.tournamentId == null)).toHaveLength(1);
  });
});
