# Supabase Initial DB Deployment

Use this procedure to initialize a brand-new Supabase database with the current schema and required baseline data.

## What gets deployed

- Latest Prisma schema (including `members.qrTokenHash`)
- `point_exchange_rules` in current form (22 USATT brackets)
- Exactly **one** member in `members`:
  - firstName: `Sys`
  - lastName: `Admin`
  - role: `ORGANIZER` only
  - default email: `sys-admin@fake.local`

## Command

From `server/`:

```bash
npm run setup-supabase-initial
```

## Required env

Set `DATABASE_URL` to your Supabase connection string, for example:

```env
DATABASE_URL="postgresql://postgres:<PASSWORD>@db.<project>.supabase.co:5432/postgres?sslmode=require"
```

Optional bootstrap overrides:

```env
SYS_ADMIN_EMAIL="sys-admin@fake.local"
SYS_ADMIN_PASSWORD="Admin123!"
SYS_ADMIN_FIRST_NAME="Sys"
SYS_ADMIN_LAST_NAME="Admin"
```

## Safety note

This setup is **destructive**:

- deletes existing members
- deletes tournaments/matches/rating history operational data
- reseeds point exchange rules

Run only against a fresh environment you intend to initialize.
