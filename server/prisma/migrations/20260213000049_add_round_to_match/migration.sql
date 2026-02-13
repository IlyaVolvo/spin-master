/*
  Warnings:

  - The values [MULTI,SINGLE_MATCH] on the enum `TournamentType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `bracketMatchId` on the `matches` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[matchId]` on the table `bracket_matches` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "TournamentType_new" AS ENUM ('ROUND_ROBIN', 'PLAYOFF', 'SWISS', 'MULTI_ROUND_ROBINS', 'PRELIMINARY_WITH_FINAL_PLAYOFF', 'PRELIMINARY_WITH_FINAL_ROUND_ROBIN');
ALTER TABLE "tournaments" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "tournaments" ALTER COLUMN "type" TYPE "TournamentType_new" USING ("type"::text::"TournamentType_new");
ALTER TYPE "TournamentType" RENAME TO "TournamentType_old";
ALTER TYPE "TournamentType_new" RENAME TO "TournamentType";
DROP TYPE "TournamentType_old";
ALTER TABLE "tournaments" ALTER COLUMN "type" SET DEFAULT 'ROUND_ROBIN';
COMMIT;

-- DropForeignKey
ALTER TABLE "matches" DROP CONSTRAINT "matches_bracketMatchId_fkey";

-- DropIndex
DROP INDEX "matches_bracketMatchId_idx";

-- DropIndex
DROP INDEX "matches_bracketMatchId_key";

-- AlterTable
ALTER TABLE "bracket_matches" ADD COLUMN     "matchId" INTEGER;

-- AlterTable
ALTER TABLE "matches" DROP COLUMN "bracketMatchId",
ADD COLUMN     "round" INTEGER,
ALTER COLUMN "tournamentId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "groupNumber" INTEGER,
ADD COLUMN     "parentTournamentId" INTEGER;

-- CreateTable
CREATE TABLE "preliminary_round_robin_configs" (
    "id" SERIAL NOT NULL,
    "tournamentId" INTEGER NOT NULL,
    "finalRoundRobinSize" INTEGER NOT NULL,
    "autoQualifiedCount" INTEGER NOT NULL DEFAULT 0,
    "autoQualifiedMemberIds" INTEGER[],

    CONSTRAINT "preliminary_round_robin_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "swiss_tournament_data" (
    "id" SERIAL NOT NULL,
    "tournamentId" INTEGER NOT NULL,
    "numberOfRounds" INTEGER NOT NULL,
    "pairByRating" BOOLEAN NOT NULL DEFAULT true,
    "currentRound" INTEGER NOT NULL DEFAULT 0,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "swiss_tournament_data_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "preliminary_round_robin_configs_tournamentId_key" ON "preliminary_round_robin_configs"("tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "swiss_tournament_data_tournamentId_key" ON "swiss_tournament_data"("tournamentId");

-- CreateIndex
CREATE INDEX "bracket_matches_matchId_idx" ON "bracket_matches"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "bracket_matches_matchId_key" ON "bracket_matches"("matchId");

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_parentTournamentId_fkey" FOREIGN KEY ("parentTournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bracket_matches" ADD CONSTRAINT "bracket_matches_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preliminary_round_robin_configs" ADD CONSTRAINT "preliminary_round_robin_configs_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swiss_tournament_data" ADD CONSTRAINT "swiss_tournament_data_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
