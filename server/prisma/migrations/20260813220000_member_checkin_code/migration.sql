-- One-time email check-in code (was in schema via db push, never in migrate history)
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "checkinCode" TEXT;
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "checkinCodeExpiry" TIMESTAMP(3);
