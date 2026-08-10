-- In-app payment approval: email vs in-app preference + credit ledger

ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "emailPayLink" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "club_credits" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "issuerMemberId" INTEGER,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_credits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "club_credits_memberId_idx" ON "club_credits"("memberId");
CREATE INDEX IF NOT EXISTS "club_credits_createdAt_idx" ON "club_credits"("createdAt");
CREATE INDEX IF NOT EXISTS "club_credits_externalRef_idx" ON "club_credits"("externalRef");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'club_credits_memberId_fkey'
  ) THEN
    ALTER TABLE "club_credits"
      ADD CONSTRAINT "club_credits_memberId_fkey"
      FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'club_credits_issuerMemberId_fkey'
  ) THEN
    ALTER TABLE "club_credits"
      ADD CONSTRAINT "club_credits_issuerMemberId_fkey"
      FOREIGN KEY ("issuerMemberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
