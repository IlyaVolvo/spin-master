/**
 * Non-organizer players can record scores when they supply the opponent's password
 * (same rules as product). Covers standalone match + each tournament plugin type.
 *
 * Requires DATABASE_URL_TEST (see tests/jestSetupEnv.ts).
 */

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: () => ({
      verify: jest.fn().mockResolvedValue(undefined),
      sendMail: jest.fn().mockResolvedValue({ messageId: 'mock' }),
    }),
  },
}));

import request from 'supertest';
import { app, prisma } from '../../src/index';
import { authHeader } from './httpHelpers';
import { useFunctionalDbLifecycle } from './lifecycle';
import {
  FUNCTIONAL_TEST_PLAYER_PASSWORD,
  makeMemberJwt,
  seedOrganizer,
  seedPlayers,
} from './helpers';

jest.setTimeout(180000);

useFunctionalDbLifecycle();

/** Bearer token for a plain PLAYER member (no ORGANIZER role). */
function playerToken(memberId: number): string {
  return makeMemberJwt(memberId);
}

describe('Functional: non-organizer score entry (opponent password)', () => {
  it('standalone match via POST /api/tournaments/matches/create', async () => {
    await seedOrganizer(prisma);
    const [p1, p2] = await seedPlayers(prisma, [
      { firstName: 'S', lastName: 'One', email: 'nosa.standalone1@test.local', rating: 1600 },
      { firstName: 'S', lastName: 'Two', email: 'nosa.standalone2@test.local', rating: 1500 },
    ]);
    const actor = p1.id;
    const opponent = p2.id;

    const res = await request(app)
      .post('/api/tournaments/matches/create')
      .set(authHeader(playerToken(actor)))
      .send({
        member1Id: actor,
        member2Id: opponent,
        player1Sets: 3,
        player2Sets: 1,
        opponentPassword: FUNCTIONAL_TEST_PLAYER_PASSWORD,
      })
      .expect(201);

    expect(res.body.match).toBeDefined();
    expect(res.body.match.tournamentId).toBeNull();
    expect(res.body.match.member1Id).toBe(actor);
  });

  it('ROUND_ROBIN: POST /api/tournaments/:id/matches', async () => {
    const { token: orgToken } = await seedOrganizer(prisma);
    const players = await seedPlayers(prisma, [
      { firstName: 'RR', lastName: 'A', email: 'nosa.rra@test.local', rating: 1700 },
      { firstName: 'RR', lastName: 'B', email: 'nosa.rrb@test.local', rating: 1600 },
      { firstName: 'RR', lastName: 'C', email: 'nosa.rrc@test.local', rating: 1500 },
    ]);
    const [a, b, c] = players.map((p) => p.id);

    const created = await request(app)
      .post('/api/tournaments')
      .set(authHeader(orgToken))
      .send({
        name: 'NOSA Round Robin',
        type: 'ROUND_ROBIN',
        participantIds: [a, b, c],
      })
      .expect(201);

    const tid = created.body.id as number;

    await request(app)
      .post(`/api/tournaments/${tid}/matches`)
      .set(authHeader(playerToken(a)))
      .send({
        member1Id: a,
        member2Id: b,
        player1Sets: 3,
        player2Sets: 0,
        opponentPassword: FUNCTIONAL_TEST_PLAYER_PASSWORD,
      })
      .expect(201);
  });

  it('PLAYOFF: PATCH /api/tournaments/:tid/bracket-matches/:bracketMatchId', async () => {
    const { token: orgToken } = await seedOrganizer(prisma);
    const players = await seedPlayers(prisma, [
      { firstName: 'P', lastName: 'A', email: 'nosa.pa@test.local', rating: 1900 },
      { firstName: 'P', lastName: 'B', email: 'nosa.pb@test.local', rating: 1800 },
      { firstName: 'P', lastName: 'C', email: 'nosa.pc@test.local', rating: 1700 },
      { firstName: 'P', lastName: 'D', email: 'nosa.pd@test.local', rating: 1600 },
    ]);
    const [a, b, c, d] = players.map((p) => p.id);

    const created = await request(app)
      .post('/api/tournaments')
      .set(authHeader(orgToken))
      .send({
        name: 'NOSA Playoff',
        type: 'PLAYOFF',
        participantIds: [a, b, c, d],
        additionalData: { bracketPositions: [a, b, c, d] },
      })
      .expect(201);

    const tid = created.body.id as number;
    const semi = await prisma.bracketMatch.findFirst({
      where: { tournamentId: tid, round: 1 },
      orderBy: { position: 'asc' },
    });
    expect(semi?.member1Id).toBeTruthy();
    expect(semi?.member2Id).toBeTruthy();

    const actor = semi!.member1Id!;
    const opp = semi!.member2Id!;
    expect(actor).not.toBe(opp);

    await request(app)
      .patch(`/api/tournaments/${tid}/bracket-matches/${semi!.id}`)
      .set(authHeader(playerToken(actor)))
      .send({
        player1Sets: 3,
        player2Sets: 0,
        opponentPassword: FUNCTIONAL_TEST_PLAYER_PASSWORD,
      })
      .expect(201);
  });

  it('SWISS: PATCH /api/tournaments/:tid/matches/:matchId', async () => {
    const { token: orgToken } = await seedOrganizer(prisma);
    const players = await seedPlayers(prisma, [
      { firstName: 'W', lastName: 'A', email: 'nosa.wa@test.local', rating: 1850 },
      { firstName: 'W', lastName: 'B', email: 'nosa.wb@test.local', rating: 1750 },
      { firstName: 'W', lastName: 'C', email: 'nosa.wc@test.local', rating: 1650 },
      { firstName: 'W', lastName: 'D', email: 'nosa.wd@test.local', rating: 1550 },
    ]);
    const ids = players.map((p) => p.id);

    const created = await request(app)
      .post('/api/tournaments')
      .set(authHeader(orgToken))
      .send({
        name: 'NOSA Swiss',
        type: 'SWISS',
        participantIds: ids,
        additionalData: { numberOfRounds: 2 },
      })
      .expect(201);

    const tid = created.body.id as number;
    const m = await prisma.match.findFirst({
      where: { tournamentId: tid, round: 1 },
    });
    expect(m).not.toBeNull();

    const actor = m!.member1Id;
    const opp = m!.member2Id!;
    expect(ids).toContain(actor);
    expect(ids).toContain(opp);

    await request(app)
      .patch(`/api/tournaments/${tid}/matches/${m!.id}`)
      .set(authHeader(playerToken(actor)))
      .send({
        member1Id: m!.member1Id,
        member2Id: m!.member2Id,
        player1Sets: 3,
        player2Sets: 0,
        opponentPassword: FUNCTIONAL_TEST_PLAYER_PASSWORD,
      })
      .expect(200);
  });

  it('MULTI_ROUND_ROBINS: child ROUND_ROBIN POST /api/tournaments/:childId/matches', async () => {
    const { token: orgToken } = await seedOrganizer(prisma);
    const players = await seedPlayers(prisma, [
      { firstName: 'M', lastName: 'A', email: 'nosa.ma@test.local', rating: 1700 },
      { firstName: 'M', lastName: 'B', email: 'nosa.mb@test.local', rating: 1600 },
      { firstName: 'M', lastName: 'C', email: 'nosa.mc@test.local', rating: 1500 },
      { firstName: 'M', lastName: 'D', email: 'nosa.md@test.local', rating: 1400 },
    ]);
    const [a, b, c, d] = players.map((p) => p.id);

    const created = await request(app)
      .post('/api/tournaments')
      .set(authHeader(orgToken))
      .send({
        name: 'NOSA Multi RR',
        type: 'MULTI_ROUND_ROBINS',
        participantIds: [a, b, c, d],
        additionalData: { groups: [[a, b], [c, d]] },
      })
      .expect(201);

    const parentId = created.body.id as number;
    const child = await prisma.tournament.findFirst({
      where: { parentTournamentId: parentId },
      orderBy: { groupNumber: 'asc' },
    });
    expect(child).not.toBeNull();
    const childId = child!.id;

    await request(app)
      .post(`/api/tournaments/${childId}/matches`)
      .set(authHeader(playerToken(a)))
      .send({
        member1Id: a,
        member2Id: b,
        player1Sets: 3,
        player2Sets: 1,
        opponentPassword: FUNCTIONAL_TEST_PLAYER_PASSWORD,
      })
      .expect(201);
  });

  it('PRELIMINARY_WITH_FINAL_PLAYOFF: prelim child ROUND_ROBIN POST match', async () => {
    const { token: orgToken } = await seedOrganizer(prisma);
    const players = await seedPlayers(prisma, [
      { firstName: 'F', lastName: 'A', email: 'nosa.fa@test.local', rating: 1800 },
      { firstName: 'F', lastName: 'B', email: 'nosa.fb@test.local', rating: 1700 },
      { firstName: 'F', lastName: 'C', email: 'nosa.fc@test.local', rating: 1600 },
      { firstName: 'F', lastName: 'D', email: 'nosa.fd@test.local', rating: 1500 },
    ]);
    const [a, b, c, d] = players.map((p) => p.id);

    const created = await request(app)
      .post('/api/tournaments')
      .set(authHeader(orgToken))
      .send({
        name: 'NOSA Prelim Playoff',
        type: 'PRELIMINARY_WITH_FINAL_PLAYOFF',
        participantIds: [a, b, c, d],
        additionalData: {
          groups: [[a, b], [c, d]],
          playoffBracketSize: 2,
          autoQualifiedCount: 0,
          autoQualifiedMemberIds: [],
        },
      })
      .expect(201);

    const parentId = created.body.id as number;
    const prelim = await prisma.tournament.findFirst({
      where: { parentTournamentId: parentId, NOT: { groupNumber: null } },
      orderBy: { groupNumber: 'asc' },
    });
    expect(prelim?.type).toBe('ROUND_ROBIN');

    await request(app)
      .post(`/api/tournaments/${prelim!.id}/matches`)
      .set(authHeader(playerToken(a)))
      .send({
        member1Id: a,
        member2Id: b,
        player1Sets: 3,
        player2Sets: 0,
        opponentPassword: FUNCTIONAL_TEST_PLAYER_PASSWORD,
      })
      .expect(201);
  });

  it('PRELIMINARY_WITH_FINAL_ROUND_ROBIN: prelim child ROUND_ROBIN POST match', async () => {
    const { token: orgToken } = await seedOrganizer(prisma);
    const players = await seedPlayers(prisma, [
      { firstName: 'R', lastName: 'A', email: 'nosa.rrfa@test.local', rating: 1780 },
      { firstName: 'R', lastName: 'B', email: 'nosa.rrfb@test.local', rating: 1680 },
      { firstName: 'R', lastName: 'C', email: 'nosa.rrfc@test.local', rating: 1580 },
      { firstName: 'R', lastName: 'D', email: 'nosa.rrfd@test.local', rating: 1480 },
    ]);
    const [a, b, c, d] = players.map((p) => p.id);

    const created = await request(app)
      .post('/api/tournaments')
      .set(authHeader(orgToken))
      .send({
        name: 'NOSA Prelim Final RR',
        type: 'PRELIMINARY_WITH_FINAL_ROUND_ROBIN',
        participantIds: [a, b, c, d],
        additionalData: {
          groups: [[a, b], [c, d]],
          finalRoundRobinSize: 2,
          autoQualifiedCount: 0,
          autoQualifiedMemberIds: [],
        },
      })
      .expect(201);

    const parentId = created.body.id as number;
    const prelim = await prisma.tournament.findFirst({
      where: { parentTournamentId: parentId, groupNumber: { not: null } },
      orderBy: { groupNumber: 'asc' },
    });
    expect(prelim?.type).toBe('ROUND_ROBIN');

    await request(app)
      .post(`/api/tournaments/${prelim!.id}/matches`)
      .set(authHeader(playerToken(a)))
      .send({
        member1Id: a,
        member2Id: b,
        player1Sets: 3,
        player2Sets: 0,
        opponentPassword: FUNCTIONAL_TEST_PLAYER_PASSWORD,
      })
      .expect(201);
  });
});
