/**
 * Seed roster-only players (no email) with random names, ratings, and ages.
 *
 *   cd server && npx tsx scripts/seedRandomPlayers.ts
 *   cd server && npx tsx scripts/seedRandomPlayers.ts --count 40
 *
 * Requires DATABASE_URL. Safe to re-run: skips name collisions with existing members.
 */
import { MemberRole, PrismaClient, RatingChangeReason } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { createHash, randomBytes } from 'crypto';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

const FIRST_NAMES = [
  'Alex', 'Blake', 'Casey', 'Dana', 'Elliot', 'Finley', 'Gray', 'Harper', 'Jordan', 'Kelly',
  'Logan', 'Morgan', 'Noah', 'Parker', 'Quinn', 'Riley', 'Sam', 'Taylor', 'Avery', 'Brooke',
  'Cameron', 'Drew', 'Emery', 'Frank', 'Glen', 'Helen', 'Ivan', 'Jane', 'Kyle', 'Liam',
  'Mia', 'Nina', 'Oscar', 'Paul', 'Rose', 'Sara', 'Tom', 'Uma', 'Vince', 'Wendy',
  'Xander', 'Yuri', 'Zoe', 'Adam', 'Beth', 'Carl', 'Dora', 'Eric', 'Faith', 'Grant',
];

const LAST_NAMES = [
  'Adams', 'Baker', 'Clark', 'Davis', 'Evans', 'Fisher', 'Garcia', 'Harris', 'Irwin', 'Jones',
  'King', 'Lee', 'Miller', 'Nelson', 'Owens', 'Price', 'Quinn', 'Reed', 'Scott', 'Turner',
  'Underwood', 'Vance', 'Walker', 'Young', 'Brooks', 'Carter', 'Diaz', 'Edwards', 'Foster', 'Gray',
  'Hall', 'Ingram', 'James', 'Kelly', 'Lopez', 'Moore', 'Nguyen', 'Ortiz', 'Patel', 'Ross',
  'Stone', 'Torres', 'Upton', 'Vega', 'Wells', 'Xu', 'Yates', 'Zhang', 'Bennett', 'Cooper',
];

function parseCount(argv: string[]): number {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--count' && argv[i + 1]) {
      const n = parseInt(argv[i + 1], 10);
      if (Number.isInteger(n) && n > 0) return n;
      throw new Error('--count must be a positive integer');
    }
  }
  return 40;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomBirthDateForAge(minAge: number, maxAge: number): Date {
  const age = randomInt(minAge, maxAge);
  const year = new Date().getUTCFullYear() - age;
  const month = randomInt(0, 11);
  const day = randomInt(1, 28);
  return new Date(Date.UTC(year, month, day));
}

function qrTokenHash(): string {
  return createHash('sha256').update(randomBytes(32)).digest('hex');
}

function pickUniqueName(used: Set<string>): { firstName: string; lastName: string } {
  for (let attempt = 0; attempt < 500; attempt++) {
    const firstName = FIRST_NAMES[randomInt(0, FIRST_NAMES.length - 1)];
    const lastName = LAST_NAMES[randomInt(0, LAST_NAMES.length - 1)];
    const key = `${firstName.toLowerCase()}|${lastName.toLowerCase()}`;
    if (!used.has(key)) {
      used.add(key);
      return { firstName, lastName };
    }
  }
  throw new Error('Could not generate a unique name after many attempts');
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is not set in server/.env');
  }

  const count = parseCount(process.argv.slice(2));
  const usedNames = new Set<string>();

  const existing = await prisma.member.findMany({
    select: { firstName: true, lastName: true },
  });
  for (const m of existing) {
    usedNames.add(`${m.firstName.toLowerCase()}|${m.lastName.toLowerCase()}`);
  }

  let created = 0;
  for (let i = 0; i < count; i++) {
    const { firstName, lastName } = pickUniqueName(usedNames);
    const rating = randomInt(800, 1400);
    const birthDate = randomBirthDateForAge(15, 85);

    const member = await prisma.member.create({
      data: {
        firstName,
        lastName,
        email: null,
        gender: 'NOT_SPECIFIED',
        password: '',
        roles: [MemberRole.PLAYER],
        birthDate,
        rating,
        phone: null,
        address: null,
        picture: null,
        qrTokenHash: qrTokenHash(),

        scorePin: '1234',isActive: true,
        emailConfirmedAt: null,
        mustResetPassword: false,
        passwordResetToken: null,
        passwordResetTokenExpiry: null,
        tournamentNotificationsEnabled: false,
      },
    });

    await prisma.ratingHistory.create({
      data: {
        memberId: member.id,
        rating,
        ratingChange: null,
        reason: RatingChangeReason.INITIAL_RATING,
        tournamentId: null,
        matchId: null,
      },
    });

    created++;
    console.log(`  ${created}. ${firstName} ${lastName} — rating ${rating}, age ~${new Date().getUTCFullYear() - birthDate.getUTCFullYear()}`);
  }

  console.log(`\nCreated ${created} random player(s).`);
}

main()
  .catch((err) => {
    console.error('Failed to seed random players:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
