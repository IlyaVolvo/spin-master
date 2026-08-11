-- Persist list price and credit applied on the payment ledger (not only in metadata JSON).
-- Also aligns club_payments to the current Prisma shape on clean migrate history
-- (original table used "amount" / COMPLETED|REFUNDED and had no metadata/purpose).

-- amount → amountCents
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'club_payments' AND column_name = 'amount'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'club_payments' AND column_name = 'amountCents'
  ) THEN
    ALTER TABLE "club_payments" RENAME COLUMN "amount" TO "amountCents";
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'club_payments' AND column_name = 'amountCents'
  ) THEN
    ALTER TABLE "club_payments" ADD COLUMN "amountCents" INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

ALTER TABLE "club_payments" ADD COLUMN IF NOT EXISTS "listAmountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "club_payments" ADD COLUMN IF NOT EXISTS "creditAppliedCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "club_payments" ADD COLUMN IF NOT EXISTS "purpose" TEXT NOT NULL DEFAULT '';
ALTER TABLE "club_payments" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "club_payments" ADD COLUMN IF NOT EXISTS "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill purpose / recordedAt from legacy columns when present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'club_payments' AND column_name = 'description'
  ) THEN
    UPDATE "club_payments"
    SET "purpose" = COALESCE(NULLIF("description", ''), "purpose")
    WHERE "purpose" = '' OR "purpose" IS NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'club_payments' AND column_name = 'createdAt'
  ) THEN
    UPDATE "club_payments" SET "recordedAt" = "createdAt";
  END IF;
END $$;

-- ClubPaymentStatus: PENDING/COMPLETED/FAILED/REFUNDED → PENDING/SUCCEEDED/FAILED/CANCELLED
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'ClubPaymentStatus' AND e.enumlabel = 'COMPLETED'
  ) THEN
    CREATE TYPE "ClubPaymentStatus_new" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

    ALTER TABLE "club_payments" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "club_payments"
      ALTER COLUMN "status" TYPE "ClubPaymentStatus_new"
      USING (
        CASE "status"::text
          WHEN 'COMPLETED' THEN 'SUCCEEDED'
          WHEN 'REFUNDED' THEN 'CANCELLED'
          WHEN 'SUCCEEDED' THEN 'SUCCEEDED'
          WHEN 'CANCELLED' THEN 'CANCELLED'
          WHEN 'PENDING' THEN 'PENDING'
          WHEN 'FAILED' THEN 'FAILED'
          WHEN 'WRITTEN_OFF' THEN 'CANCELLED'
          ELSE 'PENDING'
        END::"ClubPaymentStatus_new"
      );

    DROP TYPE "ClubPaymentStatus";
    ALTER TYPE "ClubPaymentStatus_new" RENAME TO "ClubPaymentStatus";
    ALTER TABLE "club_payments"
      ALTER COLUMN "status" SET DEFAULT 'PENDING'::"ClubPaymentStatus";
  END IF;
END $$;

-- Backfill credit columns from metadata when that JSON column has data; otherwise list = amount, credit = 0
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'club_payments' AND column_name = 'metadata'
  ) THEN
    UPDATE "club_payments"
    SET
      "listAmountCents" = CASE
        WHEN metadata IS NOT NULL
          AND metadata ? 'listAmountCents'
          AND jsonb_typeof(metadata->'listAmountCents') = 'number'
          THEN GREATEST(0, FLOOR((metadata->>'listAmountCents')::numeric)::int)
        WHEN metadata IS NOT NULL
          AND metadata ? 'creditAppliedCents'
          AND jsonb_typeof(metadata->'creditAppliedCents') = 'number'
          THEN GREATEST(0, "amountCents" + FLOOR((metadata->>'creditAppliedCents')::numeric)::int)
        ELSE "amountCents"
      END,
      "creditAppliedCents" = CASE
        WHEN metadata IS NOT NULL
          AND metadata ? 'creditAppliedCents'
          AND jsonb_typeof(metadata->'creditAppliedCents') = 'number'
          THEN GREATEST(0, FLOOR((metadata->>'creditAppliedCents')::numeric)::int)
        ELSE 0
      END
    WHERE "listAmountCents" = 0 AND "creditAppliedCents" = 0;
  ELSE
    UPDATE "club_payments"
    SET
      "listAmountCents" = "amountCents",
      "creditAppliedCents" = 0
    WHERE "listAmountCents" = 0 AND "creditAppliedCents" = 0;
  END IF;
END $$;
