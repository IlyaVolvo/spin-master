# Setting Up New spin-master Database

This guide explains how to set up a clean database for the refactored schema on the `master` branch.

## Database Naming

- **Backup branch**: Uses the original database name (preserved from previous state)
- **Master branch**: Uses new database name `spin-master`

This allows both databases to coexist and be accessible simultaneously.

## Prerequisites

1. PostgreSQL is running
2. You have PostgreSQL access to create databases
3. You're on the `master` branch

## Setup Steps

### Step 1: Create the New Database

Connect to PostgreSQL and create the new database:

```bash
psql -U your_username
```

Then run:

```sql
CREATE DATABASE "spin-master";
\q
```

Or from command line:

```bash
createdb -U your_username spin-master
```

### Step 2: Update Environment Variables

Copy `env.example` to `.env` in the `server/` directory (if not already done):

```bash
cd server
cp env.example .env
```

Update the `DATABASE_URL` in `server/.env` to use `spin-master`:

```env
DATABASE_URL="postgresql://username:password@localhost:5432/spin-master?schema=public"
```

**Important**: Make sure the database name is `spin-master`, not the old database name.

### Step 3: Push Schema to Database

Use Prisma's `db push` to create all tables from the schema (no migrations):

```bash
cd server
npx prisma db push
```

This will:
- Create all tables based on the current schema
- Create all indexes
- Set up all relationships

### Step 4: Generate Prisma Client

Generate the Prisma client to match the new schema:

```bash
npx prisma generate
```

### Step 5: Verify Database Setup

Verify that all tables were created:

```bash
npx prisma studio
```

Or check via psql:

```bash
psql -U your_username -d spin-master
```

```sql
\dt
```

You should see these tables:
- `members`
- `tournaments`
- `tournament_participants`
- `matches`
- `bracket_matches`
- `rating_history`
- `point_exchange_rules`

## Alternative: Automated Setup Script

For convenience, you can use the automated setup script:

```bash
cd server
tsx scripts/setupNewDatabase.ts
```

This script will:
1. Check database connection
2. Push schema to database
3. Generate Prisma client
4. Verify all tables were created

## Initial Data Setup

After the database is created, you may want to:

1. **Seed point exchange rules** (if needed):
   ```bash
   cd server
   tsx scripts/seedPointExchangeRules.ts
   ```

2. **Create system admin user**:
   ```bash
   npm run create-sys-admin
   ```

## Running Both Branches Simultaneously

You can run both the backup branch and master branch simultaneously:

1. **Backup branch** (ports 3300, 3301, 5561):
   - Uses original database name
   - `.env` points to original database

2. **Master branch** (ports 3000, 3001, 5555):
   - Uses `spin-master` database
   - `.env` points to `spin-master` database

Both can run at the same time without conflicts.

## Troubleshooting

### Database Already Exists

If the database already exists and you want to start fresh:

```sql
DROP DATABASE IF EXISTS "spin-master";
CREATE DATABASE "spin-master";
```

**Warning**: This will delete all data in the `spin-master` database.

### Connection Errors

- Verify PostgreSQL is running: `pg_isready`
- Check `DATABASE_URL` in `.env` matches your PostgreSQL setup
- Ensure the database name is exactly `spin-master` (case-sensitive)

### Schema Push Errors

- Make sure you're in the `server/` directory
- Verify Prisma schema file is correct: `npx prisma validate`
- Check for any existing tables that might conflict

## Next Steps

After the database is set up:
1. Start the server: `npm run dev` (from root or server directory)
2. Test the API endpoints
3. Begin step-by-step refactoring of application code to match the new schema
