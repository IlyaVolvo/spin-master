-- Pluggable payments: provider string, courtesy fields, payments config

ALTER TABLE "system_config" ADD COLUMN IF NOT EXISTS "payments" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "courtesySuspended" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "club_visits" ADD COLUMN IF NOT EXISTS "isCourtesy" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "club_visits" ADD COLUMN IF NOT EXISTS "courtesyClearedAt" TIMESTAMP(3);
ALTER TABLE "club_visits" ADD COLUMN IF NOT EXISTS "obligationPaymentId" INTEGER;

-- provider: add as TEXT on clean migrate history; convert enum→text on legacy DBs that had ClubPaymentProvider
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'club_payments'
      AND column_name = 'provider'
  ) THEN
    ALTER TABLE "club_payments" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'manual';
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'club_payments'
      AND column_name = 'provider'
      AND udt_name = 'ClubPaymentProvider'
  ) THEN
    ALTER TABLE "club_payments" ALTER COLUMN "provider" DROP DEFAULT;
    ALTER TABLE "club_payments" ALTER COLUMN "provider" TYPE TEXT USING (
      CASE "provider"::text
        WHEN 'MANUAL' THEN 'manual'
        WHEN 'EXTERNAL_CHECKOUT' THEN 'external_checkout'
        WHEN 'STRIPE' THEN 'stripe'
        ELSE lower("provider"::text)
      END
    );
    ALTER TABLE "club_payments" ALTER COLUMN "provider" SET DEFAULT 'manual';
  END IF;
END $$;

DROP TYPE IF EXISTS "ClubPaymentProvider";

CREATE INDEX IF NOT EXISTS "club_visits_isCourtesy_courtesyClearedAt_idx" ON "club_visits"("isCourtesy", "courtesyClearedAt");
CREATE INDEX IF NOT EXISTS "club_visits_obligationPaymentId_idx" ON "club_visits"("obligationPaymentId");
CREATE INDEX IF NOT EXISTS "club_payments_status_provider_idx" ON "club_payments"("status", "provider");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'club_visits_obligationPaymentId_fkey'
  ) THEN
    ALTER TABLE "club_visits"
      ADD CONSTRAINT "club_visits_obligationPaymentId_fkey"
      FOREIGN KEY ("obligationPaymentId") REFERENCES "club_payments"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
