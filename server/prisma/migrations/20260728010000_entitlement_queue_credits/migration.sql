-- Entitlement queue + member credits / auto-renew

-- ClubEntitlementStatus: created earlier as ACTIVE/EXPIRED/EXHAUSTED/CANCELLED (club_checkin_payments).
-- This migration moves to CURRENT/FUTURE/ENDED. On clean history the old type already exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'ClubEntitlementStatus' AND e.enumlabel = 'ACTIVE'
  ) THEN
    CREATE TYPE "ClubEntitlementStatus_new" AS ENUM ('CURRENT', 'FUTURE', 'ENDED');

    ALTER TABLE "club_entitlements" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "club_entitlements"
      ALTER COLUMN "status" TYPE "ClubEntitlementStatus_new"
      USING (
        CASE "status"::text
          WHEN 'ACTIVE' THEN 'CURRENT'
          WHEN 'EXPIRED' THEN 'ENDED'
          WHEN 'EXHAUSTED' THEN 'ENDED'
          WHEN 'CANCELLED' THEN 'ENDED'
          WHEN 'CURRENT' THEN 'CURRENT'
          WHEN 'FUTURE' THEN 'FUTURE'
          WHEN 'ENDED' THEN 'ENDED'
          ELSE 'ENDED'
        END::"ClubEntitlementStatus_new"
      );

    DROP TYPE "ClubEntitlementStatus";
    ALTER TYPE "ClubEntitlementStatus_new" RENAME TO "ClubEntitlementStatus";
    ALTER TABLE "club_entitlements"
      ALTER COLUMN "status" SET DEFAULT 'CURRENT'::"ClubEntitlementStatus";
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'ClubEntitlementStatus'
  ) THEN
    CREATE TYPE "ClubEntitlementStatus" AS ENUM ('CURRENT', 'FUTURE', 'ENDED');
  END IF;
END $$;

ALTER TABLE "club_entitlements"
  ADD COLUMN IF NOT EXISTS "status" "ClubEntitlementStatus" NOT NULL DEFAULT 'CURRENT',
  ADD COLUMN IF NOT EXISTS "visitsTotal" INTEGER,
  ADD COLUMN IF NOT EXISTS "amountPaidCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "familyKey" TEXT;

-- Only remap from legacy "active" when that column still exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'club_entitlements'
      AND column_name = 'active'
  ) THEN
    UPDATE "club_entitlements"
    SET "status" = CASE
      WHEN "active" THEN 'CURRENT'::"ClubEntitlementStatus"
      ELSE 'ENDED'::"ClubEntitlementStatus"
    END
    WHERE "status" IS NULL OR "status"::text IN ('CURRENT', 'ACTIVE');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "club_entitlements_memberId_status_idx" ON "club_entitlements"("memberId", "status");

ALTER TABLE "members"
  ADD COLUMN IF NOT EXISTS "purchaseCreditCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "autoRenewEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "autoRenewFamilyKey" TEXT;
