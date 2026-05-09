# Align production (Supabase) with this branch’s schema

Use this when production was **edited manually** or **migration history diverged**, and you want:

1. **Database DDL** to match `prisma/schema.prisma` on the current branch  
2. **`_prisma_migrations`** to list every folder under `prisma/migrations/` as **applied**, so future `npx prisma migrate deploy` runs normally  

This is **not** a data migration tool. Review generated SQL for destructive operations (`DROP`, `ALTER … DROP COLUMN`, etc.). **Back up production** (Supabase backup / `pg_dump`) before applying SQL.

## Prerequisites

- Branch checkout includes all committed migrations under `server/prisma/migrations/`.
- Installed dependencies in `server/` (`npm install`).
- Production connection string available **only in your shell** (do not commit).

Prefer the **direct** Postgres host (`db.<project>.supabase.co`) with `sslmode=require` for DDL. Session pooler URLs can be problematic for some migrations.

## Step 1 — Generate drift SQL (production → target schema)

From `server/`:

```bash
export PRODUCTION_DATABASE_URL='postgresql://postgres:PASSWORD@db.xxxxx.supabase.co:5432/postgres?sslmode=require'

npm run prisma:diff-prod-schema -- --output prisma/prod-drift.sql
# or: npx tsx scripts/syncProductionSchema.ts diff --output prisma/prod-drift.sql
```

If Prisma asks for a shadow database, create a disposable empty Postgres DB and:

```bash
export SHADOW_DATABASE_URL='postgresql://...empty-db...'
npm run prisma:diff-prod-schema -- --output prisma/prod-drift.sql
```

Open `prod-drift.sql`, review every statement, then apply it on Supabase (**SQL Editor** or `psql`).

Re-run the diff until output is empty (or the script prints that there is nothing to do):

```bash
npm run prisma:diff-prod-schema
```

## Step 2 — Clear failed migration rows (if deploy previously failed)

If `migrate deploy` failed once, Prisma may have left a row in `_prisma_migrations` that blocks new deploys.

Inspect:

```sql
SELECT migration_name, finished_at, rolled_back_at, logs
FROM "_prisma_migrations"
ORDER BY started_at DESC
LIMIT 30;
```

Either:

```bash
DATABASE_URL="$PRODUCTION_DATABASE_URL" npx prisma migrate resolve --rolled-back "MIGRATION_FOLDER_NAME"
```

…or, **only if** you have applied all drift SQL and the live schema already matches `schema.prisma`, you may reset migration history and re-record it (next step does this implicitly only when using `mark-applied`; if rows conflict, truncate first):

```sql
TRUNCATE TABLE "_prisma_migrations";
```

Use `TRUNCATE` only when you understand that Prisma will no longer know what ran before—you will re-record everything in Step 3.

## Step 3 — Record all migrations as applied (no SQL execution)

After production schema matches `schema.prisma`:

```bash
export PRODUCTION_DATABASE_URL='postgresql://...'

npm run prisma:mark-all-applied-prod
# or: npx tsx scripts/syncProductionSchema.ts mark-applied
```

The script runs `prisma migrate resolve --applied <folder>` for each migration directory in sorted order. Already-recorded migrations are skipped when Prisma reports them as applied.

## Step 4 — Verify

```bash
DATABASE_URL="$PRODUCTION_DATABASE_URL" npx prisma migrate status
```

You should see all migrations applied and **no pending** migrations.

Sanity check:

```bash
DATABASE_URL="$PRODUCTION_DATABASE_URL" npx prisma migrate deploy
```

Should report nothing to apply (or only new migrations you add later).

## Going forward (avoid drift)

1. Change schema only via **`prisma migrate dev`** on a dev DB, commit the new `prisma/migrations/**` folder.  
2. Apply to production with **`prisma migrate deploy`** only—avoid hand-editing production DDL unless you immediately capture it in a migration.  
3. Optionally run `npm run prisma:diff-prod-schema` in CI before deploy to fail if production drifts from `schema.prisma`.

## Local dev after editing old migration files

If you change SQL inside an **already-applied** migration folder, Prisma may report a **checksum mismatch** on databases that applied the old file. Typical fixes: refresh that dev DB (`migrate reset`) or restore from backup—do not rewrite history on shared databases without a deliberate baseline plan.
