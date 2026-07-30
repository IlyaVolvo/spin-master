-- Online-pay consent (OFF by default); required with email for automatic checkout

ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "onlinePayConsent" BOOLEAN NOT NULL DEFAULT false;
