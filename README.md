# Spin Master

Table tennis club/tournament management platform with member management, tournament workflows, match recording, and rating history.

## Highlights
- Plugin-based tournament architecture (server + client)
- Generic match update endpoint for all tournament types
- Shared validation rules (email, birth date, US phone, rating)
- In-app suspicious rating confirmation flow
- CSV import/export with row-level validation errors

## Tech stack
- **Client:** React, TypeScript, Vite
- **Server:** Express, TypeScript, Prisma
- **Database:** PostgreSQL (Neon or local; Prisma migrate)
- **Realtime:** Socket.io

## Quick start

### 1. Install dependencies
```bash
npm run install:all
```

### 2. Configure environment
```bash
cp server/env.example server/.env
```

Minimum server env values:
```env
DATABASE_URL="postgresql://..."
JWT_SECRET="replace-me"
PORT=3001
CLIENT_URL="http://localhost:3000"
```

### 3. Initialize DB

On a new or cloud DB, apply migrations (quote the URL):

```bash
cd server
DATABASE_URL='postgresql://…' npx prisma migrate deploy
```

Destructive local reset (db push, throwaway only): `npx tsx server/scripts/setupNewDatabase.ts`

### 4. Start app
```bash
npm run dev
```

Default URLs (`server/env.example`):
- Client: `http://localhost:3000`
- API: `http://localhost:3001`

## Project structure
```
client/   React app
server/   Express API + Prisma + scripts
```

## Key docs
- Index: `docs/README.md`
- Setup: `docs/SETUP.md`

## Important behavior notes

### Member validation
- Birth date must be within configured bounds.
- Phone must be valid US format if provided.
- Rating must be integer `0..9999` or empty.

### Suspicious rating confirmation
Ratings outside `800..2100` prompt a custom confirmation modal.
- Confirm = keep value
- Cancel = revert to previously confirmed value

## Useful commands
```bash
# Server build (Prisma client generation)
npm run build --prefix server

# Client production build
npm run build --prefix client

# Server tests (requires DATABASE_URL_TEST in server/.env — separate DB from dev; see docs/SETUP.md)
npm test --prefix server
```

## Deploy notes
- Managed Postgres (Neon works well). Use the **direct** host for `prisma migrate deploy`, pooled for the app.
- Include `sslmode=require` on Neon/cloud URLs.
- Set a strong production `JWT_SECRET`.
- Payments: `PAYMENTS_INSTALL_MODE` on **first** boot; see `docs/PAYMENTS_TEST_TO_PRODUCTION.md`.

