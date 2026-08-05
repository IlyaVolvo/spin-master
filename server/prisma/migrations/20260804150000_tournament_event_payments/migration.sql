-- AlterEnum
ALTER TYPE "TournamentRegistrationStatus" ADD VALUE 'PENDING';

-- AlterTable tournaments
ALTER TABLE "tournaments" ADD COLUMN "minParticipants" INTEGER;
ALTER TABLE "tournaments" ADD COLUMN "isEvent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tournaments" ADD COLUMN "eventPriceCents" INTEGER;
ALTER TABLE "tournaments" ADD COLUMN "eventCheckInLeadMinutes" INTEGER;
ALTER TABLE "tournaments" ADD COLUMN "eventCheckInCloseMinutesBeforeStart" INTEGER;

-- AlterTable tournament_registrations
ALTER TABLE "tournament_registrations" ADD COLUMN "eventPaymentId" INTEGER;

-- AlterTable club_visits
ALTER TABLE "club_visits" ADD COLUMN "eventTournamentId" INTEGER;

-- AddForeignKey
ALTER TABLE "tournament_registrations" ADD CONSTRAINT "tournament_registrations_eventPaymentId_fkey" FOREIGN KEY ("eventPaymentId") REFERENCES "club_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "club_visits" ADD CONSTRAINT "club_visits_eventTournamentId_fkey" FOREIGN KEY ("eventTournamentId") REFERENCES "tournaments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "tournament_registrations_eventPaymentId_idx" ON "tournament_registrations"("eventPaymentId");
CREATE INDEX "club_visits_eventTournamentId_idx" ON "club_visits"("eventTournamentId");
