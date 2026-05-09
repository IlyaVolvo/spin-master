/**
 * Align a remote Postgres DB (e.g. Supabase production) with prisma/schema.prisma on this branch,
 * then optionally record every migration folder as applied without re-running SQL.
 *
 * Usage (from server/):
 *   PRODUCTION_DATABASE_URL="postgresql://..." npx tsx scripts/syncProductionSchema.ts diff [--output drift.sql]
 *   PRODUCTION_DATABASE_URL="postgresql://..." npx tsx scripts/syncProductionSchema.ts mark-applied
 *
 * Optional:
 *   SHADOW_DATABASE_URL — passed to `prisma migrate diff` when Prisma requires a shadow database.
 *
 * Do not commit production URLs. Prefer inline env for one-shot commands.
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const SERVER_ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(SERVER_ROOT, '.env') });

const MIGRATIONS_DIR = path.join(SERVER_ROOT, 'prisma', 'migrations');

function requireProdUrl(): string {
  const url = process.env.PRODUCTION_DATABASE_URL?.trim();
  if (!url) {
    console.error(
      'Missing PRODUCTION_DATABASE_URL.\nExample:\n  PRODUCTION_DATABASE_URL="postgresql://..." npx tsx scripts/syncProductionSchema.ts diff\n',
    );
    process.exit(1);
  }
  return url;
}

function buildDiffArgs(prodUrl: string): string[] {
  const shadow = process.env.SHADOW_DATABASE_URL?.trim();
  const args = ['prisma', 'migrate', 'diff'];
  if (shadow) {
    args.push('--shadow-database-url', shadow);
  }
  args.push('--from-url', prodUrl, '--to-schema-datamodel', 'prisma/schema.prisma', '--script');
  return args;
}

function runDiff(outputPath?: string): void {
  const prodUrl = requireProdUrl();
  const args = buildDiffArgs(prodUrl);

  const result = spawnSync('npx', args, {
    cwd: SERVER_ROOT,
    encoding: 'utf-8',
    shell: false,
  });

  const sql = result.stdout ?? '';
  const err = result.stderr ?? '';

  if (result.status !== 0) {
    console.error(err || sql);
    process.exit(result.status ?? 1);
  }

  if (outputPath) {
    fs.writeFileSync(outputPath, sql, 'utf-8');
    console.error(`Wrote SQL drift script to ${outputPath}`);
  } else {
    process.stdout.write(sql);
  }

  if (!sql.trim()) {
    console.error('\n(No SQL diff — production schema already matches prisma/schema.prisma.)');
  } else {
    console.error(
      '\nReview the SQL, back up production, then apply it (Supabase SQL editor or psql).\nAfter the schema matches this branch, run: mark-applied',
    );
  }
}

function listMigrationFolders(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

function markAllApplied(): void {
  const prodUrl = requireProdUrl();
  const folders = listMigrationFolders();

  console.error(`Recording ${folders.length} migration(s) as applied against PRODUCTION_DATABASE_URL...\n`);

  for (const name of folders) {
    const result = spawnSync(
      'npx',
      ['prisma', 'migrate', 'resolve', '--applied', name],
      {
        cwd: SERVER_ROOT,
        encoding: 'utf-8',
        env: { ...process.env, DATABASE_URL: prodUrl },
        shell: false,
      },
    );

    const msg = (result.stderr || result.stdout || '').trim();
    if (result.status === 0) {
      console.error(`  ✓ ${name}`);
    } else if (/already\s+applied|already\s+recorded|P3008/i.test(msg)) {
      console.error(`  (skip) ${name} — already recorded`);
    } else {
      console.error(`  ✗ ${name}\n${msg}`);
      process.exit(result.status ?? 1);
    }
  }

  console.error('\nDone. Verify with:\n  DATABASE_URL="$PRODUCTION_DATABASE_URL" npx prisma migrate status\n');
}

const cmd = process.argv[2];
const outIdx = process.argv.indexOf('--output');
const outputPath = outIdx >= 0 ? process.argv[outIdx + 1] : undefined;

if (cmd === 'diff') {
  runDiff(outputPath);
} else if (cmd === 'mark-applied') {
  markAllApplied();
} else {
  console.error(`Usage:
  PRODUCTION_DATABASE_URL="postgresql://..." npx tsx scripts/syncProductionSchema.ts diff [--output drift.sql]
  PRODUCTION_DATABASE_URL="postgresql://..." npx tsx scripts/syncProductionSchema.ts mark-applied
`);
  process.exit(1);
}
