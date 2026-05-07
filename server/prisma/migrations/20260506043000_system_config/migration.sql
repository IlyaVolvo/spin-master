CREATE TABLE "system_config" (
  "id" TEXT NOT NULL DEFAULT 'system',
  "branding" JSONB NOT NULL DEFAULT '{}',
  "authPolicy" JSONB NOT NULL DEFAULT '{}',
  "preregistration" JSONB NOT NULL DEFAULT '{}',
  "ratingValidation" JSONB NOT NULL DEFAULT '{}',
  "tournamentRules" JSONB NOT NULL DEFAULT '{}',
  "clientRuntime" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "system_config_pkey" PRIMARY KEY ("id")
);

INSERT INTO "system_config" (
  "id",
  "branding",
  "authPolicy",
  "preregistration",
  "ratingValidation",
  "tournamentRules",
  "clientRuntime"
) VALUES (
  'system',
  '{}',
  '{"minimumPasswordLength":6,"passwordResetTokenTtlHours":1}',
  '{"defaultTournamentOffsetDays":1,"defaultTournamentTime":"18:00","registrationDeadlineOffsetMinutes":30,"cancelReasonPresets":["Tournament cancelled by organizer","Not enough registered players","Schedule conflict","Venue unavailable","Weather or emergency closure"]}',
  '{"ratingInputMin":0,"ratingInputMax":9999,"suspiciousRatingMin":800,"suspiciousRatingMax":2100}',
  '{"roundRobin":{"minPlayers":3,"maxPlayers":32},"playoff":{"minPlayers":4,"seedDivisor":4},"swiss":{"minPlayers":6,"pairByRating":true,"maxRoundsDivisor":2},"multiRoundRobins":{"minPlayers":5,"minGroupSize":3,"minGroups":2},"preliminary":{"groupSizeMin":3,"groupSizeMax":12,"groupSizeDefault":4,"finalRoundRobinSizeDefault":6,"reservedFinalSpotsForAutoQualified":6},"matchScore":{"min":0,"max":4,"allowEqualScores":false}}',
  '{"tournamentsListCacheTtlMs":30000,"socketReconnectionDelayMs":1000,"socketReconnectionAttempts":5}'
)
ON CONFLICT ("id") DO NOTHING;
