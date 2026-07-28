-- AlterTable
ALTER TABLE "preliminary_configs" ADD COLUMN IF NOT EXISTS "qualifiersPerGroup" INTEGER NOT NULL DEFAULT 1;
