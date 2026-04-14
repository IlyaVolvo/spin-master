-- Deactivation does not change rating; remove legacy rows and enum value.
DELETE FROM "rating_history"
WHERE "reason" = 'MEMBER_DEACTIVATED';

CREATE TYPE "RatingChangeReason_new" AS ENUM (
  'TOURNAMENT_COMPLETED',
  'MATCH_COMPLETED',
  'RESULT_CORRECTED',
  'MANUAL_ADJUSTMENT',
  'INITIAL_RATING'
);

ALTER TABLE "rating_history"
  ALTER COLUMN "reason" TYPE "RatingChangeReason_new"
  USING ("reason"::text::"RatingChangeReason_new");

DROP TYPE "RatingChangeReason";
ALTER TYPE "RatingChangeReason_new" RENAME TO "RatingChangeReason";
