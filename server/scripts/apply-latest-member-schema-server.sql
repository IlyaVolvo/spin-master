-- Spin Master — apply on the production/staging Postgres database to match latest app expectations:
--   • Members may have NULL email (CSV import / accounts without email).
--   • Gender enum uses NOT_SPECIFIED instead of legacy OTHER; default gender is NOT_SPECIFIED.
--
-- Safe to run more than once (idempotent enum rename block). Requires PostgreSQL 10+ (RENAME VALUE).

-- 1. Nullable email
ALTER TABLE "members" ALTER COLUMN "email" DROP NOT NULL;

-- 2. Rename legacy enum label OTHER -> NOT_SPECIFIED when needed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    INNER JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'Gender' AND e.enumlabel = 'OTHER'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    INNER JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'Gender' AND e.enumlabel = 'NOT_SPECIFIED'
  ) THEN
    ALTER TYPE "Gender" RENAME VALUE 'OTHER' TO 'NOT_SPECIFIED';
  END IF;
END $$;

-- 3. Default gender for new member rows
ALTER TABLE "members" ALTER COLUMN "gender" SET DEFAULT 'NOT_SPECIFIED'::"Gender";
