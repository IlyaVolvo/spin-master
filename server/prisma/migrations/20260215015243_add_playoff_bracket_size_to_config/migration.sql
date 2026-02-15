-- AlterTable
ALTER TABLE "preliminary_round_robin_configs" ADD COLUMN     "playoffBracketSize" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "finalRoundRobinSize" SET DEFAULT 0;
