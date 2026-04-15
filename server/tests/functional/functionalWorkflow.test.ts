/**
 * Cross-cutting user journeys (HTTP API — same stack as production).
 *
 * Mapping (organizer perspective):
 * - Health check → GET /api/health
 * - Authenticated session → Bearer JWT (same as SPA after login)
 * - Roster eligible for draws → `seedPlayers` (active members). New invites via POST /api/players
 *   are created inactive until email confirmation (see separate test below); tournaments require active players.
 * - Create competition → POST /api/tournaments (ROUND_ROBIN)
 * - Record results + finalize → POST …/matches, PATCH …/complete (via completeRoundRobin)
 * - Verify durable outcome → Prisma + GET /api/tournaments (list reflects new event)
 *
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
import { authHeader, completeRoundRobin } from './httpHelpers';
import { useFunctionalDbLifecycle } from './lifecycle';
import { seedOrganizer, seedPlayers } from './helpers';

jest.setTimeout(180000);

useFunctionalDbLifecycle();

describe('Functional: end-to-end workflows', () => {
  describe('POST /api/players vs tournament eligibility', () => {
    it('creates a pending member (inactive) — matches tournament guard for active participants', async () => {
      const { token } = await seedOrganizer(prisma);
      await request(app)
        .post('/api/players')
        .set(authHeader(token))
        .send({
          firstName: 'Pending',
          lastName: 'Invite',
          email: 'workflow.pending@test.local',
          gender: 'MALE',
          birthDate: '1996-02-01',
          rating: 1500,
          roles: ['PLAYER'],
          skipSimilarityCheck: true,
        })
        .expect(201);

      const row = await prisma.member.findUnique({ where: { email: 'workflow.pending@test.local' } });
      expect(row?.isActive).toBe(false);
    });
  });

  describe('Journey: health → active roster → round-robin → complete → list reflects state', () => {
    it('runs the full organizer path without bypassing routes or middleware', async () => {
      const health = await request(app).get('/api/health').expect(200);
      expect(health.body.status).toBe('ok');

      const { token } = await seedOrganizer(prisma);

      const seeded = await seedPlayers(prisma, [
        { firstName: 'Workflow', lastName: 'Alpha', email: 'workflow.alpha@test.local', rating: 1650 },
        { firstName: 'Workflow', lastName: 'Beta', email: 'workflow.beta@test.local', rating: 1550 },
      ]);
      const id1 = seeded[0].id;
      const id2 = seeded[1].id;

      const created = await request(app)
        .post('/api/tournaments')
        .set(authHeader(token))
        .send({
          name: 'Workflow RR Smoke',
          type: 'ROUND_ROBIN',
          participantIds: [id1, id2],
        })
        .expect(201);

      const tid = created.body.id as number;

      await completeRoundRobin(tid, token, [id1, id2], (a, b) => (a === id1 ? a : b));

      const t = await prisma.tournament.findUnique({ where: { id: tid } });
      expect(t?.status).toBe('COMPLETED');

      const list = await request(app).get('/api/tournaments').set(authHeader(token)).expect(200);
      const ids = (list.body as { id: number }[]).map((x) => x.id);
      expect(ids).toContain(tid);
    });
  });
});
