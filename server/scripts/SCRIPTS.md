# Server Maintenance Scripts

All scripts are run from the `server/` directory:

```bash
cd server
npx tsx scripts/<script>.ts [args]
```

---

## Table of Contents

- [Database Setup & Seeding](#database-setup--seeding)
- [Tournament Generation](#tournament-generation)
- [Tournament & Data Cleanup](#tournament--data-cleanup)
- [User Management](#user-management)
- [Rating Management](#rating-management)
- [Debugging & Diagnostics](#debugging--diagnostics)
- [Validation](#validation)
- [Legacy / Deprecated](#legacy--deprecated)

---

## Database Setup & Seeding

### setupNewDatabase.ts

Initializes a clean database schema from scratch. Checks DB connection, pushes the Prisma schema, and generates the Prisma client.

```bash
npx tsx scripts/setupNewDatabase.ts
```

**Steps performed:**
1. Verify PostgreSQL connection
2. `prisma db push --skip-generate`
3. `prisma generate`

**When to use:** First-time setup of a new environment (local dev, staging, production).

---

### setupSupabaseFresh.ts

Creates a fresh Supabase-ready database baseline using the latest Prisma schema (without migrations), then seeds only required baseline data.

```bash
npm run setup-supabase-fresh
```

**What it does:**
1. Verifies `DATABASE_URL` connection
2. Runs `prisma db push --skip-generate`
3. Runs `prisma generate`
4. Seeds `point_exchange_rules` with USATT-style rules
5. Creates/updates Sys Admin member from env vars

**Result:** Schema is current, rating rules exist, Sys Admin exists, and the rest of operational data remains empty.

**Environment variables (optional):**
- `SYS_ADMIN_EMAIL` (default: `admin@pingpong.com`)
- `SYS_ADMIN_PASSWORD` (default: `Admin123!`)
- `SYS_ADMIN_FIRST_NAME` (default: `Sys`)
- `SYS_ADMIN_LAST_NAME` (default: `Admin`)

---

### ClearDB-RepopulateDB.ts

Wipes the entire database and repopulates it with realistic test data: 130 players (multi-language names, age/rating distributions), 150 standalone matches, and several tournaments (Round Robin, Playoff).

```bash
npx tsx scripts/ClearDB-RepopulateDB.ts
```

**What it creates:**
- 130 members with nationality distribution (55% English, 30% Chinese, 10% Russian, 5% Swedish)
- Age: 10–80 (normal distribution, peak at 45)
- Rating: 800–2200 (normal distribution, peak at 1400, correlated with age)
- 150 standalone matches with rating processing
- "Championship" tournament (top 6 players, completed)
- "Mid-Level Tournament" (rating 1200–1400, completed)
- "Playoff Championship" (8 players, completed)
- Resets all auto-increment sequences to 1

**⚠️ Destructive:** Deletes ALL existing data. Not for production use.

---

### seedPointExchangeRules.ts

Populates the `point_exchange_rules` table with USATT-style rating exchange brackets. Upserts rules so it's safe to run multiple times.

```bash
npx tsx scripts/seedPointExchangeRules.ts
```

**Rules:** 22 brackets from 0–12 rating difference (8/8 points) up to 513+ (0/100 points).

**When to use:** After initial DB setup, or if rules table is empty/corrupted.

---

## Tournament Generation

### generateTournament.ts ⭐

The primary tournament generation script. Creates or continues tournaments of any type with randomly selected players and simulated match results. Supports all tournament types: Round Robin, Playoff, Swiss, Preliminary+RR, Preliminary+Playoff.

📄 **Full documentation:** [GENERATE_TOURNAMENT.md](./GENERATE_TOURNAMENT.md)

```bash
# Create mode
npx tsx scripts/generateTournament.ts <type> <numPlayers> [options]

# Continue mode
npx tsx scripts/generateTournament.ts --continue <tournamentId> [options]

# Help
npx tsx scripts/generateTournament.ts --help
```

**Types:** `rr`, `playoff`, `swiss`, `prelim-rr`, `prelim-playoff`

**Key options:**
| Flag | Default | Description |
|------|---------|-------------|
| `--correlation <f>` | 0 | Rating-result correlation (-1 to 1) |
| `--complete <n>` | 100 | % of matches to simulate |
| `--rounds <n>` | auto | Swiss rounds (default: floor(log2(n))+2) |
| `--groups <n>` | 5 | Preliminary group count |
| `--auto <n>` | 0 | Auto-qualified players |
| `--final <n>` | auto | Final phase size |

**Output:** Always prints `TOURNAMENT_ID=<id>` as the last line for scripting.

**Examples:**
```bash
npx tsx scripts/generateTournament.ts rr 8
npx tsx scripts/generateTournament.ts swiss 12 --rounds 5 --complete 50
npx tsx scripts/generateTournament.ts --continue 231 --complete 40
npx tsx scripts/generateTournament.ts prelim-playoff 30 --groups 4 --final 8 --auto 2
```

---

### generateRandomRoundRobinTournament.ts

Older, simpler script that generates a single Round Robin tournament with random players and simulated matches.

```bash
npx tsx scripts/generateRandomRoundRobinTournament.ts <numPlayers> [minRating] [maxRating] [name]
```

**Examples:**
```bash
npx tsx scripts/generateRandomRoundRobinTournament.ts 5
npx tsx scripts/generateRandomRoundRobinTournament.ts 8 1200 1800
npx tsx scripts/generateRandomRoundRobinTournament.ts 6 1500 2000 "Mid-Level Championship"
```

**Note:** Superseded by `generateTournament.ts` which supports all tournament types.

---

### generateRatingBracketMatches.ts

Generates standalone (non-tournament) matches between players within a specified rating bracket. Useful for populating match history.

```bash
npx tsx scripts/generateRatingBracketMatches.ts <minRating> <maxRating> <numMatches>
```

**Example:**
```bash
npx tsx scripts/generateRatingBracketMatches.ts 1200 1600 20
```

---

## Tournament & Data Cleanup

### cleanRecentTournaments.ts ⭐

Safely removes tournaments and all related data (matches, bracket matches, participants, swiss data, preliminary configs, rating history). Recalculates affected player ratings afterward.

```bash
npx tsx scripts/cleanRecentTournaments.ts [selection] [--execute]
```

**Dry-run by default** — shows what would be deleted without touching the database.

**Selection modes (can be combined — union of results):**

| Flag | Description |
|------|-------------|
| `--ids <id1,id2,...>` | Delete specific tournaments by ID |
| `--days <n>` | Tournaments created in the last N days (default: 3) |
| `--from <date>` | Created on or after date (ISO or YYYY-MM-DD) |
| `--to <date>` | Created on or before date (ISO or YYYY-MM-DD) |

**Options:**
| Flag | Description |
|------|-------------|
| `--execute` | Actually perform the deletion |
| `--help` | Show usage |

**Examples:**
```bash
# Dry-run: see what would be deleted in last 3 days
npx tsx scripts/cleanRecentTournaments.ts

# Delete specific tournaments
npx tsx scripts/cleanRecentTournaments.ts --ids 151,156,163 --execute

# Delete by date range
npx tsx scripts/cleanRecentTournaments.ts --from 2026-02-10 --to 2026-02-14 --execute

# Combine: specific IDs + last 7 days
npx tsx scripts/cleanRecentTournaments.ts --ids 151 --days 7 --execute
```

**What it cleans (in order):**
1. Rating history entries (by tournament ID and match ID)
2. Root tournaments (cascade deletes: children, matches, bracket matches, participants, swiss data, prelim config)
3. Recalculates affected player ratings from remaining history

**Safety features:**
- Dry-run by default
- Shows full summary before executing
- Handles child tournament IDs (resolves to root parent)
- Preserves DB consistency

**Production-safe:** Yes, with `--ids` for targeted cleanup.

---

### deleteInactivePlayers.ts

Deletes members marked as `isActive: false` that have no tournament participations. Warns about players that cannot be deleted due to tournament history.

```bash
npx tsx scripts/deleteInactivePlayers.ts
```

**Safety:** Only deletes players with `isActive: false` AND no tournament participations. Rating history is cascade-deleted.

---

### deleteMember.ts

Deletes a specific member by name, along with all related records (tournament participations, matches, rating history).

```bash
npx tsx scripts/deleteMember.ts "First" "Last"
```

**Example:**
```bash
npx tsx scripts/deleteMember.ts "John" "Smith"
```

**Safety:** Checks for related records before deletion and reports what will be removed.

---

## User Management

### createSysAdmin.ts

Creates or updates the system administrator account. Uses environment variables for configuration, with sensible defaults.

```bash
npx tsx scripts/createSysAdmin.ts
```

**Environment variables:**
| Variable | Default |
|----------|---------|
| `SYS_ADMIN_EMAIL` | `admin@pingpong.com` |
| `SYS_ADMIN_PASSWORD` | `Admin123!` |
| `SYS_ADMIN_FIRST_NAME` | `System` |
| `SYS_ADMIN_LAST_NAME` | `Administrator` |

**Behavior:** If the email already exists, updates the member's roles to include ADMIN.

---

### createIlyaUser.ts

Creates a specific developer user account (Ilya Volvovski) with PLAYER, ORGANIZER, and ADMIN roles.

```bash
npx tsx scripts/createIlyaUser.ts
```

**Note:** Development convenience script. Not for production.

---

### generatePasswordHash.ts

Generates a bcrypt hash for a given password. Outputs the hash and a ready-to-use SQL UPDATE statement.

```bash
npx tsx scripts/generatePasswordHash.ts [password]
```

**Default password:** `Admin123!`

**Example:**
```bash
npx tsx scripts/generatePasswordHash.ts "MySecurePassword"
```

---

### generatePasswords.ts

Generates and prints bcrypt hashes for the two standard passwords used in the test database (`sobaka` for the dev user, `changeme` for all others).

```bash
npx tsx scripts/generatePasswords.ts
```

---

## Rating Management

### recalculateAllRatings.ts

Recalculates all player ratings from scratch by processing all completed tournaments chronologically using the USATT 4-pass algorithm.

```bash
npx tsx scripts/recalculateAllRatings.ts
```

**When to use:** After manual data corrections, or if ratings appear inconsistent.

**Note:** Uses the legacy `player` model — may need updating for current `member` schema.

---

### resetAndRecalculateRatings.ts

Resets all player ratings to their first tournament's `playerRatingAtTime` snapshot, then recalculates all ratings from scratch.

```bash
npx tsx scripts/resetAndRecalculateRatings.ts
```

**When to use:** When baseline ratings have drifted and you need a full reset to known-good starting points.

**Note:** Uses the legacy `player` model — may need updating for current `member` schema.

---

## Debugging & Diagnostics

### dumpAllTables.ts

Dumps all database tables to stdout in a human-readable format. Useful for inspecting database state.

```bash
npx tsx scripts/dumpAllTables.ts
npx tsx scripts/dumpAllTables.ts > dump.txt       # save to file
```

**Tables dumped:** Members, tournaments, tournament participants, matches, bracket matches, rating history, point exchange rules.

**Note:** Uses the legacy `player` model — output may be incomplete with current schema.

---

### dumpRankingHistory.ts

Dumps all rating history entries with player names, sorted by most recent first. Includes summary statistics.

```bash
npx tsx scripts/dumpRankingHistory.ts
npx tsx scripts/dumpRankingHistory.ts > history.txt
```

**Note:** Uses the legacy `rankingHistory` model name.

---

### debugPlayerRatings.ts

Traces all rating changes for a specific player across all tournaments. Useful for investigating rating discrepancies.

```bash
npx tsx scripts/debugPlayerRatings.ts "Player Name"
```

**Default:** Traces "Khanh Duong" if no name provided.

**Note:** Uses the legacy `player` model.

---

### debugRatingCalculation.ts

Inspects rating calculations for the 5 most recent completed Round Robin tournaments. Shows match results and expected vs actual rating changes.

```bash
npx tsx scripts/debugRatingCalculation.ts
```

**Note:** Uses the legacy `player` model.

---

## Validation

### validate-api-docs.ts

Validates that `API_DOCUMENTATION.md` is up-to-date with the codebase by extracting all route definitions from route files and checking they are documented.

```bash
npx tsx scripts/validate-api-docs.ts
```

**What it checks:** Scans `server/src/routes/*.ts` for `router.get/post/patch/put/delete` patterns and verifies each is mentioned in the API docs.

---

## Legacy / Deprecated

### migratePlayersToMembers.ts

One-time data migration script from the old `Player` model to the new `Member` model. Populates email, gender, password, and roles for existing records.

```bash
npx tsx scripts/migratePlayersToMembers.ts
```

**Status:** Migration complete. Kept for reference only.

---

## Quick Reference

| Script | Purpose | Destructive | Production-safe |
|--------|---------|:-----------:|:---------------:|
| `setupNewDatabase` | Initialize new DB | No | ✅ |
| `ClearDB-RepopulateDB` | Wipe & repopulate with test data | **Yes** | ❌ |
| `seedPointExchangeRules` | Seed rating rules (upsert) | No | ✅ |
| `generateTournament` | Create/continue tournaments | No | ⚠️ Test only |
| `generateRandomRoundRobinTournament` | Create RR tournament | No | ⚠️ Test only |
| `generateRatingBracketMatches` | Create standalone matches | No | ⚠️ Test only |
| `cleanRecentTournaments` | Remove tournaments safely | **Yes** | ✅ (with --ids) |
| `deleteInactivePlayers` | Remove inactive members | **Yes** | ✅ |
| `deleteMember` | Remove specific member | **Yes** | ✅ |
| `createSysAdmin` | Create/update admin | No | ✅ |
| `createIlyaUser` | Create dev user | No | ❌ |
| `generatePasswordHash` | Generate bcrypt hash | No | ✅ |
| `generatePasswords` | Print standard hashes | No | ❌ |
| `recalculateAllRatings` | Recalculate all ratings | **Yes** | ⚠️ Legacy |
| `resetAndRecalculateRatings` | Reset & recalculate ratings | **Yes** | ⚠️ Legacy |
| `dumpAllTables` | Dump DB to stdout | No | ⚠️ Legacy |
| `dumpRankingHistory` | Dump rating history | No | ⚠️ Legacy |
| `debugPlayerRatings` | Trace player ratings | No | ⚠️ Legacy |
| `debugRatingCalculation` | Debug rating math | No | ⚠️ Legacy |
| `validate-api-docs` | Check API docs coverage | No | ✅ |
| `migratePlayersToMembers` | One-time migration | **Yes** | ❌ Deprecated |

**Legend:** ✅ Safe for production · ⚠️ Use with caution · ❌ Not for production
