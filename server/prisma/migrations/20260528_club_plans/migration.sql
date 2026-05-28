-- CreateEnum
CREATE TYPE "ClubPlanType" AS ENUM ('PERIOD', 'VISIT_COUNT');

-- CreateTable: club_plans
CREATE TABLE "club_plans" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ClubPlanType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "club_plans_type_isActive_idx" ON "club_plans"("type", "isActive");

-- AlterTable: Add planId and planCategory to club_entitlements
ALTER TABLE "club_entitlements" ADD COLUMN "planId" INTEGER;
ALTER TABLE "club_entitlements" ADD COLUMN "planCategory" TEXT;

-- CreateIndex
CREATE INDEX "club_entitlements_planId_idx" ON "club_entitlements"("planId");

-- AddForeignKey
ALTER TABLE "club_entitlements" ADD CONSTRAINT "club_entitlements_planId_fkey" FOREIGN KEY ("planId") REFERENCES "club_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Add clubPlans JSON column to system_config
ALTER TABLE "system_config" ADD COLUMN "clubPlans" JSONB NOT NULL DEFAULT '{}';
