# Setup Guide

## Prerequisites
- Node.js 18+
- npm
- PostgreSQL-compatible database (local Postgres or Supabase)

## 1) Install dependencies

From project root:

```bash
npm run install:all
```

## 2) Configure server environment

```bash
cp server/env.example server/.env
```

Update `server/.env` at minimum:

```env
DATABASE_URL="postgresql://..."
JWT_SECRET="replace-with-strong-secret"
PORT=3001
```

Optional (for bootstrap admin script):

```env
SYS_ADMIN_EMAIL="admin@pingpong.com"
SYS_ADMIN_PASSWORD="Admin123!"
SYS_ADMIN_FIRST_NAME="Sys"
SYS_ADMIN_LAST_NAME="Admin"
```

## 3) Initialize database

You have two setup modes.

### A) Standard local setup (schema push)

```bash
npx tsx server/scripts/setupNewDatabase.ts
```

### B) Fresh Supabase setup (brand-new DB baseline)

This creates latest schema + required baseline data only:
- point exchange rules
- Sys Admin member

```bash
cd server
npm run setup-supabase-fresh
```

For Supabase connection strings, include SSL mode, e.g.:

```env
DATABASE_URL="postgresql://postgres:<PASSWORD>@db.<project>.supabase.co:5432/postgres?sslmode=require"
```

## 4) Run the app

### Option A: from root (recommended)
```bash
npm run dev
```

### Option B: run services separately

Terminal 1:
```bash
npm run dev --prefix server
```

Terminal 2:
```bash
npm run dev --prefix client
```

## 5) URLs
- Client: `http://localhost:5173`
- API: `http://localhost:3001`
- Health: `http://localhost:3001/api/health`

## 6) Common troubleshooting

### Prisma can’t connect
- Verify `DATABASE_URL`
- Ensure DB is reachable from your machine
- For Supabase, ensure `sslmode=require`

### Auth issues
- Ensure `JWT_SECRET` is set
- Re-login after changing auth settings

### Build warning: prisma/client version mismatch
- Align `prisma` and `@prisma/client` versions in `server/package.json`

## 7) Useful commands

```bash
# Generate Prisma client
npm run prisma:generate --prefix server

# Open Prisma Studio
npm run prisma:studio --prefix server

# Run server tests
npm test --prefix server
```


