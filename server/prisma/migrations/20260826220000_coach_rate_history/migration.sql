CREATE TABLE "coach_rate_history" (
    "id" SERIAL NOT NULL,
    "coachProfileId" INTEGER NOT NULL,
    "hourlyRateCents" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorMemberId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_rate_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "coach_rate_history_coachProfileId_effectiveFrom_idx" ON "coach_rate_history"("coachProfileId", "effectiveFrom");

ALTER TABLE "coach_rate_history" ADD CONSTRAINT "coach_rate_history_coachProfileId_fkey" FOREIGN KEY ("coachProfileId") REFERENCES "coach_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "coach_rate_history" ("coachProfileId", "hourlyRateCents", "effectiveFrom", "createdAt")
SELECT "id", "hourlyRateCents", "createdAt", "createdAt" FROM "coach_profiles";
