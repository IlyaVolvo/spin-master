-- Convert individual matches (2-participant, 1-match "tournaments") to standalone matches
-- Step 1: Identify the tournament IDs to convert
-- These are top-level ROUND_ROBIN tournaments with exactly 2 participants and exactly 1 match

-- Step 2: Null out tournamentId on rating_history for these tournaments
UPDATE "rating_history"
SET "tournamentId" = NULL
WHERE "tournamentId" IN (
  SELECT t.id
  FROM tournaments t
  WHERE t."parentTournamentId" IS NULL
    AND t.type = 'ROUND_ROBIN'
    AND (SELECT count(*) FROM tournament_participants tp WHERE tp."tournamentId" = t.id) = 2
    AND (SELECT count(*) FROM matches m WHERE m."tournamentId" = t.id) = 1
);

-- Step 3: Null out tournamentId on matches (converting them to standalone)
UPDATE "matches"
SET "tournamentId" = NULL
WHERE "tournamentId" IN (
  SELECT t.id
  FROM tournaments t
  WHERE t."parentTournamentId" IS NULL
    AND t.type = 'ROUND_ROBIN'
    AND (SELECT count(*) FROM tournament_participants tp WHERE tp."tournamentId" = t.id) = 2
    AND (SELECT count(*) FROM matches m WHERE m."tournamentId" = t.id) = 1
);

-- Step 4: Delete tournament_participants for these tournaments
DELETE FROM "tournament_participants"
WHERE "tournamentId" IN (
  SELECT t.id
  FROM tournaments t
  WHERE t."parentTournamentId" IS NULL
    AND t.type = 'ROUND_ROBIN'
    AND (SELECT count(*) FROM tournament_participants tp WHERE tp."tournamentId" = t.id) = 2
    AND (SELECT count(*) FROM matches m WHERE m."tournamentId" = t.id) = 0
);

-- Step 5: Delete the empty tournament shells
-- At this point matches are detached (step 3), so match count = 0
DELETE FROM "tournaments"
WHERE id IN (
  SELECT t.id
  FROM tournaments t
  WHERE t."parentTournamentId" IS NULL
    AND t.type = 'ROUND_ROBIN'
    AND (SELECT count(*) FROM tournament_participants tp WHERE tp."tournamentId" = t.id) = 0
    AND (SELECT count(*) FROM matches m WHERE m."tournamentId" = t.id) = 0
    AND (SELECT count(*) FROM tournaments c WHERE c."parentTournamentId" = t.id) = 0
);
