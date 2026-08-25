-- AlterTable
ALTER TABLE "host_shifts" ADD COLUMN "reminderEmailedAt" TIMESTAMP(3);
ALTER TABLE "host_shifts" ADD COLUMN "noShowEmailedAt" TIMESTAMP(3);
