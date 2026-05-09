/**
 * Copy the single `system_config` row (id = "system") from a source DB to production.
 *
 * Typical use: local DATABASE_URL → Supabase PRODUCTION_DATABASE_URL.
 *
 * From server/:
 *   npx tsx scripts/copySystemConfigToProduction.ts [--dry-run]
 *
 * Env:
 *   DATABASE_URL           — source (defaults from server/.env)
 *   PRODUCTION_DATABASE_URL — target Supabase (do not commit)
 *
 * Optional override:
 *   SYSTEM_CONFIG_SOURCE_DATABASE_URL — source if different from DATABASE_URL
 */

import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

function maskDatabaseUrl(url: string): string {
  try {
    const u = new URL(url);
    const auth = u.username ? `${u.username.slice(0, 2)}***@` : '';
    return `${u.protocol}//${auth}${u.hostname}:${u.port || '5432'}${u.pathname}`;
  } catch {
    return '(unparseable URL)';
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const sourceUrl =
    process.env.SYSTEM_CONFIG_SOURCE_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
  const destUrl = process.env.PRODUCTION_DATABASE_URL?.trim();

  if (!sourceUrl) {
    console.error('Set DATABASE_URL (or SYSTEM_CONFIG_SOURCE_DATABASE_URL) for the source database.');
    process.exit(1);
  }
  if (!destUrl) {
    console.error('Set PRODUCTION_DATABASE_URL for the target database.');
    process.exit(1);
  }

  const source = new PrismaClient({
    datasources: { db: { url: sourceUrl } },
    log: ['error'],
  });
  const dest = new PrismaClient({
    datasources: { db: { url: destUrl } },
    log: ['error'],
  });

  try {
    const row = await source.systemConfig.findUnique({ where: { id: 'system' } });
    if (!row) {
      console.error(
        'No system_config row with id "system" on source. Start the API locally once (initializes defaults) or insert via migration defaults.',
      );
      process.exit(1);
    }

    console.error(`Source: ${maskDatabaseUrl(sourceUrl)}`);
    console.error(`Target: ${maskDatabaseUrl(destUrl)}`);

    if (dryRun) {
      console.error('[dry-run] Would upsert branding, authPolicy, preregistration, ratingValidation, tournamentRules, clientRuntime.');
      console.error(JSON.stringify(row, null, 2));
      return;
    }

    await dest.systemConfig.upsert({
      where: { id: 'system' },
      create: {
        id: row.id,
        branding: row.branding,
        authPolicy: row.authPolicy,
        preregistration: row.preregistration,
        ratingValidation: row.ratingValidation,
        tournamentRules: row.tournamentRules,
        clientRuntime: row.clientRuntime,
      },
      update: {
        branding: row.branding,
        authPolicy: row.authPolicy,
        preregistration: row.preregistration,
        ratingValidation: row.ratingValidation,
        tournamentRules: row.tournamentRules,
        clientRuntime: row.clientRuntime,
      },
    });

    console.error('Copied system_config (id=system) to target database.');
  } finally {
    await source.$disconnect();
    await dest.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
