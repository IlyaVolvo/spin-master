# Fix: Missing `cancelled` Column in Database

## The Problem

The Prisma schema has a `cancelled` field in the `Tournament` model, but the Supabase database doesn't have this column. The database schema is out of sync.

## Solution: Run Migrations on Supabase

You need to apply all pending migrations to your Supabase database.

### Option 1: Run Migrations via Prisma (Recommended)

1. **Set your DATABASE_URL** to point to Supabase:
   ```bash
   export DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.xxxxx.supabase.co:5432/postgres?sslmode=require"
   ```

2. **Run migrations**:
   ```bash
   cd server
   npx prisma migrate deploy
   ```

   This will apply all migrations that haven't been run yet.

### Option 2: Create and Apply Migration for Cancelled Column

If the column was added to the schema but no migration exists:

1. **Create a migration**:
   ```bash
   cd server
   npx prisma migrate dev --name add_cancelled_to_tournaments
   ```

   This will:
   - Create a migration file
   - Apply it to your local database
   - Generate Prisma Client

2. **Apply to Supabase**:
   ```bash
   export DATABASE_URL="your-supabase-connection-string"
   npx prisma migrate deploy
   ```

### Option 3: Manual SQL (Quick Fix)

If you just need to add the column quickly:

1. Connect to Supabase:
   ```bash
   psql "postgresql://postgres:YOUR_PASSWORD@db.xxxxx.supabase.co:5432/postgres?sslmode=require"
   ```

2. Run SQL:
   ```sql
   ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "cancelled" BOOLEAN NOT NULL DEFAULT false;
   ```

3. Exit:
   ```sql
   \q
   ```

## Verify the Fix

After applying migrations:

1. **Check the column exists**:
   ```sql
   \d tournaments
   ```
   Should show `cancelled` column.

2. **Restart Fly.io app**:
   ```bash
   flyctl apps restart spin-master
   ```

3. **Test login** - should work now.

## Why This Happened

The Prisma schema was updated to include `cancelled`, but:
- The migration wasn't created, OR
- The migration wasn't applied to Supabase

## Prevention

Always run migrations after schema changes:
```bash
# Create migration
npx prisma migrate dev --name migration_name

# Apply to production
npx prisma migrate deploy
```


