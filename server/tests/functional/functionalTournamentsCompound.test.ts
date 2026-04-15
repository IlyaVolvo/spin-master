/**
 * Compound tournaments: MULTI_ROUND_ROBINS, PRELIMINARY_WITH_FINAL_PLAYOFF, PRELIMINARY_WITH_FINAL_ROUND_ROBIN.
 * Requires DATABASE_URL. Nodemailer is mocked.
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
import { authHeader, playAllRoundRobinMatches } from './httpHelpers';
import { useFunctionalDbLifecycle } from './lifecycle';
import { seedOrganizer, seedPlayers } from './helpers';
import {
  expectedRatingsAfterRoundRobinCompletion,
  expectedRatingsPlayoffBracketChain,
} from '../helpers/ratingEtalon';

jest.setTimeout(180000);

useFunctionalDbLifecycle();

describe('Functional: compound tournaments', () => {
  it('MULTI_ROUND_ROBINS: all group RRs complete, parent completes', async () => {
    const { token } = await seedOrganizer(prisma);
    const p = await seedPlayers(prisma, [
      { firstName: 'M0', lastName: 'A', email: 'm0.f@test.local', rating: 1700 },
      { firstName: 'M1', lastName: 'B', email: 'm1.f@test.local', rating: 1600 },
      { firstName: 'M2', lastName: 'C', email: 'm2.f@test.local', rating: 1500 },
      { firstName: 'M3', lastName: 'D', email: 'm3.f@test.local', rating: 1400 },
    ]);
    const [a, b, c, d] = p.map((x) => x.id);

    const created = await request(app)
      .post('/api/tournaments')
      .set(authHeader(token))
      .send({
        name: 'Functional Multi RR',
        type: 'MULTI_ROUND_ROBINS',
        participantIds: [a, b, c, d],
        additionalData: { groups: [[a, b], [c, d]] },
      })
      .expect(201);

    const parentId = created.body.id as number;
    const children = await prisma.tournament.findMany({
      where: { parentTournamentId: parentId },
      orderBy: { groupNumber: 'asc' },
    });
    expect(children).toHaveLength(2);

    const ratings = new Map(p.map((x) => [x.id, x.rating]));
    for (const child of children) {
      const part = await prisma.tournamentParticipant.findMany({
        where: { tournamentId: child.id },
      });
      const cids = part.map((x) => x.memberId);
      await playAllRoundRobinMatches(child.id, token, cids, (x, y) =>
        ratings.get(x)! >= ratings.get(y)! ? x : y,
      );
      const anchorsRows = await prisma.member.findMany({ where: { id: { in: cids } } });
      const anchorsBeforeCompletion = new Map<number, number | null>(
        anchorsRows.map((m) => [m.id, m.rating]),
      );
      await request(app)
        .patch(`/api/tournaments/${child.id}/complete`)
        .set(authHeader(token))
        .expect(200);

      const tournamentFull = await prisma.tournament.findUnique({
        where: { id: child.id },
        include: { participants: { include: { member: true } }, matches: true },
      });
      const expected = await expectedRatingsAfterRoundRobinCompletion(
        tournamentFull!,
        anchorsBeforeCompletion,
      );
      const members = await prisma.member.findMany({ where: { id: { in: cids } } });
      for (const m of members) {
        expect(m.rating).toBe(expected.get(m.id));
      }
    }

    const parent = await prisma.tournament.findUnique({ where: { id: parentId } });
    expect(parent?.status).toBe('COMPLETED');
  });

  it('PRELIMINARY_WITH_FINAL_PLAYOFF: prelims then playoff child', async () => {
    const { token } = await seedOrganizer(prisma);
    const p = await seedPlayers(prisma, [
      { firstName: 'F0', lastName: 'A', email: 'f0.f@test.local', rating: 1800 },
      { firstName: 'F1', lastName: 'B', email: 'f1.f@test.local', rating: 1700 },
      { firstName: 'F2', lastName: 'C', email: 'f2.f@test.local', rating: 1600 },
      { firstName: 'F3', lastName: 'D', email: 'f3.f@test.local', rating: 1500 },
    ]);
    const [a, b, c, d] = p.map((x) => x.id);

    const created = await request(app)
      .post('/api/tournaments')
      .set(authHeader(token))
      .send({
        name: 'Functional Prelim Playoff',
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
    const prelims = await prisma.tournament.findMany({
      where: { parentTournamentId: parentId, NOT: { groupNumber: null } },
      orderBy: { groupNumber: 'asc' },
    });
    expect(prelims.length).toBe(2);

    for (const child of prelims) {
      const part = await prisma.tournamentParticipant.findMany({ where: { tournamentId: child.id } });
      const cids = part.map((x) => x.memberId);
      await playAllRoundRobinMatches(child.id, token, cids, (x, y) => (Math.max(x, y) === x ? x : y));
      const anchorsRows = await prisma.member.findMany({ where: { id: { in: cids } } });
      const anchorsBeforeCompletion = new Map<number, number | null>(
        anchorsRows.map((m) => [m.id, m.rating]),
      );
      await request(app)
        .patch(`/api/tournaments/${child.id}/complete`)
        .set(authHeader(token))
        .expect(200);
      const tournamentFull = await prisma.tournament.findUnique({
        where: { id: child.id },
        include: { participants: { include: { member: true } }, matches: true },
      });
      const expectedPrelim = await expectedRatingsAfterRoundRobinCompletion(
        tournamentFull!,
        anchorsBeforeCompletion,
      );
      const membersPrelim = await prisma.member.findMany({ where: { id: { in: cids } } });
      for (const m of membersPrelim) {
        expect(m.rating).toBe(expectedPrelim.get(m.id));
      }
    }

    const ratingsAfterPrelims = await prisma.member.findMany({ where: { id: { in: [a, b, c, d] } } });
    const initialPlayoff = new Map(ratingsAfterPrelims.map((m) => [m.id, m.rating ?? 1200]));

    const playoff = await prisma.tournament.findFirst({
      where: { parentTournamentId: parentId, type: 'PLAYOFF' },
    });
    expect(playoff).not.toBeNull();

    const rounds = await prisma.bracketMatch.groupBy({
      by: ['round'],
      where: { tournamentId: playoff!.id },
    });
    const maxRound = Math.max(...rounds.map((r) => r.round));

    for (let r = 1; r < maxRound; r++) {
      const semi = await prisma.bracketMatch.findMany({
        where: { tournamentId: playoff!.id, round: r },
        orderBy: { position: 'asc' },
      });
      for (const bm of semi) {
        if (bm.member1Id && bm.member2Id && bm.member2Id !== 0) {
          await request(app)
            .patch(`/api/tournaments/${playoff!.id}/bracket-matches/${bm.id}`)
            .set(authHeader(token))
            .send({ player1Sets: 3, player2Sets: 0 })
            .expect(201);
        }
      }
    }

    const finals = await prisma.bracketMatch.findMany({
      where: { tournamentId: playoff!.id, round: maxRound },
      orderBy: { position: 'asc' },
    });
    expect(finals.length).toBeGreaterThanOrEqual(1);
    for (const bm of finals) {
      if (bm.member1Id && bm.member2Id && bm.member2Id !== 0) {
        await request(app)
          .patch(`/api/tournaments/${playoff!.id}/bracket-matches/${bm.id}`)
          .set(authHeader(token))
          .send({ player1Sets: 3, player2Sets: 1 })
          .expect(201);
      }
    }

    const root = await prisma.tournament.findUnique({ where: { id: parentId } });
    expect(root?.status).toBe('COMPLETED');

    const bracketRows = await prisma.bracketMatch.findMany({
      where: { tournamentId: playoff!.id },
      include: { match: true },
      orderBy: [{ round: 'asc' }, { position: 'asc' }],
    });
    const expectedPlayoff = await expectedRatingsPlayoffBracketChain(bracketRows, initialPlayoff);
    const membersFinal = await prisma.member.findMany({ where: { id: { in: [a, b, c, d] } } });
    for (const m of membersFinal) {
      expect(m.rating).toBe(expectedPlayoff.get(m.id));
    }
  });

  it('PRELIMINARY_WITH_FINAL_ROUND_ROBIN: final RR after prelims', async () => {
    const { token } = await seedOrganizer(prisma);
    const p = await seedPlayers(prisma, [
      { firstName: 'R0', lastName: 'A', email: 'r0.f@test.local', rating: 1780 },
      { firstName: 'R1', lastName: 'B', email: 'r1.f@test.local', rating: 1680 },
      { firstName: 'R2', lastName: 'C', email: 'r2.f@test.local', rating: 1580 },
      { firstName: 'R3', lastName: 'D', email: 'r3.f@test.local', rating: 1480 },
    ]);
    const [a, b, c, d] = p.map((x) => x.id);

    const created = await request(app)
      .post('/api/tournaments')
      .set(authHeader(token))
      .send({
        name: 'Functional Prelim Final RR',
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

    const prelims = await prisma.tournament.findMany({
      where: { parentTournamentId: parentId, groupNumber: { not: null } },
      orderBy: { groupNumber: 'asc' },
    });

    for (const child of prelims) {
      const part = await prisma.tournamentParticipant.findMany({ where: { tournamentId: child.id } });
      const cids = part.map((x) => x.memberId);
      await playAllRoundRobinMatches(child.id, token, cids, (x, y) => (x < y ? x : y));
      const anchorsRows = await prisma.member.findMany({ where: { id: { in: cids } } });
      const anchorsBeforeCompletion = new Map<number, number | null>(
        anchorsRows.map((m) => [m.id, m.rating]),
      );
      await request(app)
        .patch(`/api/tournaments/${child.id}/complete`)
        .set(authHeader(token))
        .expect(200);
      const tournamentFull = await prisma.tournament.findUnique({
        where: { id: child.id },
        include: { participants: { include: { member: true } }, matches: true },
      });
      const expectedPrelim = await expectedRatingsAfterRoundRobinCompletion(
        tournamentFull!,
        anchorsBeforeCompletion,
      );
      const membersPrelim = await prisma.member.findMany({ where: { id: { in: cids } } });
      for (const m of membersPrelim) {
        expect(m.rating).toBe(expectedPrelim.get(m.id));
      }
    }

    const finalChild = await prisma.tournament.findFirst({
      where: { parentTournamentId: parentId, groupNumber: null, type: 'ROUND_ROBIN' },
    });
    expect(finalChild).not.toBeNull();

    const fPart = await prisma.tournamentParticipant.findMany({
      where: { tournamentId: finalChild!.id },
    });
    const fids = fPart.map((x) => x.memberId);
    expect(fids.length).toBe(2);

    await playAllRoundRobinMatches(finalChild!.id, token, fids, (x, y) => (x < y ? x : y));
    const anchorsFinal = await prisma.member.findMany({ where: { id: { in: fids } } });
    const anchorsBeforeFinalComplete = new Map<number, number | null>(
      anchorsFinal.map((m) => [m.id, m.rating]),
    );
    await request(app)
      .patch(`/api/tournaments/${finalChild!.id}/complete`)
      .set(authHeader(token))
      .expect(200);

    const finalTournamentFull = await prisma.tournament.findUnique({
      where: { id: finalChild!.id },
      include: { participants: { include: { member: true } }, matches: true },
    });
    const expectedFinalRr = await expectedRatingsAfterRoundRobinCompletion(
      finalTournamentFull!,
      anchorsBeforeFinalComplete,
    );
    const membersFinalRr = await prisma.member.findMany({ where: { id: { in: fids } } });
    for (const m of membersFinalRr) {
      expect(m.rating).toBe(expectedFinalRr.get(m.id));
    }

    const root = await prisma.tournament.findUnique({ where: { id: parentId } });
    expect(root?.status).toBe('COMPLETED');
  });
});
