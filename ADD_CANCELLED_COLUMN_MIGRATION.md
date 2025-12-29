# Add Cancelled Column Migration

## The Problem

The `cancelled` column exists in the Prisma schema but not in the Supabase database.

## Solution: Apply Migration

I've created a migration file. Now you need to apply it to Supabase.

### Step 1: Apply Migration to Supabase

Run this command:

```bash
cd server
export DATABASE_URL="postgresql://postgres:RVC2yct3yzq1egx_wvg@db.evfvxgoxzasjujgzoyfo.supabase.co:5432/postgres?sslmode=require"
npx prisma migrate deploy
```

This will apply the new migration that adds the `cancelled` column.

### Step 2: Verify

After running the migration, verify the column exists:

```bash
psql "postgresql://postgres:RVC2yct3yzq1egx_wvg@db.evfvxgoxzasjujgzoyfo.supabase.co:5432/postgres?sslmode=require" -c "\d tournaments"
```

You should see `cancelled` in the column list.

### Step 3: Restart Fly.io

After the migration is applied:

```bash
flyctl apps restart spin-master
```

### Alternative: Quick SQL Fix

If you just want to add the column quickly without running migrations:

```bash
psql "postgresql://postgres:RVC2yct3yzq1egx_wvg@db.evfvxgoxzasjujgzoyfo.supabase.co:5432/postgres?sslmode=require" -c 'ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "cancelled" BOOLEAN NOT NULL DEFAULT false;'
```

Then restart Fly.io:
```bash
flyctl apps restart spin-master
```

## Why This Happened

The `cancelled` field was added to the Prisma schema, but:
- No migration was created for it, OR
- The migration wasn't applied to Supabase

The migration file has been created at:
`server/prisma/migrations/20251229000000_add_cancelled_to_tournaments/migration.sql`


