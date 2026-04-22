-- DB upgrade (ensure): Gender enum OTHER -> NOT_SPECIFIED if still needed.
-- Idempotent. API and CSV reject OTHER; only NOT_SPECIFIED / MALE / FEMALE allowed in input.

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

ALTER TABLE "members" ALTER COLUMN "gender" SET DEFAULT 'NOT_SPECIFIED'::"Gender";
