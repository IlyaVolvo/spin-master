-- Spin Master — apply on the production/staging Postgres database to match latest app expectations:
--   • Members may have NULL email (CSV import / accounts without email).
--   • Gender enum includes NOT_SPECIFIED (renamed from OTHER when present, or added when not).
--
-- Idempotent. Requires PostgreSQL 10+ (RENAME VALUE). ADD VALUE inside DO needs PG 11+ for transactional safety.

-- 1. Nullable email
ALTER TABLE "members" ALTER COLUMN "email" DROP NOT NULL;

-- 2. Ensure enum "Gender" has label NOT_SPECIFIED.
--    If your DB had OTHER, it is renamed. If it had neither (e.g. only MALE/FEMALE), the value is added.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    INNER JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'Gender' AND e.enumlabel = 'NOT_SPECIFIED'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_enum e
      INNER JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'Gender' AND e.enumlabel = 'OTHER'
    ) THEN
      ALTER TYPE "Gender" RENAME VALUE 'OTHER' TO 'NOT_SPECIFIED';
    ELSE
      -- No OTHER to rename — append new label (PG 9.1+; run outside a multi-statement transaction on PG 9.0)
      EXECUTE 'ALTER TYPE "Gender" ADD VALUE ''NOT_SPECIFIED''';
    END IF;
  END IF;
END $$;

-- 3. Default gender for new member rows
ALTER TABLE "members" ALTER COLUMN "gender" SET DEFAULT 'NOT_SPECIFIED'::"Gender";
