-- CreateEnum
CREATE TYPE "ClubVisitClosedBy" AS ENUM ('SCAN', 'MANUAL', 'AUTO');

-- CreateEnum
CREATE TYPE "ClubEntitlementType" AS ENUM ('YEARLY', 'MONTHLY', 'VISIT_PACK', 'PAY_PER_VISIT_EXTERNAL');

-- CreateEnum
CREATE TYPE "ClubEntitlementStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'EXHAUSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClubPaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');

-- AlterTable: Add clubDiscount to members
ALTER TABLE "members" ADD COLUMN "clubDiscount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable: club_visits
CREATE TABLE "club_visits" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "clubDate" TEXT NOT NULL,
    "checkInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkOutAt" TIMESTAMP(3),
    "closedBy" "ClubVisitClosedBy",
    "dailyPaymentApplied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable: club_entitlements
CREATE TABLE "club_entitlements" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "type" "ClubEntitlementType" NOT NULL,
    "status" "ClubEntitlementStatus" NOT NULL DEFAULT 'ACTIVE',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "visitsTotal" INTEGER,
    "visitsRemaining" INTEGER,
    "pricePaid" INTEGER NOT NULL DEFAULT 0,
    "discountApplied" INTEGER NOT NULL DEFAULT 0,
    "notificationSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable: club_payments
CREATE TABLE "club_payments" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "entitlementId" INTEGER,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "ClubPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "externalRef" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "club_visits_memberId_idx" ON "club_visits"("memberId");
CREATE INDEX "club_visits_clubDate_idx" ON "club_visits"("clubDate");
CREATE INDEX "club_visits_memberId_clubDate_idx" ON "club_visits"("memberId", "clubDate");

-- CreateIndex
CREATE INDEX "club_entitlements_memberId_idx" ON "club_entitlements"("memberId");
CREATE INDEX "club_entitlements_memberId_status_idx" ON "club_entitlements"("memberId", "status");

-- CreateIndex
CREATE INDEX "club_payments_memberId_idx" ON "club_payments"("memberId");
CREATE INDEX "club_payments_entitlementId_idx" ON "club_payments"("entitlementId");
CREATE INDEX "club_payments_externalRef_idx" ON "club_payments"("externalRef");

-- AddForeignKey
ALTER TABLE "club_visits" ADD CONSTRAINT "club_visits_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_entitlements" ADD CONSTRAINT "club_entitlements_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_payments" ADD CONSTRAINT "club_payments_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_payments" ADD CONSTRAINT "club_payments_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "club_entitlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
