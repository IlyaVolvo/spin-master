-- AlterTable
ALTER TABLE "club_visits" ADD COLUMN "rejectedAt" TIMESTAMP(3),
ADD COLUMN "rejectionReason" TEXT;

-- CreateIndex
CREATE INDEX "club_visits_rejectedAt_idx" ON "club_visits"("rejectedAt");
