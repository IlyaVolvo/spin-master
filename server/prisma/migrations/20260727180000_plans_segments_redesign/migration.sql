-- Plans + segments redesign

-- Member.paymentCategory → segment
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'paymentCategory'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'segment'
  ) THEN
    ALTER TABLE "members" RENAME COLUMN "paymentCategory" TO "segment";
  END IF;
END $$;

UPDATE "members" SET "segment" = 'Regular'
WHERE "segment" IS NULL OR "segment" = '' OR "segment" = 'Normal';

ALTER TABLE "members" ALTER COLUMN "segment" SET DEFAULT 'Regular';

-- Entitlement planCategory → planSegment
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_entitlements' AND column_name = 'planCategory'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_entitlements' AND column_name = 'planSegment'
  ) THEN
    ALTER TABLE "club_entitlements" RENAME COLUMN "planCategory" TO "planSegment";
  END IF;
END $$;

UPDATE "club_entitlements" SET "planSegment" = 'Regular'
WHERE "planSegment" = 'Normal';

-- Rebuild club_plans with typed columns
CREATE TABLE IF NOT EXISTS "club_plans_new" (
  "id" SERIAL PRIMARY KEY,
  "familyKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "segment" TEXT NOT NULL DEFAULT 'Regular',
  "priceCents" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "durationUnit" TEXT,
  "durationValue" INTEGER,
  "visitCount" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Expand old config.prices into one row per segment (if old columns still exist)
DO $$
DECLARE
  r RECORD;
  price_key TEXT;
  price_val JSONB;
  seg TEXT;
  fam TEXT;
  kind_val TEXT;
  dur_unit TEXT;
  dur_val INTEGER;
  visits INTEGER;
  cents INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_plans' AND column_name = 'config'
  ) THEN
    FOR r IN SELECT * FROM "club_plans" LOOP
      fam := 'plan_' || r.id::text;
      IF r.type::text = 'VISIT_COUNT' THEN
        kind_val := 'VISIT';
        visits := COALESCE((r.config->>'visitCount')::int, 10);
        dur_unit := NULL;
        dur_val := NULL;
      ELSE
        kind_val := 'TIME';
        visits := NULL;
        dur_unit := COALESCE(upper(r.config->>'periodUnit'), 'MONTH');
        IF dur_unit NOT IN ('DAY','WEEK','MONTH','QUARTER','YEAR') THEN
          dur_unit := 'MONTH';
        END IF;
        dur_val := COALESCE((r.config->>'periodValue')::int, 1);
      END IF;

      IF r.config ? 'prices' AND jsonb_typeof(r.config->'prices') = 'object' THEN
        FOR price_key, price_val IN SELECT * FROM jsonb_each(r.config->'prices') LOOP
          seg := price_key;
          IF seg = 'Normal' OR seg IS NULL OR seg = '' THEN
            seg := 'Regular';
          END IF;
          cents := COALESCE((price_val->>'priceCents')::int, 0);
          INSERT INTO "club_plans_new" (
            "familyKey","name","kind","segment","priceCents","currency",
            "durationUnit","durationValue","visitCount","isActive","sortOrder","createdAt","updatedAt"
          ) VALUES (
            fam, r.name, kind_val, seg, cents, 'USD',
            dur_unit, dur_val, visits, r."isActive", r."sortOrder", r."createdAt", r."updatedAt"
          )
          ON CONFLICT DO NOTHING;
        END LOOP;
      ELSE
        INSERT INTO "club_plans_new" (
          "familyKey","name","kind","segment","priceCents","currency",
          "durationUnit","durationValue","visitCount","isActive","sortOrder","createdAt","updatedAt"
        ) VALUES (
          fam, r.name, kind_val, 'Regular', 0, 'USD',
          dur_unit, dur_val, visits, r."isActive", r."sortOrder", r."createdAt", r."updatedAt"
        );
      END IF;
    END LOOP;

    -- Drop FK from entitlements temporarily
    ALTER TABLE "club_entitlements" DROP CONSTRAINT IF EXISTS "club_entitlements_planId_fkey";

    DROP TABLE "club_plans";
    ALTER TABLE "club_plans_new" RENAME TO "club_plans";

    -- Recreate enums
    DROP TYPE IF EXISTS "ClubPlanType";
    DROP TYPE IF EXISTS "ClubPlanKind";
    DROP TYPE IF EXISTS "ClubPlanDurationUnit";
    CREATE TYPE "ClubPlanKind" AS ENUM ('TIME', 'VISIT');
    CREATE TYPE "ClubPlanDurationUnit" AS ENUM ('DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR');

    ALTER TABLE "club_plans"
      ALTER COLUMN "kind" TYPE "ClubPlanKind" USING "kind"::"ClubPlanKind";
    ALTER TABLE "club_plans"
      ALTER COLUMN "durationUnit" TYPE "ClubPlanDurationUnit" USING (
        CASE WHEN "durationUnit" IS NULL THEN NULL ELSE "durationUnit"::"ClubPlanDurationUnit" END
      );

    CREATE UNIQUE INDEX IF NOT EXISTS "club_plans_familyKey_segment_key" ON "club_plans"("familyKey", "segment");
    CREATE INDEX IF NOT EXISTS "club_plans_kind_isActive_idx" ON "club_plans"("kind", "isActive");
    CREATE INDEX IF NOT EXISTS "club_plans_familyKey_isActive_idx" ON "club_plans"("familyKey", "isActive");

    ALTER TABLE "club_entitlements"
      ADD CONSTRAINT "club_entitlements_planId_fkey"
      FOREIGN KEY ("planId") REFERENCES "club_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    -- Clear stale planIds (old ids no longer match)
    UPDATE "club_entitlements" SET "planId" = NULL;
  END IF;
END $$;
