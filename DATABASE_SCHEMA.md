# Database Schema

This document reflects the current Prisma schema in `server/prisma/schema.prisma`.

## Core tables

### `members`
Stores all authenticated members.

Important columns:
- `id` (PK)
- `firstName`, `lastName`, `email` (unique), `password`
- `roles` (`MemberRole[]`)
- `gender`, `birthDate`, `rating`
- `isActive`, `mustResetPassword`
- `passwordResetToken`, `passwordResetTokenExpiry`
- `picture`, `phone`, `address`

Key notes:
- Email is indexed and unique.
- Passwords are hashed at application level.

### `rating_history`
Immutable audit trail of rating changes.

Important columns:
- `memberId` (FK -> `members.id`)
- `rating`, `ratingChange`, `timestamp`
- `reason` (`RatingChangeReason`)
- optional `tournamentId`, `matchId`

### `tournaments`
Single source for both basic and compound tournament nodes.

Important columns:
- `id`, `name`, `type`, `status`, `cancelled`
- `parentTournamentId` (self-FK hierarchy)
- `groupNumber` (child-group marker)

Relations:
- `participants` (`tournament_participants`)
- `matches`
- `bracketMatches`
- optional one-to-one config tables (`preliminary_configs`, `swiss_tournament_data`)

### `tournament_participants`
Many-to-many bridge between members and basic tournaments.

Important columns:
- `tournamentId` (FK)
- `memberId` (FK)
- `playerRatingAtTime` (snapshot)

Unique constraint:
- `(tournamentId, memberId)`

### `matches`
Stores actual played/scored matches.

Important columns:
- `tournamentId` (nullable for standalone matches)
- `member1Id`, `member2Id`
- `player1Sets`, `player2Sets`
- `player1Forfeit`, `player2Forfeit`
- `round` (used for Swiss)

### `bracket_matches`
Playoff structure/progression table.

Important columns:
- `tournamentId`, `round`, `position`
- `member1Id`, `member2Id`
- `nextMatchId` (self relation)
- `matchId` (optional one-to-one link to actual `matches` row)

Unique constraints:
- `(tournamentId, round, position)`
- `matchId`

### `point_exchange_rules`
Rating exchange matrix with effective dating.

Important columns:
- `minDiff`, `maxDiff`
- `expectedPoints`, `upsetPoints`
- `effectiveFrom`

Used by rating services and seeded by bootstrap scripts.

### `preliminary_configs`
Shared config for preliminary-based compound tournament types.

Important columns:
- `tournamentId` (unique FK)
- `finalSize`
- `autoQualifiedCount`
- `autoQualifiedMemberIds` (`Int[]`)

### `swiss_tournament_data`
One-to-one Swiss tournament runtime/config state.

Important columns:
- `tournamentId` (unique FK)
- `numberOfRounds`, `pairByRating`
- `currentRound`, `isCompleted`

## Enums

### `Gender`
- `MALE`
- `FEMALE`
- `OTHER`

### `MemberRole`
- `PLAYER`
- `COACH`
- `ADMIN`
- `ORGANIZER`

### `TournamentStatus`
- `ACTIVE`
- `COMPLETED`

### `TournamentType`
Basic:
- `ROUND_ROBIN`
- `PLAYOFF`
- `SWISS`

Compound:
- `MULTI_ROUND_ROBINS`
- `PRELIMINARY_WITH_FINAL_PLAYOFF`
- `PRELIMINARY_WITH_FINAL_ROUND_ROBIN`

### `RatingChangeReason`
- `TOURNAMENT_COMPLETED`
- `MATCH_COMPLETED`
- `PLAYOFF_MATCH_COMPLETED`
- `RESULT_CORRECTED`
- `MANUAL_ADJUSTMENT`
- `MEMBER_DEACTIVATED`

## Relationship summary
- Member 1:N RatingHistory
- Member N:M Tournament via TournamentParticipant
- Tournament 1:N Match
- Tournament 1:N BracketMatch
- Tournament 1:N Tournament (parent -> child)
- BracketMatch self-relation via `nextMatchId`
- BracketMatch optional 1:1 Match via `matchId`
- Tournament optional 1:1 PreliminaryConfig
- Tournament optional 1:1 SwissTournamentData

## Operational notes
- For fresh Supabase environments, use `server/scripts/setupSupabaseFresh.ts`:
  - pushes schema via Prisma `db push`
  - seeds `point_exchange_rules`
  - creates/updates Sys Admin
- Application-level validation enforces:
  - US phone format
  - rating bounds (`0..9999`)
  - birth date bounds
  - suspicious rating confirmation behavior in UI
