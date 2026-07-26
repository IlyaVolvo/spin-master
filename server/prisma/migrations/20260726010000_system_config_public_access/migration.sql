-- AlterTable
ALTER TABLE "system_config" ADD COLUMN IF NOT EXISTS "publicAccess" JSONB NOT NULL DEFAULT '{}';
