import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'crypto';

/** Clear app-owned data so each functional scenario starts from a deterministic empty slate. */
export async function resetAppDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.ratingHistory.deleteMany();
  await prisma.match.deleteMany();
  await prisma.bracketMatch.deleteMany();
  await prisma.tournamentParticipant.deleteMany();
  await prisma.swissTournamentData.deleteMany();
  await prisma.preliminaryConfig.deleteMany();
  await prisma.tournament.deleteMany({ where: { parentTournamentId: { not: null } } });
  await prisma.tournament.deleteMany();
  await prisma.member.deleteMany();
}

export function jwtSecret(): string {
  return process.env.JWT_SECRET || process.env.SESSION_SECRET || 'secret';
}

export function makeMemberJwt(memberId: number): string {
  return jwt.sign({ memberId, type: 'member' }, jwtSecret(), { expiresIn: '7d' });
}

export function qrTokenHash(): string {
  return createHash('sha256')
    .update(`${randomBytes(32).toString('hex')}:functional-test`)
    .digest('hex');
}

export interface SeedPlayerSpec {
  firstName: string;
  lastName: string;
  email: string;
  rating: number;
}

/** Plaintext password for every member created by {@link seedPlayers} (bcrypt-hashed in DB). */
export const FUNCTIONAL_TEST_PLAYER_PASSWORD = 'PlayerPass#1';

/** Create an active organizer (and player) for Bearer auth against protected routes. */
export async function seedOrganizer(
  prisma: PrismaClient,
  params: { email: string; password: string } = {
    email: 'organizer.functional@test.local',
    password: 'FunctionalTest#1',
  },
): Promise<{ id: number; token: string }> {
  const passwordHash = await bcrypt.hash(params.password, 10);
  const member = await prisma.member.create({
    data: {
      firstName: 'Functional',
      lastName: 'Organizer',
      email: params.email,
      gender: 'MALE',
      birthDate: new Date('1990-06-15'),
      password: passwordHash,
      roles: ['PLAYER', 'ORGANIZER'],
      rating: 1600,
      isActive: true,
      qrTokenHash: qrTokenHash(),
      mustResetPassword: false,
    },
  });
  return { id: member.id, token: makeMemberJwt(member.id) };
}

/** Create an administrator for Bearer auth (editing other members, restricted fields). */
export async function seedAdmin(
  prisma: PrismaClient,
  params: { email: string; password: string } = {
    email: 'admin.functional@test.local',
    password: 'FunctionalTest#1',
  },
): Promise<{ id: number; token: string }> {
  const passwordHash = await bcrypt.hash(params.password, 10);
  const member = await prisma.member.create({
    data: {
      firstName: 'Functional',
      lastName: 'Admin',
      email: params.email,
      gender: 'MALE',
      birthDate: new Date('1990-06-15'),
      password: passwordHash,
      roles: ['PLAYER', 'ADMIN'],
      rating: 2000,
      isActive: true,
      qrTokenHash: qrTokenHash(),
      mustResetPassword: false,
    },
  });
  return { id: member.id, token: makeMemberJwt(member.id) };
}

/** Create deterministic players with distinct ratings (higher id order = spread ratings). */
export async function seedPlayers(
  prisma: PrismaClient,
  specs: SeedPlayerSpec[],
): Promise<{ id: number; email: string; rating: number }[]> {
  const passwordHash = await bcrypt.hash(FUNCTIONAL_TEST_PLAYER_PASSWORD, 10);
  const out: { id: number; email: string; rating: number }[] = [];
  for (const s of specs) {
    const m = await prisma.member.create({
      data: {
        firstName: s.firstName,
        lastName: s.lastName,
        email: s.email,
        gender: 'MALE',
        birthDate: new Date('1995-03-20'),
        password: passwordHash,
        roles: ['PLAYER'],
        rating: s.rating,
        isActive: true,
        qrTokenHash: qrTokenHash(),
        mustResetPassword: false,
      },
    });
    out.push({ id: m.id, email: m.email ?? s.email, rating: s.rating });
  }
  return out;
}

/** All unordered pairs from a list of member ids (for round-robin). */
export function roundRobinPairs(ids: number[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      pairs.push([ids[i], ids[j]]);
    }
  }
  return pairs;
}
