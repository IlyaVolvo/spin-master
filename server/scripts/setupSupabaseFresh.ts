/**
 * Factory-reset operational data while preserving system_config and point_exchange_rules.
 * Works against local PostgreSQL or remote Supabase via DATABASE_URL.
 *
 * Usage:
 *   cd server
 *   npx tsx scripts/setupSupabaseFresh.ts \
 *     --sys-admin-email admin@example.com \
 *     --sys-admin-password "StrongPassword"
 *
 * Optional:
 *   --sys-admin-first-name SYS    (default: SYS)
 *   --sys-admin-last-name ADMIN   (default: ADMIN)
 */

import { MemberRole, Prisma, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createHash, randomBytes } from 'crypto';
import readline from 'readline';

const execAsync = promisify(exec);
const prisma = new PrismaClient();

const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const SYSTEM_CONFIG_ID = 'system';
const DEFAULT_CLUB_NAME = 'NO NAME CLUB';

interface SysAdminArgs {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

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

function maskDatabaseUrl(databaseUrl: string): string {
  try {
    const parsed = new URL(databaseUrl);
    if (parsed.password) {
      parsed.password = '********';
    }
    return parsed.toString();
  } catch {
    return databaseUrl.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:********@');
  }
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise<string>((resolve) => {
    rl.question(question, resolve);
  });

  rl.close();
  return answer.trim();
}

async function requireResetConfirmation() {
  const databaseUrl = process.env.DATABASE_URL || '';
  console.log(`Target DB: ${databaseUrl ? maskDatabaseUrl(databaseUrl) : '(DATABASE_URL is not set)'}`);

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Interactive confirmation required. Run this script in an interactive terminal.');
  }

  const firstConfirmation = await prompt(
    'This will DELETE all members and operational data (tournaments, matches, rating history). Type YES to continue: '
  );
  if (firstConfirmation !== 'YES') {
    throw new Error('Reset cancelled (first confirmation not provided).');
  }

  const secondConfirmation = await prompt('Final confirmation. Type RESET to proceed: ');
  if (secondConfirmation !== 'RESET') {
    throw new Error('Reset cancelled (second confirmation not provided).');
  }

  console.log('   ✓ Reset confirmations received\n');
}

function parseCliFlags(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;

    const withoutPrefix = token.slice(2);
    const equalsIndex = withoutPrefix.indexOf('=');

    if (equalsIndex >= 0) {
      const key = withoutPrefix.slice(0, equalsIndex);
      const value = withoutPrefix.slice(equalsIndex + 1).trim();
      result[key] = value;
      continue;
    }

    const key = withoutPrefix;
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      result[key] = next.trim();
      i++;
    } else {
      result[key] = '';
    }
  }

  return result;
}

function getRequiredFlag(flags: Record<string, string>, name: string): string {
  const value = flags[name]?.trim();
  if (!value) {
    throw new Error(`Missing required CLI flag: --${name}`);
  }
  return value;
}

function getSysAdminArgsFromCli(): SysAdminArgs {
  const flags = parseCliFlags(process.argv.slice(2));
  return {
    email: getRequiredFlag(flags, 'sys-admin-email'),
    password: getRequiredFlag(flags, 'sys-admin-password'),
    firstName: flags['sys-admin-first-name']?.trim() || 'SYS',
    lastName: flags['sys-admin-last-name']?.trim() || 'ADMIN',
  };
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/** Default system_config row when the table exists but has no data yet. */
function getBootstrapSystemConfig() {
  return {
    branding: { clubName: DEFAULT_CLUB_NAME },
    authPolicy: {
      minimumPasswordLength: 6,
      passwordResetTokenTtlHours: 1,
    },
    preregistration: {
      defaultTournamentOffsetDays: 1,
      defaultTournamentTime: '18:00',
      registrationDeadlineOffsetMinutes: 30,
      cancelReasonPresets: [
        'Tournament cancelled by organizer',
        'Not enough registered players',
        'Schedule conflict',
        'Venue unavailable',
        'Weather or emergency closure',
      ],
    },
    ratingValidation: {
      ratingInputMin: 0,
      ratingInputMax: 9999,
      suspiciousRatingMin: 800,
      suspiciousRatingMax: 2100,
    },
    tournamentRules: {
      roundRobin: { minPlayers: 3, maxPlayers: 32 },
      playoff: { minPlayers: 2, seedDivisor: 4 },
      swiss: { minPlayers: 6, pairByRating: true, maxRoundsDivisor: 2 },
      multiRoundRobins: { minPlayers: 6, minGroupSize: 3, maxGroupSize: 12, minGroups: 2 },
      preliminary: {
        groupSizeMin: 3,
        groupSizeMax: 12,
        groupSizeDefault: 4,
        finalRoundRobinSizeDefault: 6,
        reservedFinalSpotsForAutoQualified: 6,
      },
      matchScore: { min: 0, max: 10, allowEqualScores: false },
    },
    clientRuntime: {
      tournamentsListCacheTtlMs: 30000,
      socketReconnectionDelayMs: 1000,
      socketReconnectionAttempts: 5,
    },
  };
}

function generateQrTokenHash(): string {
  return createHash('sha256')
    .update(`${randomBytes(32).toString('hex')}:${Date.now()}:${Math.random()}`)
    .digest('hex');
}

async function runCommand(command: string) {
  const { stdout, stderr } = await execAsync(command);
  if (stdout) process.stdout.write(stdout);
  if (stderr && !stderr.includes('Warning')) process.stderr.write(stderr);
}

async function verifyConnection() {
  console.log('1) Verifying database connection...');
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

async function ensureSystemConfig() {
  console.log('4) Ensuring system_config exists...');

  const existing = await prisma.systemConfig.findUnique({
    where: { id: SYSTEM_CONFIG_ID },
  });

  if (existing) {
    console.log('   ✓ Preserved existing system_config row\n');
    return;
  }

  const config = getBootstrapSystemConfig();

  await prisma.systemConfig.create({
    data: {
      id: SYSTEM_CONFIG_ID,
      branding: toPrismaJson(config.branding),
      authPolicy: toPrismaJson(config.authPolicy),
      preregistration: toPrismaJson(config.preregistration),
      ratingValidation: toPrismaJson(config.ratingValidation),
      tournamentRules: toPrismaJson(config.tournamentRules),
      clientRuntime: toPrismaJson(config.clientRuntime),
    },
  });

  console.log(`   ✓ Created default system_config row (club name: "${DEFAULT_CLUB_NAME}")\n`);
}

async function ensurePointExchangeRules() {
  console.log('5) Ensuring point_exchange_rules exist...');

  const count = await prisma.pointExchangeRule.count();
  if (count > 0) {
    console.log(`   ✓ Preserved ${count} existing point exchange rule(s)\n`);
    return;
  }

  const effectiveFrom = new Date('2020-01-01T00:00:00.000Z');
  await prisma.pointExchangeRule.createMany({
    data: POINT_EXCHANGE_RULES.map((rule) => ({
      ...rule,
      effectiveFrom,
    })),
  });

  console.log(`   ✓ Created ${POINT_EXCHANGE_RULES.length} default point exchange rules\n`);
}

// Tables emptied by the reset (excludes preserved system_config and point_exchange_rules).
// All use Int @id @default(autoincrement()); their identity sequences are reset to 1 below.
const RESET_TABLE_NAMES = [
  'rating_history',
  'matches',
  'bracket_matches',
  'tournament_participants',
  'tournament_registrations',
  'swiss_tournament_data',
  'preliminary_configs',
  'tournaments',
  'members',
];

/**
 * Reset each emptied table's autoincrement id sequence so the next inserted row starts at 1.
 * Resolves the actual sequence via pg_get_serial_sequence so it is robust to sequence naming.
 * Run after deletes and before seeding the SYS ADMIN, so that admin becomes member id 1.
 */
async function resetIdentitySequences() {
  for (const table of RESET_TABLE_NAMES) {
    // setval(..., 1, false) makes the next nextval() return 1 (false = "not yet called").
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence($1, 'id'), 1, false)`,
      table,
    );
  }
}

async function resetOperationalDataAndMembers() {
  console.log('7) Resetting operational data and members...');

  await prisma.ratingHistory.deleteMany({});
  await prisma.match.deleteMany({});
  await prisma.bracketMatch.deleteMany({});
  await prisma.tournamentParticipant.deleteMany({});
  await prisma.tournamentRegistration.deleteMany({});
  await prisma.swissTournamentData.deleteMany({});
  await prisma.preliminaryConfig.deleteMany({});
  await prisma.tournament.deleteMany({ where: { parentTournamentId: { not: null } } });
  await prisma.tournament.deleteMany({});
  await prisma.member.deleteMany({});

  await resetIdentitySequences();

  console.log('   ✓ Cleared operational data and members; id sequences reset to 1\n');
}

async function createSysAdmin(sysAdmin: SysAdminArgs) {
  console.log('8) Creating SYS ADMIN member...');

  const hashedPassword = await bcrypt.hash(sysAdmin.password, 10);

  await prisma.member.create({
    data: {
      firstName: sysAdmin.firstName,
      lastName: sysAdmin.lastName,
      email: sysAdmin.email,
      password: hashedPassword,
      roles: [MemberRole.ADMIN],
      isActive: true,
      gender: 'NOT_SPECIFIED',
      qrTokenHash: generateQrTokenHash(),
      mustResetPassword: false,
    },
  });

  console.log(`   ✓ Created SYS ADMIN (${sysAdmin.firstName} ${sysAdmin.lastName}): ${sysAdmin.email}\n`);
}

async function printSummary(sysAdmin: SysAdminArgs) {
  const [memberCount, tournamentCount, matchCount, ruleCount, configCount] = await Promise.all([
    prisma.member.count(),
    prisma.tournament.count(),
    prisma.match.count(),
    prisma.pointExchangeRule.count(),
    prisma.systemConfig.count(),
  ]);

  console.log('Setup summary:');
  console.log(`- members: ${memberCount} (expected: 1 SYS ADMIN)`);
  console.log(`- tournaments: ${tournamentCount} (expected: 0)`);
  console.log(`- matches: ${matchCount} (expected: 0)`);
  console.log(`- point_exchange_rules: ${ruleCount}`);
  console.log(`- system_config rows: ${configCount} (expected: 1)`);
  console.log('');
  console.log('Done. Operational data cleared; system_config and point_exchange_rules preserved (or seeded if missing).');
  console.log(`Login with: ${sysAdmin.email}`);
}

async function main() {
  try {
    getRequiredEnv('DATABASE_URL');
    const sysAdmin = getSysAdminArgsFromCli();

    console.log('=== Factory Reset (preserve system_config + point_exchange_rules) ===\n');
    await verifyConnection();
    await pushSchema();
    await ensureSystemConfig();
    await ensurePointExchangeRules();

    console.log('6) Confirming destructive reset...');
    await requireResetConfirmation();

    await resetOperationalDataAndMembers();
    await createSysAdmin(sysAdmin);
    await printSummary(sysAdmin);
  } catch (error) {
    console.error('\n❌ Factory reset failed');
    console.error(error instanceof Error ? error.message : String(error));
    console.error(
      '\nRequired flags: --sys-admin-email --sys-admin-password\n' +
        'Optional: --sys-admin-first-name (default SYS) --sys-admin-last-name (default ADMIN)\n'
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main();
}
