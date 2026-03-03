# Obsolete Scripts Audit

This document records scripts removed as part of the obsolete-script cleanup and lists the scripts preserved as supported maintenance tooling.

## Removed scripts
The following scripts were removed because they were tied to legacy `player`/`rankingHistory` model names or one-time historical migration flows:

1. `recalculateAllRatings.ts`
2. `resetAndRecalculateRatings.ts`
3. `generateRandomRoundRobinTournament.ts`
4. `generateRatingBracketMatches.ts`
5. `debugPlayerRatings.ts`
6. `debugRatingCalculation.ts`
7. `deleteInactivePlayers.ts`
8. `dumpRankingHistory.ts`
9. `migratePlayersToMembers.ts`

## Preserved scripts
These scripts remain supported and aligned with the current member-based schema/workflows:

- `ClearDB-RepopulateDB.ts`
- `cleanRecentTournaments.ts`
- `createSysAdmin.ts`
- `deleteMember.ts`
- `generatePasswordHash.ts`
- `generatePasswords.ts`
- `generateTournament.ts`
- `seedPointExchangeRules.ts`
- `setupNewDatabase.ts`
- `setupSupabaseFresh.ts`
- `testEmail.ts`
- `validate-api-docs.ts`

## Notes
- `SCRIPTS.md` and top-level docs were updated to remove stale references to deleted scripts.
- Canonical Supabase bootstrap npm command is `npm run setup-supabase-initial` (run from `server/`).
