/**
 * Replica members + tournament graph from a release DB into a checkin-branch staging DB.
 *
 * Preserves on dest: system_config, club_plans, point_exchange_rules.
 * Wipes on dest: members, tournaments, related rows, club visits/payments/entitlements/credits.
 *
 * From server/:
 *   npx tsx scripts/migrateReleaseDataToCheckin.ts \
 *     --source <sourceGitBranch> '<SOURCE_URL>' \
 *     --dest <destGitBranch> '<DEST_URL>'
 *
 * Or: npm run migrate-release-to-checkin -- --source branch '…' --dest branch '…'
 *
 * Optional: --allow-db-ahead — schema gate passes if every branch migration is applied,
 * even when the DB has extra migrations not on that branch (DB must not be behind).
 *
 * Source is read-only (SELECT only). Default schema gate requires exact migration set match.
 */

import { execFileSync } from 'child_process';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const MIGRATIONS_GIT_PATH = 'server/prisma/migrations';

const PRESERVE_TABLES = ['system_config', 'club_plans', 'point_exchange_rules'] as const;

/** Dest tables wiped before copy (never includes preserve tables). */
const WIPE_TABLES = [
  'club_visits',
  'club_payments',
  'club_entitlements',
  'club_credits',
  'bracket_matches',
  'matches',
  'tournament_participants',
  'tournament_registrations',
  'swiss_tournament_data',
  'preliminary_configs',
  'rating_history',
  'tournaments',
  'members',
] as const;

/** Copy order (parents before children; bracket_matches.nextMatchId patched in a second pass). */
const COPY_TABLES = [
  'members',
  'tournaments',
  'tournament_participants',
  'tournament_registrations',
  'matches',
  'bracket_matches',
  'swiss_tournament_data',
  'preliminary_configs',
  'rating_history',
] as const;

const BATCH_SIZE = 200;

type Side = {
  url: string;
  branch: string;
  label: 'source' | 'dest';
};

type SchemaGateResult = {
  ok: boolean;
  branchMigrations: string[];
  appliedMigrations: string[];
  missingOnDb: string[];
  extraOnDb: string[];
  mode: 'exact' | 'allow-db-ahead';
};

type Report = {
  source: { urlMasked: string; branch: string };
  dest: { urlMasked: string; branch: string };
  schemaGate: { source: SchemaGateResult; dest: SchemaGateResult };
  wipeCounts: Record<string, number>;
  insertCounts: Record<string, { source: number; inserted: number }>;
  sequences: Record<string, number | null>;
  elapsedMs: number;
  error?: string;
};

function maskDatabaseUrl(url: string): string {
  try {
    const u = new URL(url);
    const auth = u.username ? `${u.username.slice(0, 2)}***@` : '';
    return `${u.protocol}//${auth}${u.hostname}:${u.port || '5432'}${u.pathname}`;
  } catch {
    return '(unparseable URL)';
  }
}

function dbIdentity(url: string): { host: string; port: string; database: string } {
  const u = new URL(url);
  const database = u.pathname.replace(/^\//, '').split('?')[0] || '';
  return {
    host: u.hostname,
    port: u.port || '5432',
    database,
  };
}

function findGitRoot(): string {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
    cwd: path.join(__dirname, '..'),
  }).trim();
}

function listBranchMigrations(gitRoot: string, branch: string): string[] {
  let listing: string;
  try {
    listing = execFileSync(
      'git',
      ['ls-tree', '-r', '--name-only', branch, '--', MIGRATIONS_GIT_PATH],
      { encoding: 'utf8', cwd: gitRoot },
    );
  } catch (err) {
    throw new Error(
      `Failed to list migrations for git branch "${branch}". Ensure the branch exists locally.\n${String(err)}`,
    );
  }

  const names = new Set<string>();
  for (const line of listing.split('\n')) {
    const trimmed = line.trim();
    // server/prisma/migrations/<name>/migration.sql
    const m = trimmed.match(
      /^server\/prisma\/migrations\/([^/]+)\/migration\.sql$/,
    );
    if (m) names.add(m[1]);
  }
  return [...names].sort();
}

function parseArgs(argv: string[]): {
  source: Side;
  dest: Side;
  allowDbAhead: boolean;
} {
  const args = argv.slice(2);
  let sourceUrl: string | undefined;
  let sourceBranch: string | undefined;
  let destUrl: string | undefined;
  let destBranch: string | undefined;
  let allowDbAhead = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--allow-db-ahead') {
      allowDbAhead = true;
      continue;
    }
    if (a === '--source') {
      const branch = args[i + 1];
      const url = args[i + 2];
      if (!branch || branch.startsWith('--') || !url || url.startsWith('--')) {
        throw new Error('--source requires exactly two tokens: <gitBranch> <DATABASE_URL>');
      }
      sourceBranch = branch;
      sourceUrl = url;
      i += 2;
      continue;
    }
    if (a === '--dest') {
      const branch = args[i + 1];
      const url = args[i + 2];
      if (!branch || branch.startsWith('--') || !url || url.startsWith('--')) {
        throw new Error('--dest requires exactly two tokens: <gitBranch> <DATABASE_URL>');
      }
      destBranch = branch;
      destUrl = url;
      i += 2;
      continue;
    }
    throw new Error(`Unexpected argument: ${a}`);
  }

  if (!sourceUrl || !sourceBranch) {
    throw new Error('Missing --source <gitBranch> <DATABASE_URL>');
  }
  if (!destUrl || !destBranch) {
    throw new Error('Missing --dest <gitBranch> <DATABASE_URL>');
  }

  return {
    source: { url: sourceUrl, branch: sourceBranch, label: 'source' },
    dest: { url: destUrl, branch: destBranch, label: 'dest' },
    allowDbAhead,
  };
}

function printUsage(): void {
  console.error(`Usage (from server/):
  npx tsx scripts/migrateReleaseDataToCheckin.ts \\
    --source <sourceGitBranch> '<SOURCE_DATABASE_URL>' \\
    --dest <destGitBranch> '<DEST_DATABASE_URL>' \\
    [--allow-db-ahead]

Both --source and --dest require exactly two tokens (branch + URL).
Default schema gate: DB migrations must exactly match the git branch.
--allow-db-ahead: allow extra migrations on the DB; still fail if the DB is missing any branch migration.
Source is read-only. Dest member/tournament/club-log data is wiped; system_config, club_plans, and point_exchange_rules are preserved.`);
}

async function listAppliedMigrations(client: PrismaClient): Promise<string[]> {
  const rows = await client.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name
    FROM _prisma_migrations
    WHERE finished_at IS NOT NULL
      AND rolled_back_at IS NULL
    ORDER BY migration_name
  `;
  return rows.map((r) => r.migration_name);
}

function compareMigrations(
  branchMigrations: string[],
  appliedMigrations: string[],
  allowDbAhead: boolean,
): SchemaGateResult {
  const branchSet = new Set(branchMigrations);
  const appliedSet = new Set(appliedMigrations);
  const missingOnDb = branchMigrations.filter((m) => !appliedSet.has(m));
  const extraOnDb = appliedMigrations.filter((m) => !branchSet.has(m));
  const mode = allowDbAhead ? 'allow-db-ahead' : 'exact';
  const ok = allowDbAhead
    ? missingOnDb.length === 0
    : missingOnDb.length === 0 && extraOnDb.length === 0;
  return {
    ok,
    branchMigrations,
    appliedMigrations,
    missingOnDb,
    extraOnDb,
    mode,
  };
}

async function tableExists(client: PrismaClient, table: string): Promise<boolean> {
  const rows = await client.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ${table}
    ) AS exists
  `;
  return Boolean(rows[0]?.exists);
}

async function tableColumnTypes(
  client: PrismaClient,
  table: string,
): Promise<Record<string, { dataType: string; udtName: string }>> {
  const rows = await client.$queryRaw<
    { column_name: string; data_type: string; udt_name: string }[]
  >`
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${table}
  `;
  const out: Record<string, { dataType: string; udtName: string }> = {};
  for (const r of rows) {
    out[r.column_name] = { dataType: r.data_type, udtName: r.udt_name };
  }
  return out;
}

/** SQL cast suffix for a dest column (e.g. ::"Gender", ::"MemberRole"[]), or empty. */
function sqlCastForColumn(meta: { dataType: string; udtName: string } | undefined): string {
  if (!meta) return '';
  if (meta.dataType === 'USER-DEFINED') {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(meta.udtName)) {
      throw new Error(`Unsafe udt name: ${meta.udtName}`);
    }
    return `::"${meta.udtName}"`;
  }
  if (meta.dataType === 'ARRAY') {
    const elem = meta.udtName.startsWith('_') ? meta.udtName.slice(1) : meta.udtName;
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(elem)) {
      throw new Error(`Unsafe array element type: ${elem}`);
    }
    // Enum/user arrays need quoted element type; built-in int[] etc. also fine quoted.
    return `::"${elem}"[]`;
  }
  if (meta.dataType === 'json' || meta.dataType === 'jsonb') {
    return '::jsonb';
  }
  return '';
}

async function tableColumns(client: PrismaClient, table: string): Promise<string[]> {
  const rows = await client.$queryRaw<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${table}
    ORDER BY ordinal_position
  `;
  return rows.map((r) => r.column_name);
}

async function countRows(client: PrismaClient, table: string): Promise<number> {
  const rows = await client.$queryRawUnsafe<[{ count: bigint }]>(
    `SELECT COUNT(*)::bigint AS count FROM "public"."${table}"`,
  );
  return Number(rows[0]?.count ?? 0);
}

function quoteIdent(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe identifier: ${name}`);
  }
  return `"${name}"`;
}

async function fetchAllRows(
  client: PrismaClient,
  table: string,
  columns: string[],
): Promise<Record<string, unknown>[]> {
  const cols = columns.map(quoteIdent).join(', ');
  // Source read-only SELECT
  return client.$queryRawUnsafe(
    `SELECT ${cols} FROM "public".${quoteIdent(table)}`,
  );
}

/** tournaments: parents (null parent) first, then children by depth. */
async function fetchTournamentsOrdered(
  client: PrismaClient,
  columns: string[],
): Promise<Record<string, unknown>[]> {
  const cols = columns.map((c) => `t.${quoteIdent(c)}`).join(', ');
  return client.$queryRawUnsafe(`
    WITH RECURSIVE tree AS (
      SELECT t.*, 0 AS depth
      FROM "public"."tournaments" t
      WHERE t."parentTournamentId" IS NULL
      UNION ALL
      SELECT c.*, tree.depth + 1
      FROM "public"."tournaments" c
      INNER JOIN tree ON c."parentTournamentId" = tree.id
    )
    SELECT ${cols}
    FROM tree t
    ORDER BY t.depth ASC, t.id ASC
  `);
}

async function insertBatch(
  dest: PrismaClient,
  table: string,
  columns: string[],
  rows: Record<string, unknown>[],
  nullColumns: string[] = [],
  columnTypes: Record<string, { dataType: string; udtName: string }> = {},
): Promise<number> {
  if (rows.length === 0) return 0;
  const nullSet = new Set(nullColumns);

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const colList = columns.map(quoteIdent).join(', ');
    const valuesSql: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    for (const row of batch) {
      const placeholders: string[] = [];
      for (const col of columns) {
        const cast = sqlCastForColumn(columnTypes[col]);
        placeholders.push(`$${p++}${cast}`);
        let val = row[col];
        if (nullSet.has(col)) {
          val = null;
        } else if (table === 'tournament_registrations' && col === 'eventPaymentId') {
          val = null;
        }
        params.push(val === undefined ? null : val);
      }
      valuesSql.push(`(${placeholders.join(', ')})`);
    }
    const sql = `INSERT INTO "public".${quoteIdent(table)} (${colList}) VALUES ${valuesSql.join(', ')}`;
    await dest.$executeRawUnsafe(sql, ...params);
    inserted += batch.length;
  }
  return inserted;
}

/** Second pass for bracket_matches.self-FK nextMatchId (Neon disallows session_replication_role). */
async function updateBracketNextMatchIds(
  dest: PrismaClient,
  rows: Record<string, unknown>[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    for (const row of batch) {
      const id = row.id;
      const nextMatchId = row.nextMatchId;
      if (id == null || nextMatchId == null) continue;
      await dest.$executeRawUnsafe(
        `UPDATE "public"."bracket_matches" SET "nextMatchId" = $1 WHERE "id" = $2`,
        nextMatchId,
        id,
      );
    }
  }
}

async function resetSequence(dest: PrismaClient, table: string): Promise<number | null> {
  const seqRows = await dest.$queryRawUnsafe<{ seq: string | null }[]>(
    `SELECT pg_get_serial_sequence('public.${table}', 'id') AS seq`,
  );
  const seq = seqRows[0]?.seq;
  if (!seq) return null;

  // Validate sequence name shape (schema.seq or just seq)
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/.test(seq)) {
    throw new Error(`Unexpected sequence name for ${table}: ${seq}`);
  }

  const maxRows = await dest.$queryRawUnsafe<[{ max: number | null }]>(
    `SELECT MAX(id)::int AS max FROM "public".${quoteIdent(table)}`,
  );
  const maxId = maxRows[0]?.max;
  if (maxId == null) {
    await dest.$executeRawUnsafe(`SELECT setval($1::regclass, 1, false)`, seq);
    return 0;
  }
  await dest.$executeRawUnsafe(`SELECT setval($1::regclass, $2::bigint, true)`, seq, maxId);
  return maxId;
}

function printReport(report: Report): void {
  console.log('\n=== Release → checkin migrate report ===');
  console.log(`Source: ${report.source.urlMasked}  branch=${report.source.branch}`);
  console.log(`Dest:   ${report.dest.urlMasked}  branch=${report.dest.branch}`);
  console.log(`Elapsed: ${report.elapsedMs} ms`);

  for (const side of ['source', 'dest'] as const) {
    const g = report.schemaGate[side];
    console.log(
      `\nSchema gate [${side}]: ${g.ok ? 'OK' : 'FAIL'} ` +
        `(mode=${g.mode} branch=${g.branchMigrations.length} applied=${g.appliedMigrations.length})`,
    );
    if (g.missingOnDb.length) {
      console.log(`  Missing on DB: ${g.missingOnDb.join(', ')}`);
    }
    if (g.extraOnDb.length) {
      console.log(`  Extra on DB: ${g.extraOnDb.join(', ')}`);
    }
  }

  if (Object.keys(report.wipeCounts).length) {
    console.log('\nWipe counts:');
    for (const [t, n] of Object.entries(report.wipeCounts)) {
      console.log(`  ${t}: ${n}`);
    }
  }

  if (Object.keys(report.insertCounts).length) {
    console.log('\nInsert counts (source → inserted):');
    for (const [t, c] of Object.entries(report.insertCounts)) {
      console.log(`  ${t}: ${c.source} → ${c.inserted}`);
    }
  }

  if (Object.keys(report.sequences).length) {
    console.log('\nSequences setval(MAX):');
    for (const [t, v] of Object.entries(report.sequences)) {
      console.log(`  ${t}: ${v == null ? '(no serial id)' : v}`);
    }
  }

  console.log(`\nPreserved on dest (untouched): ${PRESERVE_TABLES.join(', ')}`);
  if (report.error) {
    console.log(`\nERROR: ${report.error}`);
  } else {
    console.log('\nResult: SUCCESS');
  }
}

async function main(): Promise<void> {
  const started = Date.now();
  let report: Report | undefined;

  try {
    const { source, dest, allowDbAhead } = parseArgs(process.argv);
    const srcId = dbIdentity(source.url);
    const dstId = dbIdentity(dest.url);
    if (
      srcId.host === dstId.host &&
      srcId.port === dstId.port &&
      srcId.database === dstId.database
    ) {
      throw new Error(
        `Source and dest resolve to the same database (${srcId.host}:${srcId.port}/${srcId.database}). Refusing to run.`,
      );
    }

    const gitRoot = findGitRoot();
    const sourceClient = new PrismaClient({
      datasources: { db: { url: source.url } },
      log: ['error'],
    });
    const destClient = new PrismaClient({
      datasources: { db: { url: dest.url } },
      log: ['error'],
    });

    report = {
      source: { urlMasked: maskDatabaseUrl(source.url), branch: source.branch },
      dest: { urlMasked: maskDatabaseUrl(dest.url), branch: dest.branch },
      schemaGate: {
        source: {
          ok: false,
          branchMigrations: [],
          appliedMigrations: [],
          missingOnDb: [],
          extraOnDb: [],
          mode: allowDbAhead ? 'allow-db-ahead' : 'exact',
        },
        dest: {
          ok: false,
          branchMigrations: [],
          appliedMigrations: [],
          missingOnDb: [],
          extraOnDb: [],
          mode: allowDbAhead ? 'allow-db-ahead' : 'exact',
        },
      },
      wipeCounts: {},
      insertCounts: {},
      sequences: {},
      elapsedMs: 0,
    };

    try {
      const sourceBranchMigrations = listBranchMigrations(gitRoot, source.branch);
      const destBranchMigrations = listBranchMigrations(gitRoot, dest.branch);

      const sourceApplied = await listAppliedMigrations(sourceClient);
      const destApplied = await listAppliedMigrations(destClient);

      report.schemaGate.source = compareMigrations(
        sourceBranchMigrations,
        sourceApplied,
        allowDbAhead,
      );
      report.schemaGate.dest = compareMigrations(
        destBranchMigrations,
        destApplied,
        allowDbAhead,
      );

      if (!report.schemaGate.source.ok || !report.schemaGate.dest.ok) {
        report.elapsedMs = Date.now() - started;
        report.error = 'Schema gate failed; no changes written to dest.';
        printReport(report);
        process.exit(1);
      }

      // Wipe only tables that exist on dest (branch may add tables over time)
      const wipeExisting: string[] = [];
      for (const table of WIPE_TABLES) {
        if (await tableExists(destClient, table)) {
          wipeExisting.push(table);
          report.wipeCounts[table] = await countRows(destClient, table);
        } else {
          report.wipeCounts[table] = 0;
        }
      }

      // Source column lists + row fetches (read-only). Skip tables absent on source.
      const copyCols: Record<string, string[]> = {};
      const copyTypes: Record<string, Record<string, { dataType: string; udtName: string }>> = {};
      const sourceRows: Record<string, Record<string, unknown>[]> = {};
      const tablesToCopy: string[] = [];

      for (const table of COPY_TABLES) {
        const onSource = await tableExists(sourceClient, table);
        const onDest = await tableExists(destClient, table);
        if (!onSource || !onDest) {
          report.insertCounts[table] = { source: 0, inserted: 0 };
          continue;
        }
        const srcCols = await tableColumns(sourceClient, table);
        const dstCols = await tableColumns(destClient, table);
        const intersection = srcCols.filter((c) => dstCols.includes(c));
        if (intersection.length === 0) {
          throw new Error(`No shared columns for table ${table}`);
        }
        copyCols[table] = intersection;
        copyTypes[table] = await tableColumnTypes(destClient, table);
        if (table === 'tournaments') {
          sourceRows[table] = await fetchTournamentsOrdered(sourceClient, intersection);
        } else {
          sourceRows[table] = await fetchAllRows(sourceClient, table, intersection);
        }
        tablesToCopy.push(table);
      }

      await destClient.$transaction(
        async (tx) => {
          if (wipeExisting.length === 0) {
            throw new Error('No wipe tables found on dest; refusing to continue.');
          }
          const wipeList = wipeExisting.map((t) => quoteIdent(t)).join(', ');
          await tx.$executeRawUnsafe(
            `TRUNCATE TABLE ${wipeList} RESTART IDENTITY CASCADE`,
          );

          const client = tx as unknown as PrismaClient;
          for (const table of tablesToCopy) {
            const cols = copyCols[table];
            const rows = sourceRows[table];
            // Insert bracket_matches without nextMatchId first (self-FK); patch below.
            const nullCols = table === 'bracket_matches' ? ['nextMatchId'] : [];
            const inserted = await insertBatch(
              client,
              table,
              cols,
              rows,
              nullCols,
              copyTypes[table],
            );
            report!.insertCounts[table] = { source: rows.length, inserted };
          }

          if (tablesToCopy.includes('bracket_matches')) {
            await updateBracketNextMatchIds(client, sourceRows.bracket_matches ?? []);
          }

          for (const table of tablesToCopy) {
            report!.sequences[table] = await resetSequence(client, table);
          }
        },
        {
          maxWait: 60_000,
          timeout: 600_000,
        },
      );

      report.elapsedMs = Date.now() - started;
      printReport(report);
    } finally {
      await sourceClient.$disconnect();
      await destClient.$disconnect();
    }
  } catch (err) {
    if (err instanceof Error && (err.message.startsWith('Missing') || err.message.startsWith('--') || err.message.startsWith('Unexpected'))) {
      printUsage();
      console.error(`\n${err.message}`);
      process.exit(1);
    }
    if (report) {
      report.elapsedMs = Date.now() - started;
      report.error = err instanceof Error ? err.message : String(err);
      printReport(report);
    } else {
      console.error(err);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
