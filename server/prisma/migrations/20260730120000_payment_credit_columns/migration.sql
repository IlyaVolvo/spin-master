-- Persist list price and credit applied on the payment ledger (not only in metadata JSON).
ALTER TABLE "club_payments" ADD COLUMN IF NOT EXISTS "listAmountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "club_payments" ADD COLUMN IF NOT EXISTS "creditAppliedCents" INTEGER NOT NULL DEFAULT 0;

-- Backfill from metadata when present; otherwise treat amountCents as full list with no credit.
UPDATE "club_payments"
SET
  "listAmountCents" = CASE
    WHEN metadata ? 'listAmountCents'
      AND jsonb_typeof(metadata->'listAmountCents') = 'number'
      THEN GREATEST(0, FLOOR((metadata->>'listAmountCents')::numeric)::int)
    WHEN metadata ? 'creditAppliedCents'
      AND jsonb_typeof(metadata->'creditAppliedCents') = 'number'
      THEN GREATEST(0, "amountCents" + FLOOR((metadata->>'creditAppliedCents')::numeric)::int)
    ELSE "amountCents"
  END,
  "creditAppliedCents" = CASE
    WHEN metadata ? 'creditAppliedCents'
      AND jsonb_typeof(metadata->'creditAppliedCents') = 'number'
      THEN GREATEST(0, FLOOR((metadata->>'creditAppliedCents')::numeric)::int)
    ELSE 0
  END
WHERE "listAmountCents" = 0 AND "creditAppliedCents" = 0;
