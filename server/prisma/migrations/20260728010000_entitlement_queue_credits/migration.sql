-- Entitlement queue + member credits / auto-renew

CREATE TYPE "ClubEntitlementStatus" AS ENUM ('CURRENT', 'FUTURE', 'ENDED');

ALTER TABLE "club_entitlements"
  ADD COLUMN IF NOT EXISTS "status" "ClubEntitlementStatus" NOT NULL DEFAULT 'CURRENT',
  ADD COLUMN IF NOT EXISTS "visitsTotal" INTEGER,
  ADD COLUMN IF NOT EXISTS "amountPaidCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "familyKey" TEXT;

UPDATE "club_entitlements"
SET "status" = CASE WHEN "active" THEN 'CURRENT'::"ClubEntitlementStatus" ELSE 'ENDED'::"ClubEntitlementStatus" END
WHERE "status" IS NULL OR "status" = 'CURRENT';

CREATE INDEX IF NOT EXISTS "club_entitlements_memberId_status_idx" ON "club_entitlements"("memberId", "status");

ALTER TABLE "members"
  ADD COLUMN IF NOT EXISTS "purchaseCreditCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "autoRenewEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "autoRenewFamilyKey" TEXT;
