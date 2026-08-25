/**
 * Socket.io: real TCP server + browser-style client (not mocked).
 * Complements Supertest-only suites — verifies the same httpServer the production
 * process uses can push events clients subscribe to (e.g. match:updated).
 *
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

import { io as ioClient } from 'socket.io-client';
import request from 'supertest';
import { app, httpServer, prisma } from '../../src/index';
import { authHeader, postRrMatch } from './httpHelpers';
import { useFunctionalDbLifecycle } from './lifecycle';
import { seedAdmin, seedOrganizer, seedPlayers } from './helpers';

jest.setTimeout(180000);

useFunctionalDbLifecycle();

function listenOnRandomPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const onErr = (e: Error) => reject(e);
    httpServer.once('error', onErr);
    httpServer.listen(0, '127.0.0.1', () => {
      httpServer.removeListener('error', onErr);
      const addr = httpServer.address();
      if (typeof addr === 'object' && addr !== null) {
        resolve(addr.port);
      } else {
        reject(new Error('httpServer.address() did not return a port'));
      }
    });
  });
}

function closeHttpServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    httpServer.close((err) => (err ? reject(err) : resolve()));
  });
}

describe('Functional: Socket.io (realtime)', () => {
  let port: number;

  beforeAll(async () => {
    port = await listenOnRandomPort();
  });

  afterAll(async () => {
    await closeHttpServer();
  });

  it('client receives match:updated when organizer records a tournament match', async () => {
    const { token } = await seedOrganizer(prisma);
    const [a, b, c] = await seedPlayers(prisma, [
      { firstName: 'Sock', lastName: 'A', email: 'sock.a@test.local', rating: 1700 },
      { firstName: 'Sock', lastName: 'B', email: 'sock.b@test.local', rating: 1600 },
      { firstName: 'Sock', lastName: 'C', email: 'sock.c@test.local', rating: 1500 },
    ]);

    const created = await request(app)
      .post('/api/tournaments')
      .set(authHeader(token))
      .send({
        name: 'Socket RR',
        type: 'ROUND_ROBIN',
        participantIds: [a.id, b.id, c.id],
      })
      .expect(201);

    const tid = created.body.id as number;

    const socket = ioClient(`http://127.0.0.1:${port}`, {
      transports: ['websocket', 'polling'],
    });

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('socket connect timeout')), 15000);
      socket.once('connect', () => {
        clearTimeout(t);
        resolve();
      });
      socket.once('connect_error', (e) => {
        clearTimeout(t);
        reject(e);
      });
    });

    const eventPromise = new Promise<Record<string, unknown>>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('match:updated timeout')), 15000);
      socket.once('match:updated', (payload: Record<string, unknown>) => {
        clearTimeout(t);
        resolve(payload);
      });
    });

    await postRrMatch(tid, token, a.id, b.id, 3, 1, app);

    const payload = await eventPromise;
    expect(payload.tournamentId).toBe(tid);

    socket.close();
  });

  it('client receives player:created and player:deleted when members are added and removed', async () => {
    const { token } = await seedAdmin(prisma);

    const socket = ioClient(`http://127.0.0.1:${port}`, {
      transports: ['websocket', 'polling'],
    });

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('socket connect timeout')), 15000);
      socket.once('connect', () => {
        clearTimeout(t);
        resolve();
      });
      socket.once('connect_error', (e) => {
        clearTimeout(t);
        reject(e);
      });
    });

    const createdPromise = new Promise<Record<string, unknown>>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('player:created timeout')), 15000);
      socket.once('player:created', (payload: Record<string, unknown>) => {
        clearTimeout(t);
        resolve(payload);
      });
    });

    const created = await request(app)
      .post('/api/players')
      .set(authHeader(token))
      .send({
        firstName: 'Sock',
        lastName: 'Newbie',
        gender: 'NOT_SPECIFIED',
        roles: ['PLAYER'],
        skipSimilarityCheck: true,
      })
      .expect(201);

    const createdPayload = await createdPromise;
    const player = createdPayload.player as { id: number; firstName: string; lastName: string };
    expect(player.id).toBe(created.body.id);
    expect(player.firstName).toBe('Sock');
    expect(player.lastName).toBe('Newbie');

    const updatedPromise = new Promise<Record<string, unknown>>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('player:updated timeout')), 15000);
      socket.once('player:updated', (payload: Record<string, unknown>) => {
        clearTimeout(t);
        resolve(payload);
      });
    });

    await request(app)
      .patch(`/api/players/${created.body.id}`)
      .set(authHeader(token))
      .send({ firstName: 'Socket' })
      .expect(200);

    const updatedPayload = await updatedPromise;
    const updatedPlayer = updatedPayload.player as { id: number; firstName: string };
    expect(updatedPlayer.id).toBe(created.body.id);
    expect(updatedPlayer.firstName).toBe('Socket');

    const deletedPromise = new Promise<Record<string, unknown>>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('player:deleted timeout')), 15000);
      socket.once('player:deleted', (payload: Record<string, unknown>) => {
        clearTimeout(t);
        resolve(payload);
      });
    });

    await request(app)
      .delete(`/api/players/${created.body.id}`)
      .set(authHeader(token))
      .expect(200);

    const deletedPayload = await deletedPromise;
    expect(deletedPayload.playerId).toBe(created.body.id);

    socket.close();
  });
});
