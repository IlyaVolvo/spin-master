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
- **Database:** PostgreSQL (Supabase-compatible)
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
```

### 3. Initialize DB

#### Standard local setup
```bash
npx tsx server/scripts/setupNewDatabase.ts
```

#### Fresh Supabase baseline (schema + required seed only)
```bash
cd server
npm run setup-supabase-fresh
```

This creates:
- latest Prisma schema (no migrations required)
- `point_exchange_rules`
- Sys Admin member

### 4. Start app
```bash
npm run dev
```

Default URLs:
- Client: `http://localhost:5173`
- API: `http://localhost:3001`

## Project structure
```
client/   React app
server/   Express API + Prisma + scripts
```

## Key docs
- Setup details: `SETUP.md`
- Architecture: `ARCHITECTURE.md`
- Database schema: `DATABASE_SCHEMA.md`
- UI behavior: `UI.md`
- API maintenance: `API_MAINTENANCE.md`

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

# Server tests
npm test --prefix server
```

## Deploy notes
- Use managed Postgres (Supabase works well).
- Ensure `DATABASE_URL` includes SSL mode for Supabase.
- Set strong production `JWT_SECRET`.

