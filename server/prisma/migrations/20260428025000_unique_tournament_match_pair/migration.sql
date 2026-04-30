-- Prevent concurrent first-score submissions from creating duplicate match rows
-- for the same ordered tournament/player/player triplet.
CREATE UNIQUE INDEX "matches_tournament_pair_unique"
ON "matches"("tournamentId", "member1Id", "member2Id");
