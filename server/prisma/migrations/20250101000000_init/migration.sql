-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('PLAYER', 'COACH', 'ADMIN', 'ORGANIZER');

-- CreateEnum
CREATE TYPE "RatingChangeReason" AS ENUM ('TOURNAMENT_COMPLETED', 'MATCH_COMPLETED', 'PLAYOFF_MATCH_COMPLETED', 'RESULT_CORRECTED', 'MANUAL_ADJUSTMENT', 'MEMBER_DEACTIVATED');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TournamentType" AS ENUM ('ROUND_ROBIN', 'PLAYOFF', 'MULTI', 'SINGLE_MATCH');

-- CreateTable
CREATE TABLE "members" (
    "id" SERIAL NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "rating" INTEGER,
    "email" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "password" TEXT NOT NULL,
    "roles" "MemberRole"[],
    "picture" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "mustResetPassword" BOOLEAN NOT NULL DEFAULT false,
    "passwordResetToken" TEXT,
    "passwordResetTokenExpiry" TIMESTAMP(3),

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rating_history" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "rating" INTEGER,
    "ratingChange" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" "RatingChangeReason" NOT NULL,
    "tournamentId" INTEGER,
    "matchId" INTEGER,

    CONSTRAINT "rating_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournaments" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "type" "TournamentType" NOT NULL DEFAULT 'ROUND_ROBIN',
    "status" "TournamentStatus" NOT NULL DEFAULT 'ACTIVE',
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_participants" (
    "id" SERIAL NOT NULL,
    "tournamentId" INTEGER NOT NULL,
    "memberId" INTEGER NOT NULL,
    "playerRatingAtTime" INTEGER,

    CONSTRAINT "tournament_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bracket_matches" (
    "id" SERIAL NOT NULL,
    "tournamentId" INTEGER NOT NULL,
    "round" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "member1Id" INTEGER,
    "member2Id" INTEGER,
    "nextMatchId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bracket_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" SERIAL NOT NULL,
    "tournamentId" INTEGER NOT NULL,
    "bracketMatchId" INTEGER,
    "member1Id" INTEGER NOT NULL,
    "member2Id" INTEGER,
    "player1Sets" INTEGER NOT NULL DEFAULT 0,
    "player2Sets" INTEGER NOT NULL DEFAULT 0,
    "player1Forfeit" BOOLEAN NOT NULL DEFAULT false,
    "player2Forfeit" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_exchange_rules" (
    "id" SERIAL NOT NULL,
    "minDiff" INTEGER NOT NULL,
    "maxDiff" INTEGER NOT NULL,
    "expectedPoints" INTEGER NOT NULL,
    "upsetPoints" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "point_exchange_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "members_email_key" ON "members"("email");

-- CreateIndex
CREATE INDEX "members_email_idx" ON "members"("email");

-- CreateIndex
CREATE INDEX "rating_history_memberId_idx" ON "rating_history"("memberId");

-- CreateIndex
CREATE INDEX "rating_history_timestamp_idx" ON "rating_history"("timestamp");

-- CreateIndex
CREATE INDEX "rating_history_tournamentId_idx" ON "rating_history"("tournamentId");

-- CreateIndex
CREATE INDEX "rating_history_matchId_idx" ON "rating_history"("matchId");

-- CreateIndex
CREATE INDEX "tournament_participants_tournamentId_idx" ON "tournament_participants"("tournamentId");

-- CreateIndex
CREATE INDEX "tournament_participants_memberId_idx" ON "tournament_participants"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_participants_tournamentId_memberId_key" ON "tournament_participants"("tournamentId", "memberId");

-- CreateIndex
CREATE INDEX "bracket_matches_tournamentId_idx" ON "bracket_matches"("tournamentId");

-- CreateIndex
CREATE INDEX "bracket_matches_tournamentId_round_position_idx" ON "bracket_matches"("tournamentId", "round", "position");

-- CreateIndex
CREATE INDEX "bracket_matches_nextMatchId_idx" ON "bracket_matches"("nextMatchId");

-- CreateIndex
CREATE UNIQUE INDEX "bracket_matches_tournamentId_round_position_key" ON "bracket_matches"("tournamentId", "round", "position");

-- CreateIndex
CREATE INDEX "matches_tournamentId_idx" ON "matches"("tournamentId");

-- CreateIndex
CREATE INDEX "matches_bracketMatchId_idx" ON "matches"("bracketMatchId");

-- CreateIndex
CREATE INDEX "matches_member1Id_idx" ON "matches"("member1Id");

-- CreateIndex
CREATE INDEX "matches_member2Id_idx" ON "matches"("member2Id");

-- CreateIndex
CREATE INDEX "matches_member1Id_member2Id_idx" ON "matches"("member1Id", "member2Id");

-- CreateIndex
CREATE UNIQUE INDEX "matches_bracketMatchId_key" ON "matches"("bracketMatchId");

-- CreateIndex
CREATE INDEX "point_exchange_rules_effectiveFrom_idx" ON "point_exchange_rules"("effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "point_exchange_rules_minDiff_maxDiff_effectiveFrom_key" ON "point_exchange_rules"("minDiff", "maxDiff", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "rating_history" ADD CONSTRAINT "rating_history_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_participants" ADD CONSTRAINT "tournament_participants_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_participants" ADD CONSTRAINT "tournament_participants_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bracket_matches" ADD CONSTRAINT "bracket_matches_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bracket_matches" ADD CONSTRAINT "bracket_matches_nextMatchId_fkey" FOREIGN KEY ("nextMatchId") REFERENCES "bracket_matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_bracketMatchId_fkey" FOREIGN KEY ("bracketMatchId") REFERENCES "bracket_matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;


