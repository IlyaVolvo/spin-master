import { MemberRole, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const prisma = new PrismaClient();

const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const DEFAULT_SYS_ADMIN = {
  email: process.env.SYS_ADMIN_EMAIL || 'admin@pingpong.com',
  password: process.env.SYS_ADMIN_PASSWORD || 'Admin123!',
  firstName: process.env.SYS_ADMIN_FIRST_NAME || 'Sys',
  lastName: process.env.SYS_ADMIN_LAST_NAME || 'Admin',
};

const POINT_EXCHANGE_RULES = [
  { minDiff: 0, maxDiff: 12, expectedPoints: 8, upsetPoints: 8 },
  { minDiff: 13, maxDiff: 37, expectedPoints: 7, upsetPoints: 10 },
  { minDiff: 38, maxDiff: 62, expectedPoints: 6, upsetPoints: 13 },
  { minDiff: 63, maxDiff: 87, expectedPoints: 5, upsetPoints: 16 },
  { minDiff: 88, maxDiff: 112, expectedPoints: 4, upsetPoints: 20 },
  { minDiff: 113, maxDiff: 137, expectedPoints: 3, upsetPoints: 25 },
  { minDiff: 138, maxDiff: 162, expectedPoints: 2, upsetPoints: 30 },
  { minDiff: 163, maxDiff: 187, expectedPoints: 2, upsetPoints: 35 },
  { minDiff: 188, maxDiff: 212, expectedPoints: 1, upsetPoints: 40 },
  { minDiff: 213, maxDiff: 237, expectedPoints: 1, upsetPoints: 45 },
  { minDiff: 238, maxDiff: 262, expectedPoints: 0, upsetPoints: 50 },
  { minDiff: 263, maxDiff: 287, expectedPoints: 0, upsetPoints: 55 },
  { minDiff: 288, maxDiff: 312, expectedPoints: 0, upsetPoints: 60 },
  { minDiff: 313, maxDiff: 337, expectedPoints: 0, upsetPoints: 65 },
  { minDiff: 338, maxDiff: 362, expectedPoints: 0, upsetPoints: 70 },
  { minDiff: 363, maxDiff: 387, expectedPoints: 0, upsetPoints: 75 },
  { minDiff: 388, maxDiff: 412, expectedPoints: 0, upsetPoints: 80 },
  { minDiff: 413, maxDiff: 437, expectedPoints: 0, upsetPoints: 85 },
  { minDiff: 438, maxDiff: 462, expectedPoints: 0, upsetPoints: 90 },
  { minDiff: 463, maxDiff: 487, expectedPoints: 0, upsetPoints: 95 },
  { minDiff: 488, maxDiff: 512, expectedPoints: 0, upsetPoints: 100 },
  { minDiff: 513, maxDiff: 99999, expectedPoints: 0, upsetPoints: 100 },
];

async function runCommand(command: string) {
  const { stdout, stderr } = await execAsync(command);
  if (stdout) process.stdout.write(stdout);
  if (stderr && !stderr.includes('Warning')) process.stderr.write(stderr);
}

async function verifyConnection() {
  console.log('1) Verifying Supabase database connection...');
  await prisma.$connect();
  console.log('   ✓ Connected\n');
}

async function pushSchema() {
  console.log('2) Pushing latest Prisma schema (no migrations)...');
  await runCommand('npx prisma db push --skip-generate');
  console.log('   ✓ Schema pushed\n');

  console.log('3) Generating Prisma client...');
  await runCommand('npx prisma generate');
  console.log('   ✓ Prisma client generated\n');
}

async function seedPointExchangeRules() {
  console.log('4) Seeding required rating table (point_exchange_rules)...');

  // Keep this idempotent and deterministic.
  await prisma.pointExchangeRule.deleteMany({});

  const effectiveFrom = new Date('2020-01-01T00:00:00.000Z');
  await prisma.pointExchangeRule.createMany({
    data: POINT_EXCHANGE_RULES.map((rule) => ({
      ...rule,
      effectiveFrom,
    })),
  });

  console.log(`   ✓ Inserted ${POINT_EXCHANGE_RULES.length} point exchange rules\n`);
}

async function createSysAdmin() {
  console.log('5) Creating required Sys Admin member...');

  const hashedPassword = await bcrypt.hash(DEFAULT_SYS_ADMIN.password, 10);

  const existing = await prisma.member.findUnique({
    where: { email: DEFAULT_SYS_ADMIN.email },
  });

  if (existing) {
    await prisma.member.update({
      where: { id: existing.id },
      data: {
        firstName: DEFAULT_SYS_ADMIN.firstName,
        lastName: DEFAULT_SYS_ADMIN.lastName,
        password: hashedPassword,
        roles: [MemberRole.ADMIN],
        isActive: true,
        gender: 'OTHER',
      },
    });
    console.log(`   ✓ Updated existing admin: ${DEFAULT_SYS_ADMIN.email}\n`);
    return;
  }

  await prisma.member.create({
    data: {
      firstName: DEFAULT_SYS_ADMIN.firstName,
      lastName: DEFAULT_SYS_ADMIN.lastName,
      email: DEFAULT_SYS_ADMIN.email,
      password: hashedPassword,
      roles: [MemberRole.ADMIN],
      isActive: true,
      gender: 'OTHER',
      mustResetPassword: false,
    },
  });

  console.log(`   ✓ Created admin: ${DEFAULT_SYS_ADMIN.email}\n`);
}

async function printSummary() {
  const [memberCount, tournamentCount, matchCount, ruleCount] = await Promise.all([
    prisma.member.count(),
    prisma.tournament.count(),
    prisma.match.count(),
    prisma.pointExchangeRule.count(),
  ]);

  console.log('Setup summary:');
  console.log(`- members: ${memberCount} (expected: 1 Sys Admin)`);
  console.log(`- tournaments: ${tournamentCount} (expected: 0)`);
  console.log(`- matches: ${matchCount} (expected: 0)`);
  console.log(`- point_exchange_rules: ${ruleCount} (expected: ${POINT_EXCHANGE_RULES.length})`);
  console.log('');
  console.log('Done. Your Supabase DB now has latest schema + required baseline data only.');
}

async function main() {
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set. Point it to your new Supabase database first.');
    }

    console.log('=== Fresh Supabase DB Setup (Schema + Required Baseline Data) ===\n');
    await verifyConnection();
    await pushSchema();
    await seedPointExchangeRules();
    await createSysAdmin();
    await printSummary();
  } catch (error) {
    console.error('\n❌ Failed to setup fresh Supabase DB');
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main();
}
