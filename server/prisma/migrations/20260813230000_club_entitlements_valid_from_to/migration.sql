-- Align club_entitlements with current Prisma schema (db-push names never made it into migrate history).
-- Legacy create used startsAt/expiresAt; current models use validFrom/validTo plus label/active.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'club_entitlements' AND column_name = 'startsAt'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'club_entitlements' AND column_name = 'validFrom'
  ) THEN
    ALTER TABLE "club_entitlements" RENAME COLUMN "startsAt" TO "validFrom";
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'club_entitlements' AND column_name = 'expiresAt'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'club_entitlements' AND column_name = 'validTo'
  ) THEN
    ALTER TABLE "club_entitlements" RENAME COLUMN "expiresAt" TO "validTo";
  END IF;
END $$;

ALTER TABLE "club_entitlements" ADD COLUMN IF NOT EXISTS "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "club_entitlements" ADD COLUMN IF NOT EXISTS "validTo" TIMESTAMP(3);
ALTER TABLE "club_entitlements" ADD COLUMN IF NOT EXISTS "label" TEXT;
ALTER TABLE "club_entitlements" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
