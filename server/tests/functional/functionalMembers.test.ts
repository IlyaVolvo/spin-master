/**
 * Members: create, CSV import/export, list filters, rating/match history.
 * Requires DATABASE_URL_TEST (see server/tests/jestSetupEnv.ts). Nodemailer is mocked (no SMTP).
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
import { authHeader, postRrMatch } from './httpHelpers';
import { useFunctionalDbLifecycle } from './lifecycle';
import { seedOrganizer, seedPlayers } from './helpers';

jest.setTimeout(180000);

useFunctionalDbLifecycle();

describe('Functional: members & lists', () => {
  it('POST /api/players creates a member with expected DB state', async () => {
    const { token } = await seedOrganizer(prisma);
    const res = await request(app)
      .post('/api/players')
      .set(authHeader(token))
      .send({
        firstName: 'Newbie',
        lastName: 'Player',
        email: 'newbie.functional@test.local',
        gender: 'MALE',
        birthDate: '1998-04-10',
        rating: 1420,
        roles: ['PLAYER'],
        skipSimilarityCheck: true,
      })
      .expect(201);

    expect(res.body.firstName).toBe('Newbie');
    expect(res.body.rating).toBe(1420);
    expect(res.body.isActive).toBe(false);

    const row = await prisma.member.findUnique({ where: { email: 'newbie.functional@test.local' } });
    expect(row).not.toBeNull();
    expect(row!.rating).toBe(1420);
    expect(row!.roles).toContain('PLAYER');
    expect(row!.isActive).toBe(false);
  });

  it('POST /api/players rejects duplicate email ignoring case', async () => {
    const { token } = await seedOrganizer(prisma);
    await request(app)
      .post('/api/players')
      .set(authHeader(token))
      .send({
        firstName: 'First',
        lastName: 'DupEmail',
        email: 'dupcase.functional@test.local',
        gender: 'MALE',
        birthDate: '1998-04-10',
        roles: ['PLAYER'],
        skipSimilarityCheck: true,
      })
      .expect(201);

    const dup = await request(app)
      .post('/api/players')
      .set(authHeader(token))
      .send({
        firstName: 'Second',
        lastName: 'DupEmail',
        email: 'DUPCASE.FUNCTIONAL@Test.Local',
        gender: 'MALE',
        birthDate: '1999-05-11',
        roles: ['PLAYER'],
        skipSimilarityCheck: true,
      })
      .expect(400);

    expect(dup.body.error).toMatch(/email already exists/i);
  });

  it('POST /api/players/import returns structured validation on bad CSV', async () => {
    const { token } = await seedOrganizer(prisma);
    const csv = ['Polly,Wordlot,badcsv.functional@test.local,1999-13-24,Male,P,,,1300'].join('\n');
    const res = await request(app)
      .post('/api/players/import')
      .set(authHeader(token))
      .field('sendEmail', 'false')
      .attach('file', Buffer.from(csv, 'utf-8'), 'bad.csv')
      .expect(400);

    expect(res.body.importValidation).toBeDefined();
    expect(res.body.importValidation.parseReport).toBeDefined();
    const pr = res.body.importValidation.parseReport as {
      totalDataRows: number;
      validRows: number;
      rejectedRows: number;
      failedRows: Array<{ rowNumber: number; rawLine: string; messages: string[] }>;
    };
    expect(pr.totalDataRows).toBe(1);
    expect(pr.validRows).toBe(0);
    expect(pr.rejectedRows).toBe(1);
    expect(pr.failedRows).toHaveLength(1);
    expect(pr.failedRows[0].rowNumber).toBe(1);
    expect(pr.failedRows[0].rawLine).toContain('1999-13-24');
    expect(pr.failedRows[0].messages.join(' ')).toMatch(/not a valid calendar date/i);
  });

  it('CSV import + GET /export align with DB', async () => {
    const { token } = await seedOrganizer(prisma);
    const csv = [
      'FirstName,LastName,Email,BirthDate,Gender,Rating',
      'Import,One,import1.functional@test.local,2000-01-15,MALE,1500',
      'Import,Two,import2.functional@test.local,2001-05-20,FEMALE,1480',
    ].join('\n');

    const importRes = await request(app)
      .post('/api/players/import')
      .set(authHeader(token))
      .field('sendEmail', 'false')
      .attach('file', Buffer.from(csv, 'utf-8'), 'import.csv')
      .expect(200);

    expect(importRes.body.successful as number).toBeGreaterThanOrEqual(2);

    const dbRows = await prisma.member.findMany({
      where: { email: { in: ['import1.functional@test.local', 'import2.functional@test.local'] } },
      orderBy: { email: 'asc' },
    });
    expect(dbRows).toHaveLength(2);
    expect(dbRows[0].firstName).toBe('Import');
    expect(dbRows[1].rating).toBe(1480);

    const exportRes = await request(app).get('/api/players/export').set(authHeader(token)).expect(200);

    const exportedEmails = new Set((exportRes.body as { email: string }[]).map((r) => r.email));
    expect(exportedEmails.has('import1.functional@test.local')).toBe(true);
    expect(exportedEmails.has('import2.functional@test.local')).toBe(true);
  });

  it('CSV import without header row uses export column order', async () => {
    const { token } = await seedOrganizer(prisma);
    const csv = [
      'NoHdr,One,nohdr1.functional@test.local,2002-02-02,MALE,,,,',
      'NoHdr,Two,nohdr2.functional@test.local,2003-03-03,FEMALE,P,,,1600',
    ].join('\n');

    const importRes = await request(app)
      .post('/api/players/import')
      .set(authHeader(token))
      .field('sendEmail', 'false')
      .attach('file', Buffer.from(csv, 'utf-8'), 'import.csv')
      .expect(200);

    expect(importRes.body.successful as number).toBeGreaterThanOrEqual(2);

    const dbRows = await prisma.member.findMany({
      where: { email: { in: ['nohdr1.functional@test.local', 'nohdr2.functional@test.local'] } },
      orderBy: { email: 'asc' },
    });
    expect(dbRows).toHaveLength(2);
    expect(dbRows[0].firstName).toBe('NoHdr');
    expect(dbRows[1].lastName).toBe('Two');
    expect(dbRows[1].rating).toBe(1600);
  });

  it('GET /players vs /active; rating-history & match-history', async () => {
    const { token } = await seedOrganizer(prisma);
    const players = await seedPlayers(prisma, [
      { firstName: 'Active', lastName: 'A', email: 'active.f@test.local', rating: 1600 },
      { firstName: 'Inactive', lastName: 'B', email: 'inactive.f@test.local', rating: 1500 },
      { firstName: 'Active', lastName: 'C', email: 'activec.f@test.local', rating: 1550 },
    ]);

    await prisma.member.update({
      where: { id: players[1].id },
      data: { isActive: false },
    });

    const all = await request(app).get('/api/players').set(authHeader(token)).expect(200);
    const idsAll = (all.body as { id: number }[]).map((p) => p.id);
    expect(idsAll).toContain(players[1].id);

    const active = await request(app).get('/api/players/active').set(authHeader(token)).expect(200);
    const idsActive = (active.body as { id: number }[]).map((p) => p.id);
    expect(idsActive).toContain(players[0].id);
    expect(idsActive).not.toContain(players[1].id);

    const rh = await request(app)
      .post('/api/players/rating-history')
      .set(authHeader(token))
      .send({ memberIds: [players[0].id] })
      .expect(200);

    expect(Array.isArray(rh.body)).toBe(true);
    expect(rh.body[0].memberId).toBe(players[0].id);

    const tr = await request(app)
      .post('/api/tournaments')
      .set(authHeader(token))
      .send({
        name: 'Filter test RR',
        type: 'ROUND_ROBIN',
        participantIds: [players[0].id, players[2].id],
      })
      .expect(201);

    await postRrMatch(tr.body.id, token, players[0].id, players[2].id);

    const mh = await request(app)
      .post('/api/players/match-history')
      .set(authHeader(token))
      .send({ memberId: players[0].id, opponentIds: [players[2].id] })
      .expect(200);

    expect(mh.body.matches?.length).toBeGreaterThanOrEqual(1);
  });
});
