/**
 * Always-reset tutorial DB: wipe schema, prisma db push, then seed.
 *
 *   cd server && npm run tutorials:reset-seed
 *
 * Requires DATABASE_URL_TUTORIAL pointing at a DB whose name contains "tutorial".
 * Uses DROP SCHEMA + `db push` (not migrate reset) so a disposable tutorial DB
 * always matches the current Prisma schema even if migration history is awkward
 * on greenfield databases.
 */
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { assertTutorialDatabaseUrl, redactDatabaseUrl } from './lib/safety';

const serverRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(serverRoot, '.env') });

async function wipeTutorialSchema(tutorialUrl: string): Promise<void> {
  process.env.DATABASE_URL = tutorialUrl;
  const prisma = new PrismaClient();
  try {
    console.log('[tutorials:reset-seed] Dropping public schema …');
    await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
    await prisma.$executeRawUnsafe('CREATE SCHEMA public');
    await prisma.$executeRawUnsafe('GRANT ALL ON SCHEMA public TO public');
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const tutorialUrl = assertTutorialDatabaseUrl(process.env.DATABASE_URL_TUTORIAL);
  console.log('[tutorials:reset-seed] Target:', redactDatabaseUrl(tutorialUrl));

  await wipeTutorialSchema(tutorialUrl);

  console.log('[tutorials:reset-seed] Running prisma db push …');
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    stdio: 'inherit',
    cwd: serverRoot,
    env: {
      ...process.env,
      DATABASE_URL: tutorialUrl,
    },
  });

  console.log('[tutorials:reset-seed] Seeding …');
  execSync('npx tsx scripts/tutorials/seedTutorialDb.ts', {
    stdio: 'inherit',
    cwd: serverRoot,
    env: {
      ...process.env,
      DATABASE_URL: tutorialUrl,
      DATABASE_URL_TUTORIAL: tutorialUrl,
    },
  });

  console.log(
    '[tutorials:reset-seed] Done. Start the API with DATABASE_URL set to the tutorial DB, then run npm run tutorials:capture',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
