-- Permanent per-member score confirmation PIN (digit string; admin-visible).
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "scorePin" TEXT;

-- Backfill existing members with a random 4-digit PIN (club default length).
UPDATE "members"
SET "scorePin" = lpad((floor(random() * 10000))::int::text, 4, '0')
WHERE "scorePin" IS NULL OR "scorePin" = '';

ALTER TABLE "members" ALTER COLUMN "scorePin" SET NOT NULL;
