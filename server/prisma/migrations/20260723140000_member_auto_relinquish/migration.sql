-- Per-member override for auto privilege relinquish (null = use club authPolicy default).
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "autoRelinquishPrivileges" BOOLEAN;
