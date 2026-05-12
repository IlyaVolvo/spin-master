/**
 * Upserts three demo members for role-tutorial screenshots and local QA.
 *
 *   cd server && npx tsx scripts/seedRoleTutorialUsers.ts
 *
 * Requires DATABASE_URL (see server/env.example). Safe to re-run: updates password and roles.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { createHash } from 'crypto';

const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const prisma = new PrismaClient();

/** Shared demo password for all three tutorial accounts. */
export const ROLE_TUTORIAL_PASSWORD = 'TutorialDemo#2026';

function qrHash(suffix: string): string {
  return createHash('sha256').update(`role-tutorial:${suffix}:v1`).digest('hex');
}

const specs = [
  {
    key: 'player',
    email: 'tutorial-player@spin-master.local',
    firstName: 'Tutorial',
    lastName: 'PlayerOnly',
    roles: ['PLAYER'] as const,
    rating: 1500,
    qrSuffix: 'player',
  },
  {
    key: 'organizer',
    email: 'tutorial-organizer@spin-master.local',
    firstName: 'Tutorial',
    lastName: 'Organizer',
    roles: ['PLAYER', 'ORGANIZER'] as const,
    rating: 1650,
    qrSuffix: 'organizer',
  },
  {
    key: 'admin',
    email: 'tutorial-admin@spin-master.local',
    firstName: 'Tutorial',
    lastName: 'Administrator',
    roles: ['PLAYER', 'ADMIN'] as const,
    rating: 1800,
    qrSuffix: 'admin',
  },
] as const;

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error('DATABASE_URL is not set. Copy server/env.example to server/.env and configure the database.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(ROLE_TUTORIAL_PASSWORD, 10);

  for (const s of specs) {
    const data = {
      firstName: s.firstName,
      lastName: s.lastName,
      birthDate: new Date('1992-06-01'),
      gender: 'MALE' as const,
      password: passwordHash,
      roles: [...s.roles],
      rating: s.rating,
      isActive: true,
      qrTokenHash: qrHash(s.qrSuffix),
      mustResetPassword: false,
    };

    const existing = await prisma.member.findUnique({ where: { email: s.email } });
    if (existing) {
      await prisma.member.update({
        where: { id: existing.id },
        data: {
          ...data,
          qrTokenHash: existing.qrTokenHash,
        },
      });
      console.log(`Updated member: ${s.email} (${s.roles.join('+')})`);
    } else {
      await prisma.member.create({
        data: {
          email: s.email,
          ...data,
        },
      });
      console.log(`Created member: ${s.email} (${s.roles.join('+')})`);
    }
  }

  console.log('\nLogin password (all three):', ROLE_TUTORIAL_PASSWORD);
  console.log('Emails:', specs.map((x) => x.email).join(', '));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
