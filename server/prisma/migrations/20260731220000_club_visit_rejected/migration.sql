-- AlterTable
ALTER TABLE "club_visits" ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "club_visits_rejectedAt_idx" ON "club_visits"("rejectedAt");
