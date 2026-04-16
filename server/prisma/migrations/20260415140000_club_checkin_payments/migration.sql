-- Club check-in, entitlements, and payment ledger (no PSP secrets)

-- CreateEnum
CREATE TYPE "ClubVisitClosedBy" AS ENUM ('SCAN', 'MANUAL', 'AUTO');

-- CreateEnum
CREATE TYPE "ClubEntitlementType" AS ENUM ('YEARLY', 'MONTHLY', 'VISIT_PACK', 'PAY_PER_VISIT_EXTERNAL');

-- CreateEnum
CREATE TYPE "ClubPaymentProvider" AS ENUM ('MANUAL', 'EXTERNAL_CHECKOUT', 'STRIPE');

-- CreateEnum
CREATE TYPE "ClubPaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "club_visits" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "clubDate" TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL,
    "checkedOutAt" TIMESTAMP(3),
    "closedBy" "ClubVisitClosedBy",
    "dailyPaymentApplied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_entitlements" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "type" "ClubEntitlementType" NOT NULL,
    "label" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "visitsRemaining" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_payments" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "provider" "ClubPaymentProvider" NOT NULL DEFAULT 'MANUAL',
    "externalRef" TEXT,
    "status" "ClubPaymentStatus" NOT NULL,
    "purpose" TEXT NOT NULL,
    "metadata" JSONB,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_payments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "club_visits" ADD CONSTRAINT "club_visits_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_entitlements" ADD CONSTRAINT "club_entitlements_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_payments" ADD CONSTRAINT "club_payments_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "club_visits_memberId_clubDate_idx" ON "club_visits"("memberId", "clubDate");

-- CreateIndex
CREATE INDEX "club_visits_clubDate_idx" ON "club_visits"("clubDate");

-- CreateIndex
CREATE INDEX "club_entitlements_memberId_idx" ON "club_entitlements"("memberId");

-- CreateIndex
CREATE INDEX "club_payments_memberId_idx" ON "club_payments"("memberId");

-- CreateIndex
CREATE INDEX "club_payments_externalRef_idx" ON "club_payments"("externalRef");
