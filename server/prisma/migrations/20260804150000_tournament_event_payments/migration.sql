-- AlterEnum (IF NOT EXISTS supported on Postgres 9.1+ / Neon)
ALTER TYPE "TournamentRegistrationStatus" ADD VALUE IF NOT EXISTS 'PENDING';

-- AlterTable tournaments
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "minParticipants" INTEGER;
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "isEvent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "eventPriceCents" INTEGER;
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "eventCheckInLeadMinutes" INTEGER;
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "eventCheckInCloseMinutesBeforeStart" INTEGER;

-- AlterTable tournament_registrations
ALTER TABLE "tournament_registrations" ADD COLUMN IF NOT EXISTS "eventPaymentId" INTEGER;

-- AlterTable club_visits
ALTER TABLE "club_visits" ADD COLUMN IF NOT EXISTS "eventTournamentId" INTEGER;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tournament_registrations_eventPaymentId_fkey'
  ) THEN
    ALTER TABLE "tournament_registrations"
      ADD CONSTRAINT "tournament_registrations_eventPaymentId_fkey"
      FOREIGN KEY ("eventPaymentId") REFERENCES "club_payments"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'club_visits_eventTournamentId_fkey'
  ) THEN
    ALTER TABLE "club_visits"
      ADD CONSTRAINT "club_visits_eventTournamentId_fkey"
      FOREIGN KEY ("eventTournamentId") REFERENCES "tournaments"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tournament_registrations_eventPaymentId_idx" ON "tournament_registrations"("eventPaymentId");
CREATE INDEX IF NOT EXISTS "club_visits_eventTournamentId_idx" ON "club_visits"("eventTournamentId");
