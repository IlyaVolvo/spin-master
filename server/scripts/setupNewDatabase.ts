/**
 * Setup script for new spin-master database
 * This script initializes a clean database with the new schema
 * 
 * Usage:
 *   cd server
 *   tsx scripts/setupNewDatabase.ts \
 *     --sys-admin-email admin@example.com \
 *     --sys-admin-password "StrongPassword" \
 *     --sys-admin-first-name "System" \
 *     --sys-admin-last-name "Admin"
 */

import { MemberRole, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { exec } from 'child_process';
import { createHash, randomBytes } from 'crypto';
import readline from 'readline';
import { promisify } from 'util';

const execAsync = promisify(exec);
const prisma = new PrismaClient();

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

  const firstConfirmation = await prompt('This will DELETE ALL DATA in the target DB. Type YES to continue: ');
  if (firstConfirmation !== 'YES') {
    throw new Error('Reset cancelled (first confirmation not provided).');
  }

  const secondConfirmation = await prompt('Final confirmation. Type RESET to proceed: ');
  if (secondConfirmation !== 'RESET') {
    throw new Error('Reset cancelled (second confirmation not provided).');
  }

  console.log('✓ Reset confirmations received\n');
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
    firstName: getRequiredFlag(flags, 'sys-admin-first-name'),
    lastName: getRequiredFlag(flags, 'sys-admin-last-name'),
  };
}

function generateQrTokenHash(): string {
  return createHash('sha256')
    .update(`${randomBytes(32).toString('hex')}:${Date.now()}:${Math.random()}`)
    .digest('hex');
}

async function seedPointExchangeRules() {
  console.log('Step 5: Seeding point exchange rules...');
  await prisma.pointExchangeRule.deleteMany({});

  const effectiveFrom = new Date('2020-01-01T00:00:00.000Z');
  await prisma.pointExchangeRule.createMany({
    data: POINT_EXCHANGE_RULES.map((rule) => ({
      ...rule,
      effectiveFrom,
    })),
  });

  console.log(`✓ Inserted ${POINT_EXCHANGE_RULES.length} point exchange rules\n`);
}

async function createInitialMember(sysAdmin: SysAdminArgs) {
  console.log('Step 6: Creating initial system admin member...');

  const hashedPassword = await bcrypt.hash(sysAdmin.password, 10);
  await prisma.member.create({
    data: {
      firstName: sysAdmin.firstName,
      lastName: sysAdmin.lastName,
      email: sysAdmin.email,
      password: hashedPassword,
      roles: [MemberRole.ORGANIZER],
      isActive: true,
      gender: 'OTHER',
      qrTokenHash: generateQrTokenHash(),
      mustResetPassword: false,
    },
  });

  console.log(`✓ Created initial system admin member: ${sysAdmin.email}\n`);
}

async function setupDatabase() {
  try {
    const sysAdmin = getSysAdminArgsFromCli();
    console.log('Setting up new spin-master database...\n');

    // Step 1: Check if database exists
    console.log('Step 1: Checking database connection...');
    try {
      await prisma.$connect();
      console.log('✓ Database connection successful\n');
    } catch (error) {
      console.error('✗ Database connection failed');
      console.error('Please ensure PostgreSQL is running and DATABASE_URL in .env is correct');
      console.error('Expected database name: spin-master\n');
      process.exit(1);
    }

    // Safety confirmation before destructive reset
    console.log('Step 2: Confirming destructive reset...');
    await requireResetConfirmation();

    // Step 3: Reset DB and push schema (destructive, intended for fresh initialization)
    console.log('Step 3: Resetting database and pushing schema...');
    try {
      const { stdout, stderr } = await execAsync('npx prisma db push --force-reset');
      if (stdout) console.log(stdout);
      if (stderr && !stderr.includes('Warning')) console.error(stderr);
      console.log('✓ Database reset and schema pushed successfully\n');
    } catch (error: any) {
      console.error('✗ Failed to push schema');
      console.error(error.message);
      process.exit(1);
    }

    // Step 4: Generate Prisma client
    console.log('Step 4: Generating Prisma client...');
    try {
      const { stdout, stderr } = await execAsync('npx prisma generate');
      if (stdout) console.log(stdout);
      if (stderr && !stderr.includes('Warning')) console.error(stderr);
      console.log('✓ Prisma client generated successfully\n');
    } catch (error: any) {
      console.error('✗ Failed to generate Prisma client');
      console.error(error.message);
      process.exit(1);
    }

    await seedPointExchangeRules();
    await createInitialMember(sysAdmin);

    // Step 7: Verify tables and baseline data
    console.log('Step 7: Verifying database structure and baseline data...');
    try {
      const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY tablename;
      `;
      
      const expectedTables = [
        'members',
        'rating_history',
        'tournaments',
        'tournament_participants',
        'bracket_matches',
        'matches',
        'point_exchange_rules',
        'preliminary_configs',
        'swiss_tournament_data',
      ];

      console.log(`Found ${tables.length} tables:`);
      tables.forEach(table => {
        const isExpected = expectedTables.includes(table.tablename);
        console.log(`  ${isExpected ? '✓' : '?'} ${table.tablename}`);
      });

      const missingTables = expectedTables.filter(t => 
        !tables.some(tb => tb.tablename === t)
      );

      if (missingTables.length > 0) {
        console.error(`\n✗ Missing tables: ${missingTables.join(', ')}`);
        process.exit(1);
      }

      const [memberCount, pointRulesCount] = await Promise.all([
        prisma.member.count(),
        prisma.pointExchangeRule.count(),
      ]);

      if (memberCount === 0) {
        console.error('\n✗ Missing baseline member data');
        process.exit(1);
      }

      if (pointRulesCount === 0) {
        console.error('\n✗ Missing baseline point_exchange_rules data');
        process.exit(1);
      }

      console.log(`\n✓ All expected tables created successfully (members=${memberCount}, point_exchange_rules=${pointRulesCount})\n`);
    } catch (error: any) {
      console.error('✗ Failed to verify database structure');
      console.error(error.message);
      process.exit(1);
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log('✓ Database setup completed successfully!');
    console.log('═══════════════════════════════════════════════════════');
    console.log('\nNext steps:');
    console.log('1. Start the server: npm run dev');
    console.log(`2. Login using: ${sysAdmin.email}`);
    console.log('   (the password is the value passed via --sys-admin-password)\n');

  } catch (error: any) {
    console.error('\n✗ Setup failed:', error.message);
    console.error('Required flags: --sys-admin-email --sys-admin-password --sys-admin-first-name --sys-admin-last-name\n');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the setup
setupDatabase();
