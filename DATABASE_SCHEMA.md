# Database Schema Documentation

## Overview

The Spin Master database uses PostgreSQL with Prisma ORM. The schema is designed to support tournament management, player ratings, match tracking, and historical data preservation.

## Entity Relationship Diagram

```
┌─────────────────┐
│     Member      │
│  (Players, etc) │
└────────┬────────┘
         │
         │ 1:N
         │
┌────────▼─────────────────┐      ┌──────────────────┐
│ TournamentParticipant    │      │  RatingHistory   │
│ (Junction Table)         │      │                  │
└────────┬─────────────────┘      └──────────────────┘
         │                                │
         │ N:1                            │ N:1
         │                                │
┌────────▼─────────────────┐      ┌──────▼──────────┐
│     Tournament           │      │     Member      │
│  (Self-referential)      │      │   (same table)  │
└────────┬─────────────────┘      └─────────────────┘
         │
         │ 1:N
         │
    ┌────┴────┬──────────────┐
    │         │              │
┌───▼───┐ ┌──▼──┐    ┌──────▼──────┐
│ Match │ │Bracket│   │PointExchange│
│       │ │Match │   │   Rule      │
└───────┘ └──────┘   └─────────────┘
```

## Tables

### 1. members

**Purpose**: Stores all users of the system (players, coaches, admins, organizers)

**Columns**:

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Unique identifier |
| firstName | TEXT | NOT NULL | First name |
| lastName | TEXT | NOT NULL | Last name |
| birthDate | TIMESTAMP(3) | NULL | Optional birth date for filtering |
| isActive | BOOLEAN | NOT NULL, DEFAULT true | Soft delete flag |
| createdAt | TIMESTAMP(3) | NOT NULL, DEFAULT now() | Record creation timestamp |
| updatedAt | TIMESTAMP(3) | NOT NULL | Last update timestamp |
| rating | INTEGER | NULL | USATT-style numeric rating |
| email | TEXT | NOT NULL, UNIQUE | Email address (unique) |
| gender | Gender | NOT NULL | Enum: MALE, FEMALE, OTHER |
| password | TEXT | NOT NULL | Hashed password (bcrypt) |
| roles | MemberRole[] | NOT NULL | Array of roles: PLAYER, COACH, ADMIN, ORGANIZER |
| picture | TEXT | NULL | Image URL or path |
| phone | TEXT | NULL | Phone number |
| address | TEXT | NULL | Physical address |
| mustResetPassword | BOOLEAN | NOT NULL, DEFAULT false | Flag for forced password reset |
| passwordResetToken | TEXT | NULL | Token for password reset |
| passwordResetTokenExpiry | TIMESTAMP(3) | NULL | Expiration time for reset token |

**Indexes**:
- `members_email_key` (UNIQUE on email)
- `members_email_idx` (on email)

**Relationships**:
- One-to-many: `ratingHistory` → RatingHistory
- One-to-many: `tournamentParticipants` → TournamentParticipant

**Notes**:
- Never hard-deleted (uses `isActive` flag)
- Password is hashed with bcrypt
- Rating can be NULL for new players
- Roles stored as PostgreSQL array

---

### 2. rating_history

**Purpose**: Complete audit trail of all rating changes

**Columns**:

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Unique identifier |
| memberId | INTEGER | NOT NULL, FK → members.id | Reference to member |
| rating | INTEGER | NULL | Rating after this change |
| ratingChange | INTEGER | NULL | Change amount (+/-) |
| timestamp | TIMESTAMP(3) | NOT NULL, DEFAULT now() | When change occurred |
| reason | RatingChangeReason | NOT NULL | Why rating changed |
| tournamentId | INTEGER | NULL, FK → tournaments.id | Source tournament |
| matchId | INTEGER | NULL | Source match |

**Indexes**:
- `rating_history_memberId_idx` (on memberId)
- `rating_history_timestamp_idx` (on timestamp)
- `rating_history_tournamentId_idx` (on tournamentId)
- `rating_history_matchId_idx` (on matchId)

**Foreign Keys**:
- `memberId` → `members.id` (ON DELETE CASCADE)

**Enum: RatingChangeReason**:
- `TOURNAMENT_COMPLETED`: Tournament finished
- `MATCH_COMPLETED`: Individual match completed
- `PLAYOFF_MATCH_COMPLETED`: Playoff match completed
- `RESULT_CORRECTED`: Match result was corrected
- `MANUAL_ADJUSTMENT`: Admin manually adjusted rating
- `MEMBER_DEACTIVATED`: Member was deactivated

**Notes**:
- Immutable record (never updated, only inserted)
- Provides complete historical audit trail
- Links to source tournament/match when applicable

---

### 3. tournaments

**Purpose**: Tournament container with metadata and configuration

**Columns**:

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Unique identifier |
| name | TEXT | NULL | Tournament name |
| type | TournamentType | NOT NULL, DEFAULT 'ROUND_ROBIN' | Tournament type |
| status | TournamentStatus | NOT NULL, DEFAULT 'ACTIVE' | Tournament status |
| cancelled | BOOLEAN | NOT NULL, DEFAULT false | Cancelled flag |
| createdAt | TIMESTAMP(3) | NOT NULL, DEFAULT now() | Creation timestamp |
| recordedAt | TIMESTAMP(3) | NOT NULL | Last update timestamp |
| parentTournamentId | INTEGER | NULL, FK → tournaments.id | Parent tournament (for child tournaments) |
| roundRobinSize | INTEGER | NULL | Group size for PRELIMINARY_AND_PLAYOFF |
| playoffBracketSize | INTEGER | NULL | Bracket size for PRELIMINARY_AND_PLAYOFF |
| groupNumber | INTEGER | NULL | Group number for Round Robin groups |

**Indexes**:
- (Implicit indexes on foreign keys)

**Foreign Keys**:
- `parentTournamentId` → `tournaments.id` (ON DELETE CASCADE) - Self-referential

**Enum: TournamentType**:
- `ROUND_ROBIN`: All players play each other
- `PLAYOFF`: Single-elimination bracket
- `MULTI`: Not used for creation (client-side logic only)
- `SINGLE_MATCH`: One-off matches
- `PRELIMINARY_AND_PLAYOFF`: Multiple RR groups → Playoff
- `PRELIMINARY_AND_ROUND_ROBIN`: Future type
- `SWISS`: Future type

**Enum: TournamentStatus**:
- `ACTIVE`: Tournament in progress
- `COMPLETED`: Tournament finished

**Relationships**:
- One-to-many: `participants` → TournamentParticipant
- One-to-many: `matches` → Match
- One-to-many: `bracketMatches` → BracketMatch
- Self-referential: `parentTournament` → `childTournaments`

**Notes**:
- Self-referential relationship for parent-child tournaments
- `cancelled` flag marks incomplete tournaments moved to COMPLETED
- `roundRobinSize` and `playoffBracketSize` only used for PRELIMINARY_AND_PLAYOFF
- `groupNumber` identifies Round Robin groups in preliminary phase

---

### 4. tournament_participants

**Purpose**: Junction table linking players to tournaments with rating snapshot

**Columns**:

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Unique identifier |
| tournamentId | INTEGER | NOT NULL, FK → tournaments.id | Reference to tournament |
| memberId | INTEGER | NOT NULL, FK → members.id | Reference to member |
| playerRatingAtTime | INTEGER | NULL | Rating snapshot when tournament started |

**Indexes**:
- `tournament_participants_tournamentId_idx` (on tournamentId)
- `tournament_participants_memberId_idx` (on memberId)
- `tournament_participants_tournamentId_memberId_key` (UNIQUE on tournamentId, memberId)

**Foreign Keys**:
- `tournamentId` → `tournaments.id` (ON DELETE CASCADE)
- `memberId` → `members.id` (ON DELETE RESTRICT)

**Notes**:
- Unique constraint prevents duplicate participants
- Rating snapshot ensures historical accuracy
- Cascade delete when tournament is deleted
- Restrict delete when member is deleted (prevents data loss)

---

### 5. bracket_matches

**Purpose**: Defines playoff bracket structure and progression

**Columns**:

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Unique identifier |
| tournamentId | INTEGER | NOT NULL, FK → tournaments.id | Reference to tournament |
| round | INTEGER | NOT NULL | Round number (1 = first round, etc.) |
| position | INTEGER | NOT NULL | Position within round |
| member1Id | INTEGER | NULL | Seeded player 1 (null if not determined, 0 for BYE) |
| member2Id | INTEGER | NULL | Seeded player 2 (null if not determined, 0 for BYE) |
| nextMatchId | INTEGER | NULL, FK → bracket_matches.id | Next round match winner advances to |
| createdAt | TIMESTAMP(3) | NOT NULL, DEFAULT now() | Creation timestamp |
| updatedAt | TIMESTAMP(3) | NOT NULL | Last update timestamp |

**Indexes**:
- `bracket_matches_tournamentId_idx` (on tournamentId)
- `bracket_matches_tournamentId_round_position_key` (UNIQUE on tournamentId, round, position)
- `bracket_matches_nextMatchId_idx` (on nextMatchId)

**Foreign Keys**:
- `tournamentId` → `tournaments.id` (ON DELETE CASCADE)
- `nextMatchId` → `bracket_matches.id` (Self-referential)

**Relationships**:
- One-to-one: `match` → Match (via bracketMatchId)
- Self-referential: `nextMatch` → `previousMatches`

**Notes**:
- Defines bracket structure before matches are played
- `member1Id`/`member2Id` can be null if not yet determined from previous round
- Value 0 represents BYE (no opponent)
- `nextMatchId` links to next round match for winner progression
- Unique constraint ensures one match per round/position

---

### 6. matches

**Purpose**: Stores actual match results for all tournament types

**Columns**:

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Unique identifier |
| tournamentId | INTEGER | NOT NULL, FK → tournaments.id | Reference to tournament |
| bracketMatchId | INTEGER | NULL, FK → bracket_matches.id | Link to bracket (for playoffs) |
| member1Id | INTEGER | NOT NULL | Player 1 ID |
| member2Id | INTEGER | NULL | Player 2 ID (null for BYE matches) |
| player1Sets | INTEGER | NOT NULL, DEFAULT 0 | Sets won by player 1 |
| player2Sets | INTEGER | NOT NULL, DEFAULT 0 | Sets won by player 2 |
| player1Forfeit | BOOLEAN | NOT NULL, DEFAULT false | Player 1 forfeited |
| player2Forfeit | BOOLEAN | NOT NULL, DEFAULT false | Player 2 forfeited |
| createdAt | TIMESTAMP(3) | NOT NULL, DEFAULT now() | Creation timestamp |
| updatedAt | TIMESTAMP(3) | NOT NULL | Last update timestamp |

**Indexes**:
- `matches_tournamentId_idx` (on tournamentId)
- `matches_bracketMatchId_idx` (on bracketMatchId)
- `matches_member1Id_idx` (on member1Id)
- `matches_member2Id_idx` (on member2Id)
- `matches_member1Id_member2Id_idx` (on member1Id, member2Id)
- `matches_bracketMatchId_key` (UNIQUE on bracketMatchId)

**Foreign Keys**:
- `tournamentId` → `tournaments.id` (ON DELETE CASCADE)
- `bracketMatchId` → `bracket_matches.id` (ON DELETE SET NULL)

**Notes**:
- For playoff tournaments, links to BracketMatch
- For Round Robin, `bracketMatchId` is NULL
- `member2Id` can be NULL for BYE matches
- Unique constraint on `bracketMatchId` ensures one match per bracket position
- Can be updated for result corrections

---

### 7. point_exchange_rules

**Purpose**: Defines rating point exchange rules based on rating differences

**Columns**:

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Unique identifier |
| minDiff | INTEGER | NOT NULL | Minimum rating difference (inclusive) |
| maxDiff | INTEGER | NOT NULL | Maximum rating difference (inclusive) |
| expectedPoints | INTEGER | NOT NULL | Points for expected result (higher-rated wins) |
| upsetPoints | INTEGER | NOT NULL | Points for upset (lower-rated wins) |
| effectiveFrom | TIMESTAMP(3) | NOT NULL, DEFAULT now() | When rule becomes effective |
| createdAt | TIMESTAMP(3) | NOT NULL, DEFAULT now() | Creation timestamp |
| updatedAt | TIMESTAMP(3) | NOT NULL | Last update timestamp |

**Indexes**:
- `point_exchange_rules_minDiff_maxDiff_effectiveFrom_key` (UNIQUE on minDiff, maxDiff, effectiveFrom)
- `point_exchange_rules_effectiveFrom_idx` (on effectiveFrom)

**Notes**:
- Allows rule changes over time (via `effectiveFrom`)
- Unique constraint prevents duplicate rules for same time period
- Used by RankingService to calculate rating changes
- Rules define point exchanges based on rating difference ranges

---

## Enums

### Gender
- `MALE`
- `FEMALE`
- `OTHER`

### MemberRole
- `PLAYER`: Regular player
- `COACH`: Coach role (future use)
- `ADMIN`: System administrator
- `ORGANIZER`: Tournament organizer

### TournamentType
- `ROUND_ROBIN`: All players play each other
- `PLAYOFF`: Single-elimination bracket
- `MULTI`: Not used for creation (client-side logic)
- `SINGLE_MATCH`: One-off matches
- `PRELIMINARY_AND_PLAYOFF`: Multiple RR groups → Playoff
- `PRELIMINARY_AND_ROUND_ROBIN`: Future type
- `SWISS`: Future type

### TournamentStatus
- `ACTIVE`: Tournament in progress
- `COMPLETED`: Tournament finished

### RatingChangeReason
- `TOURNAMENT_COMPLETED`: Tournament finished
- `MATCH_COMPLETED`: Individual match completed
- `PLAYOFF_MATCH_COMPLETED`: Playoff match completed
- `RESULT_CORRECTED`: Match result was corrected
- `MANUAL_ADJUSTMENT`: Admin manually adjusted rating
- `MEMBER_DEACTIVATED`: Member was deactivated

---

## Relationships Summary

### One-to-Many
- Member → RatingHistory
- Member → TournamentParticipant
- Tournament → TournamentParticipant
- Tournament → Match
- Tournament → BracketMatch
- Tournament → Tournament (self-referential: parent → children)
- BracketMatch → BracketMatch (self-referential: nextMatch → previousMatches)

### Many-to-Many
- Member ↔ Tournament (via TournamentParticipant)

### One-to-One
- BracketMatch → Match (via bracketMatchId)

---

## Constraints

### Unique Constraints
- `members.email`: Email must be unique
- `tournament_participants(tournamentId, memberId)`: One participation per tournament per member
- `bracket_matches(tournamentId, round, position)`: One match per round/position
- `matches.bracketMatchId`: One match result per bracket match
- `point_exchange_rules(minDiff, maxDiff, effectiveFrom)`: Unique rule per time period

### Foreign Key Constraints
- All foreign keys have appropriate CASCADE or RESTRICT rules
- Self-referential relationships use CASCADE for parent-child deletion

---

## Indexes

### Performance Indexes
- Email lookups: `members.email`
- Rating queries: Implicit on `members.rating`
- Tournament lookups: `tournament_participants.tournamentId`
- Member lookups: `tournament_participants.memberId`
- History queries: `rating_history.memberId`, `rating_history.timestamp`
- Match queries: `matches.tournamentId`, `matches.member1Id`, `matches.member2Id`
- Bracket queries: `bracket_matches.tournamentId`, `bracket_matches.nextMatchId`

---

## Data Integrity Rules

### Business Rules Enforced by Schema
1. **Soft Deletes**: Members never hard-deleted (uses `isActive` flag)
2. **Historical Accuracy**: Rating snapshots in TournamentParticipant
3. **Audit Trail**: RatingHistory is immutable
4. **Tournament Hierarchy**: Parent-child relationships via self-reference
5. **Bracket Structure**: Unique positions per round
6. **Match Uniqueness**: One match per bracket position

### Validation Rules (Application Level)
- Rating ranges (0-9999)
- Tournament participant minimums
- Match score validation
- Password requirements
- Email format validation

---

## Migration History

### Initial Migration
- `20250101000000_init`: Initial schema creation

### Manual Changes
- Added enum values: `PRELIMINARY_AND_PLAYOFF`, `PRELIMINARY_AND_ROUND_ROBIN`, `SWISS`
- Added columns: `parentTournamentId`, `roundRobinSize`, `playoffBracketSize`, `groupNumber`

---

## Future Schema Considerations

### Potential Improvements
1. **Normalization**: Consider separating match metadata
2. **Indexes**: Add composite indexes for common query patterns
3. **Partitioning**: Consider partitioning `rating_history` by timestamp
4. **Archiving**: Strategy for old completed tournaments
5. **Audit Tables**: Separate audit tables for sensitive operations
6. **Soft Deletes**: Consider soft deletes for tournaments/matches

### Planned Additions
- Support for `PRELIMINARY_AND_ROUND_ROBIN` tournament type
- Support for `SWISS` tournament type
- Additional statistics tables
- Notification preferences
- Tournament templates

---

## Database Statistics

### Current State
- **Tables**: 7
- **Enums**: 5
- **Relationships**: 8 (including self-referential)
- **Indexes**: 15+
- **Foreign Keys**: 10

### Data Volume Considerations
- `rating_history`: Grows with every rating change (consider archiving)
- `matches`: Grows with tournament activity
- `tournaments`: Moderate growth
- `members`: Slow growth

---

## Backup & Recovery

### Recommended Strategy
- Daily automated backups
- Point-in-time recovery capability
- Transaction log backups
- Test restore procedures regularly

### Prisma Migrations
- All schema changes via Prisma migrations
- Migration files in `server/prisma/migrations/`
- Never modify database directly (use migrations)

---

## Security Considerations

### Data Protection
- Passwords: Hashed with bcrypt (never stored in plain text)
- Sensitive fields: Excluded from API responses
- Foreign keys: Prevent orphaned records
- Constraints: Enforce data integrity

### Access Control
- Database user with minimal required permissions
- Connection string stored in environment variables
- No direct database access from client
- All access via API with authentication
