# Spin Master — Project Knowledge

## What this project is
Table tennis club operations: members, tournaments, matches, USATT-style ratings, club check-in and payments.

## Stack
- **Client:** React + TypeScript + Vite
- **Server:** Express + TypeScript
- **DB:** PostgreSQL + Prisma **migrations**
- **Realtime:** Socket.io
- **Auth:** JWT + session (role-based)

## Core domain
Member, Tournament (+ plugins), Match, BracketMatch, RatingHistory, PointExchangeRule, PreliminaryConfig / SwissTournamentData, club visits / entitlements / payments (`system_config` JSON columns).

## Tournament architecture
Plugin-based. Base layer must not import type-specific plugins. Generic match update: `PATCH /api/tournaments/:tournamentId/matches/:matchId`.

## Validation
`server/src/utils/memberValidation.ts`. Rating bounds also come from system config.

## Bootstrap
- **Migrate:** `npx prisma migrate deploy` (Neon/production; quote `DATABASE_URL`; direct host)
- **Local wipe:** `server/scripts/setupNewDatabase.ts` (`db push --force-reset`)
- **Factory reset:** `npm run setup-supabase-initial` (destructive; any Postgres)

## Debt
- `client/src/components/Players.tsx` is large
- Mixed inline styles on the client

## Pointers
See [README.md](./README.md) in this folder, or [user-facing docs](../README.md).
