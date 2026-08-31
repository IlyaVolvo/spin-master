-- Wipe existing group-class rows (no grandfather). Payments stay; registration FKs SET NULL.
TRUNCATE TABLE
  "group_class_registrations",
  "group_class_occurrences",
  "group_class_coaches",
  "group_class_slots",
  "group_classes"
RESTART IDENTITY CASCADE;

-- Replace registration statuses
ALTER TABLE "group_class_registrations" ALTER COLUMN "status" DROP DEFAULT;
ALTER TYPE "GroupRegistrationStatus" RENAME TO "GroupRegistrationStatus_old";
CREATE TYPE "GroupRegistrationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'WAITING', 'DROPPED');
ALTER TABLE "group_class_registrations"
  ALTER COLUMN "status" TYPE "GroupRegistrationStatus"
  USING 'DROPPED'::"GroupRegistrationStatus";
DROP TYPE "GroupRegistrationStatus_old";
ALTER TABLE "group_class_registrations" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"GroupRegistrationStatus";

CREATE TYPE "GroupClassStatus" AS ENUM ('PENDING', 'ACCEPTING');
CREATE TYPE "GroupCoachInviteStatus" AS ENUM ('INVITED', 'ACCEPTED', 'DECLINED');

ALTER TYPE "LessonLifecycleAction" ADD VALUE 'CLASS_INVITE';
ALTER TYPE "LessonLifecycleAction" ADD VALUE 'CLASS_INVITE_ACCEPT';
ALTER TYPE "LessonLifecycleAction" ADD VALUE 'CLASS_INVITE_DENY';
ALTER TYPE "LessonLifecycleAction" ADD VALUE 'CLASS_FINALIZE';
ALTER TYPE "LessonLifecycleAction" ADD VALUE 'DESIGNATED_ACCEPT';
ALTER TYPE "LessonLifecycleAction" ADD VALUE 'DESIGNATED_EXPIRE';
ALTER TYPE "LessonLifecycleAction" ADD VALUE 'CLASS_AUTO_CANCEL';

ALTER TABLE "group_classes" ADD COLUMN "status" "GroupClassStatus" NOT NULL DEFAULT 'PENDING';
CREATE INDEX "group_classes_status_idx" ON "group_classes"("status");

ALTER TABLE "group_class_coaches" ADD COLUMN "inviteStatus" "GroupCoachInviteStatus" NOT NULL DEFAULT 'INVITED';
ALTER TABLE "group_class_coaches" ADD COLUMN "inviteToken" TEXT;
ALTER TABLE "group_class_coaches" ADD COLUMN "respondedAt" TIMESTAMP(3);

UPDATE "group_class_coaches" SET "inviteToken" = md5(random()::text || id::text || clock_timestamp()::text) WHERE "inviteToken" IS NULL;
ALTER TABLE "group_class_coaches" ALTER COLUMN "inviteToken" SET NOT NULL;
CREATE UNIQUE INDEX "group_class_coaches_inviteToken_key" ON "group_class_coaches"("inviteToken");
DROP INDEX IF EXISTS "group_class_coaches_coachProfileId_idx";
CREATE INDEX "group_class_coaches_coachProfileId_inviteStatus_idx" ON "group_class_coaches"("coachProfileId", "inviteStatus");

ALTER TABLE "group_class_occurrences" DROP COLUMN "runBelowMin";

CREATE TABLE "group_class_designees" (
    "id" SERIAL NOT NULL,
    "classId" INTEGER NOT NULL,
    "memberId" INTEGER NOT NULL,
    "acceptToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_class_designees_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "group_class_designees_acceptToken_key" ON "group_class_designees"("acceptToken");
CREATE UNIQUE INDEX "group_class_designees_classId_memberId_key" ON "group_class_designees"("classId", "memberId");
CREATE INDEX "group_class_designees_memberId_idx" ON "group_class_designees"("memberId");
ALTER TABLE "group_class_designees" ADD CONSTRAINT "group_class_designees_classId_fkey" FOREIGN KEY ("classId") REFERENCES "group_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_class_designees" ADD CONSTRAINT "group_class_designees_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
