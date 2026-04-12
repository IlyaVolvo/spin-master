ALTER TABLE "members"
ADD COLUMN "emailConfirmedAt" TIMESTAMP(3);

UPDATE "members"
SET "emailConfirmedAt" = COALESCE("emailConfirmedAt", NOW())
WHERE "isActive" = true;
