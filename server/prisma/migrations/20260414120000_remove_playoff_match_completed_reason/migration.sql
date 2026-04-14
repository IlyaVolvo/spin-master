-- Map legacy playoff per-match reason to MATCH_COMPLETED, then drop enum value.
UPDATE "rating_history"
SET "reason" = 'MATCH_COMPLETED'
WHERE "reason" = 'PLAYOFF_MATCH_COMPLETED';

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
