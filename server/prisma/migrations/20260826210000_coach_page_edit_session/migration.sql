-- AlterTable
ALTER TABLE "coach_profiles" ADD COLUMN "editSessionUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "individual_lessons" ADD COLUMN "reminderHours" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "individual_lessons" ADD COLUMN "reminderSentAt" TIMESTAMP(3);
