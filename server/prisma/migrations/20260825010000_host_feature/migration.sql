-- AlterTable
ALTER TABLE "club_plans" ADD COLUMN "hostPerkDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "club_plans" ADD COLUMN "hostPerkVisits" INTEGER NOT NULL DEFAULT 0;

-- CreateEnum
CREATE TYPE "HostPerkGrantStatus" AS ENUM ('PENDING', 'APPLIED');

-- CreateTable
CREATE TABLE "host_slot_templates" (
    "id" SERIAL NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "host_slot_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "host_shifts" (
    "id" SERIAL NOT NULL,
    "clubDate" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "templateId" INTEGER,
    "memberId" INTEGER,
    "claimedAt" TIMESTAMP(3),
    "claimedVisitId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "host_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "host_perk_grants" (
    "id" SERIAL NOT NULL,
    "shiftId" INTEGER NOT NULL,
    "memberId" INTEGER NOT NULL,
    "status" "HostPerkGrantStatus" NOT NULL DEFAULT 'PENDING',
    "daysAdded" INTEGER NOT NULL DEFAULT 0,
    "visitsAdded" INTEGER NOT NULL DEFAULT 0,
    "entitlementId" INTEGER,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "host_perk_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "host_slot_templates_isActive_sortOrder_idx" ON "host_slot_templates"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "host_shifts_clubDate_templateId_key" ON "host_shifts"("clubDate", "templateId");

-- CreateIndex
CREATE INDEX "host_shifts_clubDate_idx" ON "host_shifts"("clubDate");

-- CreateIndex
CREATE INDEX "host_shifts_memberId_idx" ON "host_shifts"("memberId");

-- CreateIndex
CREATE INDEX "host_shifts_claimedVisitId_idx" ON "host_shifts"("claimedVisitId");

-- CreateIndex
CREATE UNIQUE INDEX "host_perk_grants_shiftId_memberId_key" ON "host_perk_grants"("shiftId", "memberId");

-- CreateIndex
CREATE INDEX "host_perk_grants_memberId_status_idx" ON "host_perk_grants"("memberId", "status");

-- CreateIndex
CREATE INDEX "host_perk_grants_entitlementId_idx" ON "host_perk_grants"("entitlementId");

-- AddForeignKey
ALTER TABLE "host_shifts" ADD CONSTRAINT "host_shifts_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "host_slot_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_shifts" ADD CONSTRAINT "host_shifts_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_shifts" ADD CONSTRAINT "host_shifts_claimedVisitId_fkey" FOREIGN KEY ("claimedVisitId") REFERENCES "club_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_perk_grants" ADD CONSTRAINT "host_perk_grants_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "host_shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_perk_grants" ADD CONSTRAINT "host_perk_grants_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_perk_grants" ADD CONSTRAINT "host_perk_grants_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "club_entitlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
