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
npm run setup-supabase-initial
```

**What it does:**
1. Verifies `DATABASE_URL` connection
2. Runs `prisma db push --skip-generate`
3. Runs `prisma generate`
4. Clears operational data and existing members (fresh baseline)
5. Seeds `point_exchange_rules` with USATT-style rules
6. Creates a single Sys Admin member with `ORGANIZER` role only

**Result:** Schema is current, rating rules exist, and the database contains exactly one member (Sys Admin organizer) plus the rating rule table.

**Environment variables (optional):**
- `SYS_ADMIN_EMAIL` (default: `sys-admin@fake.local`)
- `SYS_ADMIN_PASSWORD` (default: `Admin123!`)
- `SYS_ADMIN_FIRST_NAME` (default: `Sys`)
- `SYS_ADMIN_LAST_NAME` (default: `Admin`)

**⚠️ Destructive:** Deletes existing members and operational tournament/match/rating-history data.

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

## Debugging & Diagnostics

## Validation

### validate-api-docs.ts

Validates that `API_DOCUMENTATION.md` is up-to-date with the codebase by extracting all route definitions from route files and checking they are documented.

```bash
npx tsx scripts/validate-api-docs.ts
```

**What it checks:** Scans `server/src/routes/*.ts` for `router.get/post/patch/put/delete` patterns and verifies each is mentioned in the API docs.

---

## Legacy / Deprecated

Legacy scripts have been removed from this repository. See `OBSOLETE_SCRIPTS_AUDIT.md` for the historical removal list.

---

## Quick Reference

| Script | Purpose | Destructive | Production-safe |
|--------|---------|:-----------:|:---------------:|
| `setupNewDatabase` | Initialize new DB | No | ✅ |
| `ClearDB-RepopulateDB` | Wipe & repopulate with test data | **Yes** | ❌ |
| `seedPointExchangeRules` | Seed rating rules (upsert) | No | ✅ |
| `generateTournament` | Create/continue tournaments | No | ⚠️ Test only |
| `cleanRecentTournaments` | Remove tournaments safely | **Yes** | ✅ (with --ids) |
| `deleteMember` | Remove specific member | **Yes** | ✅ |
| `createSysAdmin` | Create/update admin | No | ✅ |
| `generatePasswordHash` | Generate bcrypt hash | No | ✅ |
| `generatePasswords` | Print standard hashes | No | ❌ |
| `validate-api-docs` | Check API docs coverage | No | ✅ |

**Legend:** ✅ Safe for production · ⚠️ Use with caution · ❌ Not for production
