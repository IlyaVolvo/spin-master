/**
 * Basic tournament types: ROUND_ROBIN, PLAYOFF, SWISS.
 * Requires DATABASE_URL_TEST (see server/tests/jestSetupEnv.ts). Nodemailer is mocked.
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
import { authHeader, completeRoundRobin, playAllRoundRobinMatches } from './httpHelpers';
import { useFunctionalDbLifecycle } from './lifecycle';
import { seedOrganizer, seedPlayers } from './helpers';
import {
  expectedRatingsAfterRoundRobinCompletion,
  expectedRatingsPlayoffBracketChain,
  expectedRatingsSwissEnrollmentLastWrite,
} from '../helpers/ratingEtalon';

jest.setTimeout(180000);

useFunctionalDbLifecycle();

describe('Functional: basic tournaments', () => {
  describe('ROUND_ROBIN', () => {
    it('completes with favorites winning; top rating stays highest', async () => {
      const { token } = await seedOrganizer(prisma);
      const p = await seedPlayers(prisma, [
        { firstName: 'RR', lastName: 'A', email: 'rra.f@test.local', rating: 1800 },
        { firstName: 'RR', lastName: 'B', email: 'rrb.f@test.local', rating: 1700 },
        { firstName: 'RR', lastName: 'C', email: 'rrc.f@test.local', rating: 1600 },
        { firstName: 'RR', lastName: 'D', email: 'rrd.f@test.local', rating: 1500 },
      ]);
      const ids = p.map((x) => x.id);

      const created = await request(app)
        .post('/api/tournaments')
        .set(authHeader(token))
        .send({
          name: 'Functional RR Favorites',
          type: 'ROUND_ROBIN',
          participantIds: ids,
        })
        .expect(201);

      const tid = created.body.id as number;
      const ratingById = Object.fromEntries(p.map((x) => [x.id, x.rating])) as Record<number, number>;
      await playAllRoundRobinMatches(tid, token, ids, (a, b) => (ratingById[a] >= ratingById[b] ? a : b));

      const anchorsRows = await prisma.member.findMany({ where: { id: { in: ids } } });
      const anchorsBeforeCompletion = new Map<number, number | null>(
        anchorsRows.map((m) => [m.id, m.rating]),
      );

      await request(app)
        .patch(`/api/tournaments/${tid}/complete`)
        .set(authHeader(token))
        .expect(200);

      const t = await prisma.tournament.findUnique({ where: { id: tid } });
      expect(t?.status).toBe('COMPLETED');

      const tournamentFull = await prisma.tournament.findUnique({
        where: { id: tid },
        include: { participants: { include: { member: true } }, matches: true },
      });
      expect(tournamentFull).not.toBeNull();
      const expected = await expectedRatingsAfterRoundRobinCompletion(
        tournamentFull!,
        anchorsBeforeCompletion,
      );

      const updated = await prisma.member.findMany({ where: { id: { in: ids } } });
      for (const m of updated) {
        expect(m.rating).toBe(expected.get(m.id));
      }
      const top = updated.reduce((best, x) => ((x.rating ?? 0) > (best.rating ?? 0) ? x : best));
      expect(top.id).toBe(ids[0]);
    });

    it('completes with intentional upsets; TOURNAMENT_COMPLETED history exists', async () => {
      const { token } = await seedOrganizer(prisma);
      const p = await seedPlayers(prisma, [
        { firstName: 'Up', lastName: 'A', email: 'upa.f@test.local', rating: 1750 },
        { firstName: 'Up', lastName: 'B', email: 'upb.f@test.local', rating: 1650 },
        { firstName: 'Up', lastName: 'C', email: 'upc.f@test.local', rating: 1550 },
        { firstName: 'Up', lastName: 'D', email: 'upd.f@test.local', rating: 1450 },
      ]);
      const ids = p.map((x) => x.id);
      const ratingById = Object.fromEntries(p.map((x) => [x.id, x.rating])) as Record<number, number>;

      const created = await request(app)
        .post('/api/tournaments')
        .set(authHeader(token))
        .send({
          name: 'Functional RR Upsets',
          type: 'ROUND_ROBIN',
          participantIds: ids,
        })
        .expect(201);

      const tid = created.body.id as number;

      await playAllRoundRobinMatches(tid, token, ids, (a, b) => {
        const ra = ratingById[a];
        const rb = ratingById[b];
        return ra < rb ? a : b;
      });

      const anchorsRows = await prisma.member.findMany({ where: { id: { in: ids } } });
      const anchorsBeforeCompletion = new Map<number, number | null>(
        anchorsRows.map((m) => [m.id, m.rating]),
      );

      await request(app)
        .patch(`/api/tournaments/${tid}/complete`)
        .set(authHeader(token))
        .expect(200);

      const t = await prisma.tournament.findUnique({ where: { id: tid } });
      expect(t?.status).toBe('COMPLETED');

      const tournamentFull = await prisma.tournament.findUnique({
        where: { id: tid },
        include: { participants: { include: { member: true } }, matches: true },
      });
      const expected = await expectedRatingsAfterRoundRobinCompletion(
        tournamentFull!,
        anchorsBeforeCompletion,
      );
      const members = await prisma.member.findMany({ where: { id: { in: ids } } });
      for (const m of members) {
        expect(m.rating).toBe(expected.get(m.id));
      }

      const hist = await prisma.ratingHistory.findMany({
        where: { tournamentId: tid, reason: 'TOURNAMENT_COMPLETED' },
      });
      expect(hist.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('PLAYOFF', () => {
    it('records bracket rounds until champion; status COMPLETED', async () => {
      const { token } = await seedOrganizer(prisma);
      const p = await seedPlayers(prisma, [
        { firstName: 'P0', lastName: 'A', email: 'p0.f@test.local', rating: 1900 },
        { firstName: 'P1', lastName: 'B', email: 'p1.f@test.local', rating: 1800 },
        { firstName: 'P2', lastName: 'C', email: 'p2.f@test.local', rating: 1700 },
        { firstName: 'P3', lastName: 'D', email: 'p3.f@test.local', rating: 1600 },
      ]);
      const [a, b, c, d] = p.map((x) => x.id);

      const created = await request(app)
        .post('/api/tournaments')
        .set(authHeader(token))
        .send({
          name: 'Functional Playoff',
          type: 'PLAYOFF',
          participantIds: [a, b, c, d],
          additionalData: { bracketPositions: [a, b, c, d] },
        })
        .expect(201);

      const tid = created.body.id as number;

      const semis = await prisma.bracketMatch.findMany({
        where: { tournamentId: tid, round: 1 },
        orderBy: { position: 'asc' },
      });
      expect(semis.length).toBe(2);

      for (const bm of semis) {
        await request(app)
          .patch(`/api/tournaments/${tid}/bracket-matches/${bm.id}`)
          .set(authHeader(token))
          .send({ player1Sets: 3, player2Sets: 0 })
          .expect(201);
      }

      // Per-match ratings (PLAYOFF) must run via onMatchRatingCalculation — 2 semis × 2 players each
      const playoffMatchHistory = await prisma.ratingHistory.count({
        where: { tournamentId: tid, reason: 'MATCH_COMPLETED', matchId: { not: null } },
      });
      expect(playoffMatchHistory).toBeGreaterThanOrEqual(4);

      const finalBm = await prisma.bracketMatch.findFirst({
        where: { tournamentId: tid, round: 2 },
      });
      expect(finalBm).not.toBeNull();

      await request(app)
        .patch(`/api/tournaments/${tid}/bracket-matches/${finalBm!.id}`)
        .set(authHeader(token))
        .send({ player1Sets: 3, player2Sets: 2 })
        .expect(201);

      const t = await prisma.tournament.findUnique({ where: { id: tid } });
      expect(t?.status).toBe('COMPLETED');

      const bracketRows = await prisma.bracketMatch.findMany({
        where: { tournamentId: tid },
        include: { match: true },
        orderBy: [{ round: 'asc' }, { position: 'asc' }],
      });
      const initial = new Map(p.map((x) => [x.id, x.rating]));
      const expectedPlayoff = await expectedRatingsPlayoffBracketChain(bracketRows, initial);
      const membersAfter = await prisma.member.findMany({ where: { id: { in: [a, b, c, d] } } });
      for (const m of membersAfter) {
        expect(m.rating).toBe(expectedPlayoff.get(m.id));
      }
    });
  });

  describe('SWISS', () => {
    it('two rounds; higher rating wins each match; Swiss + tournament completed', async () => {
      const { token } = await seedOrganizer(prisma);
      const p = await seedPlayers(prisma, [
        { firstName: 'S0', lastName: 'A', email: 's0.f@test.local', rating: 1850 },
        { firstName: 'S1', lastName: 'B', email: 's1.f@test.local', rating: 1750 },
        { firstName: 'S2', lastName: 'C', email: 's2.f@test.local', rating: 1650 },
        { firstName: 'S3', lastName: 'D', email: 's3.f@test.local', rating: 1550 },
      ]);
      const ids = p.map((x) => x.id);
      const byRating = (x: number, y: number) =>
        p.find((z) => z.id === x)!.rating >= p.find((z) => z.id === y)!.rating ? x : y;

      const created = await request(app)
        .post('/api/tournaments')
        .set(authHeader(token))
        .send({
          name: 'Functional Swiss',
          type: 'SWISS',
          participantIds: ids,
          additionalData: { numberOfRounds: 2 },
        })
        .expect(201);

      const tid = created.body.id as number;

      for (let round = 1; round <= 2; round++) {
        const matches = await prisma.match.findMany({
          where: { tournamentId: tid, round },
        });
        for (const m of matches) {
          const w = byRating(m.member1Id, m.member2Id!);
          await request(app)
            .patch(`/api/tournaments/${tid}/matches/${m.id}`)
            .set(authHeader(token))
            .send({
              member1Id: m.member1Id,
              member2Id: m.member2Id,
              player1Sets: w === m.member1Id ? 3 : 0,
              player2Sets: w === m.member2Id ? 3 : 0,
            })
            .expect(200);
        }

        if (round === 1) {
          // Swiss applies ratings per match via onMatchRatingCalculation — 4 players ⇒ 2 R1 matches × 2 history rows
          const swissR1History = await prisma.ratingHistory.count({
            where: { tournamentId: tid, reason: 'MATCH_COMPLETED', matchId: { not: null } },
          });
          expect(swissR1History).toBeGreaterThanOrEqual(4);
        }
      }

      const t = await prisma.tournament.findUnique({ where: { id: tid } });
      expect(t?.status).toBe('COMPLETED');
      const sd = await prisma.swissTournamentData.findUnique({ where: { tournamentId: tid } });
      expect(sd?.isCompleted).toBe(true);

      const swissTournament = await prisma.tournament.findUnique({
        where: { id: tid },
        include: { participants: { include: { member: true } } },
      });
      const allMatches = await prisma.match.findMany({
        where: { tournamentId: tid },
        orderBy: [{ round: 'asc' }, { id: 'asc' }],
      });
      const expectedSwiss = await expectedRatingsSwissEnrollmentLastWrite(
        allMatches,
        swissTournament!.participants as any,
      );
      const membersSwiss = await prisma.member.findMany({ where: { id: { in: ids } } });
      for (const m of membersSwiss) {
        expect(m.rating).toBe(expectedSwiss.get(m.id));
      }
    });
  });
});
