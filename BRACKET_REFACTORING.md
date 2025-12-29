# Bracket Structure Refactoring

## Overview
Separated playoff-specific bracket fields into a dedicated `BracketMatch` table to improve database normalization and clarity.

## Changes Made

### Schema Changes

1. **New `BracketMatch` Table**
   - Stores the bracket structure for playoff tournaments
   - Contains: `round`, `position`, `player1Id`, `player2Id`, `nextMatchId`
   - Links to `Tournament` via foreign key
   - Self-referential relationship for bracket advancement (`nextMatchId`)
   - Maintains bracket structure from start to finish, including unplayed matches

2. **Updated `Match` Table**
   - Removed playoff-specific fields: `round`, `position`, `nextMatchId`
   - Added `bracketMatchId` field (nullable) to link to `BracketMatch`
   - Now stores only actual match results
   - For playoff tournaments, one `Match` record links to one `BracketMatch` when a match is played

### Key Relationships

```
Tournament
  ├── BracketMatch[] (bracket structure)
  └── Match[] (actual results)
  
BracketMatch
  ├── Tournament (many-to-one)
  ├── Match? (one-to-one, when match is played)
  ├── nextMatch? (self-referential, for bracket advancement)
  └── previousMatches[] (inverse of nextMatch)
```

## Benefits

1. **Separation of Concerns**: Bracket structure is separate from match results
2. **Clarity**: `Match` table only contains actual results, not bracket metadata
3. **Flexibility**: Can build complete bracket structure even before any matches are played
4. **Normalization**: Playoff-specific data is isolated from general match data

## Migration Steps Required

1. Create migration file
2. Migrate existing data:
   - Create `BracketMatch` records for existing playoff tournaments
   - Link existing `Match` records to `BracketMatch` records
   - Remove `round`, `position`, `nextMatchId` from `Match` table

3. Update backend services:
   - `playoffBracketService.ts` - Create/update `BracketMatch` records instead of `Match` records for bracket structure
   - Update `advanceWinner` to work with `BracketMatch` table
   - Update bracket retrieval to query `BracketMatch` table

4. Update frontend:
   - Update bracket rendering to use new structure
   - Ensure compatibility with new data model

## Migration Status

✅ **Database Migration Completed**
- Created `bracket_matches` table
- Added `bracketMatchId` to `matches` table
- Removed `round`, `position`, `nextMatchId` from `matches` table
- Verified: No Playoff tournaments exist in database, so no data migration needed
- Prisma client regenerated

## Implementation Status

✅ **Backend Services Updated**
- ✅ Updated `createPlayoffBracketWithPositions` to create `BracketMatch` records for all rounds
- ✅ Updated `advanceWinner` to work with `BracketMatch` table (uses bracketMatchId instead of matchId)
- ✅ Updated `getBracketStructure` to query `BracketMatch` table with match results included
- ✅ Updated tournament creation endpoint to create bracket matches and return bracketMatches
- ✅ Updated tournament fetch endpoints to include bracketMatches
- ✅ Updated match update endpoint to use bracketMatchId for advancing winners

⚠️ **Remaining Tasks**
- [ ] Update frontend `TraditionalBracket` component to use bracketMatches instead of matches with round/position
- [ ] Update frontend match editing to work with bracketMatchId
- [ ] Update match creation for playoff tournaments to link to BracketMatch
- [ ] Test bracket creation, display, and match updates with new schema

