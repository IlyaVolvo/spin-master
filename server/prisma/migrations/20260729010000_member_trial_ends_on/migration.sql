-- Per-member trial period (date-limited), replacing Trial-as-a-plan

ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "trialEndsOn" TIMESTAMP(3);
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "trialExpiryNotifiedAt" TIMESTAMP(3);
