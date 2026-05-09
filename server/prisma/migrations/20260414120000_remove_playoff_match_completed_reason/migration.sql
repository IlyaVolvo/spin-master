-- Map legacy playoff per-match reason to MATCH_COMPLETED, then drop enum value.
-- Compare via ::text so this runs whether or not PLAYOFF_MATCH_COMPLETED still exists on the enum
-- (e.g. manually provisioned DBs that never had that label).
UPDATE "rating_history"
SET "reason" = 'MATCH_COMPLETED'
WHERE "reason"::text = 'PLAYOFF_MATCH_COMPLETED';

CREATE TYPE "RatingChangeReason_new" AS ENUM (
  'TOURNAMENT_COMPLETED',
  'MATCH_COMPLETED',
  'RESULT_CORRECTED',
  'MANUAL_ADJUSTMENT',
  'MEMBER_DEACTIVATED'
);

ALTER TABLE "rating_history"
  ALTER COLUMN "reason" TYPE "RatingChangeReason_new"
  USING ("reason"::text::"RatingChangeReason_new");

DROP TYPE "RatingChangeReason";
ALTER TYPE "RatingChangeReason_new" RENAME TO "RatingChangeReason";
