ALTER TYPE "TournamentStatus" ADD VALUE IF NOT EXISTS 'PRE_REGISTRATION';

CREATE TYPE "TournamentRegistrationStatus" AS ENUM ('INVITED', 'REGISTERED', 'DECLINED');

ALTER TABLE "members"
ADD COLUMN "tournamentNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "tournaments"
ADD COLUMN "tournamentDate" TIMESTAMP(3),
ADD COLUMN "registrationDeadline" TIMESTAMP(3),
ADD COLUMN "minRating" INTEGER,
ADD COLUMN "maxRating" INTEGER,
ADD COLUMN "maxParticipants" INTEGER;

CREATE TABLE "tournament_registrations" (
  "id" SERIAL NOT NULL,
  "tournamentId" INTEGER NOT NULL,
  "memberId" INTEGER NOT NULL,
  "registrationCodeHash" TEXT NOT NULL,
  "status" "TournamentRegistrationStatus" NOT NULL DEFAULT 'INVITED',
  "invitationSentAt" TIMESTAMP(3),
  "registeredAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "tournament_registrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tournament_registrations_registrationCodeHash_key" ON "tournament_registrations"("registrationCodeHash");
CREATE UNIQUE INDEX "tournament_registrations_tournamentId_memberId_key" ON "tournament_registrations"("tournamentId", "memberId");
CREATE INDEX "tournament_registrations_tournamentId_idx" ON "tournament_registrations"("tournamentId");
CREATE INDEX "tournament_registrations_memberId_idx" ON "tournament_registrations"("memberId");
CREATE INDEX "tournament_registrations_status_idx" ON "tournament_registrations"("status");

ALTER TABLE "tournament_registrations"
ADD CONSTRAINT "tournament_registrations_tournamentId_fkey"
FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tournament_registrations"
ADD CONSTRAINT "tournament_registrations_memberId_fkey"
FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
