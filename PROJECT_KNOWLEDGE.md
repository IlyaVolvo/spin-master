# Spin Master — Project Knowledge

## What this project is
Spin Master is a full-stack TypeScript app for table tennis club operations:
- Member management (players, organizers, admins, coaches)
- Tournament lifecycle (create, run, complete, cancel)
- Match recording and correction
- USATT-style rating updates + rating history
- CSV import/export for members

## Current stack
- **Client:** React + TypeScript + Vite
- **Server:** Express + TypeScript
- **DB:** PostgreSQL + Prisma
- **Realtime:** Socket.io
- **Auth:** JWT + session middleware (role-based access)

## Core domain model
- `Member` — profile, auth, roles, status, optional rating
- `Tournament` — type/status metadata, supports compound flows
- `TournamentParticipant` — participation + rating snapshot
- `Match` — actual scored results
- `BracketMatch` — playoff structure/progression
- `RatingHistory` — immutable rating audit log
- `PointExchangeRule` — rating exchange table (effective-dated)
- `PreliminaryConfig` / `SwissTournamentData` — type-specific configs

## Tournament architecture
Plugin-based on server and client:
- Central plugin registry
- Type-specific creation and match update logic in plugins
- Generic match update endpoint: `PATCH /api/tournaments/:tournamentId/matches/:matchId`
- Compound tournament orchestration handled in base compound plugin + specific plugins

Supported/implemented types include:
- `ROUND_ROBIN`
- `PLAYOFF`
- `PRELIMINARY_AND_PLAYOFF`
- `PRELIMINARY_WITH_FINAL_ROUND_ROBIN`
- `SWISS`
- `SINGLE_MATCH`

## Validation strategy (shared)
Validation lives in `server/src/utils/memberValidation.ts` and is reused by client where practical.

Important rules:
- **Birth date:** between Jan 1 of `(currentYear - 105)` and Jan 1 of `(currentYear - 5)`
- **Phone:** valid US format (10 digits, or 11 with leading `1`; formatted input allowed)
- **Rating input:** integer `0..9999` or empty
- **Suspicious rating:** outside `800..2100` requires confirmation

### Recent UX behavior updates
- Birth date out-of-range now shows inline red error; no silent replacement
- Suspicious rating confirmation uses in-app modal (not browser confirm)
- CSV import uses shared validation for email, birth date, phone, rating

## Data/bootstrap scripts (important)
Server scripts are in `server/scripts/`.

Key ones:
- `setupNewDatabase.ts` — db push + prisma generate
- `setupSupabaseFresh.ts` — fresh Supabase bootstrap:
  - push latest schema (no migrations)
  - seed `point_exchange_rules`
  - create/update Sys Admin member
- `createSysAdmin.ts` — create/update admin from env vars

NPM shortcut:
- `npm run setup-supabase-fresh` (run inside `server/`)

## Known technical debt
- `client/src/components/Players.tsx` is still large and multi-concern
- Mixed inline styles and local state complexity in client UI
- Prisma CLI/client version mismatch warning currently appears in build logs

## Development mental model
1. Prefer changing shared validation first, then consume it in UI/routes/importers
2. Prefer plugin extension points over route branching per tournament type
3. Keep rating changes auditable via `rating_history`
4. For fresh environments, use schema push + baseline seed scripts

## Pointers
- Setup: `SETUP.md`
- Architecture: `ARCHITECTURE.md`
- Database details: `DATABASE_SCHEMA.md`
- API docs maintenance: `API_MAINTENANCE.md`
- UI structure: `UI.md`
