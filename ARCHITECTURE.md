# System Architecture

## Overview
Spin Master is a full-stack TypeScript system for member management, tournament operations, match recording, and rating history.

The architecture emphasizes:
- Plugin-based tournament behavior
- Shared validation rules between server/client utilities
- Immutable rating history for auditability
- Real-time refresh via Socket.io

## Stack

### Client
- React + TypeScript
- Vite
- React Router
- Axios
- Recharts, React DatePicker

### Server
- Express + TypeScript
- Prisma ORM
- PostgreSQL
- JWT/session auth middleware
- Socket.io

## High-level layers

```
Client (React)
  ├─ Players / Tournaments / History / Statistics pages
  ├─ Tournament creation plugin flows (client-side plugin rendering)
  └─ REST + websocket consumers

Server (Express)
  ├─ Routes (auth, players, tournaments)
  ├─ Tournament plugin registry + per-type plugins
  ├─ Services (rating, caches, event propagation)
  └─ Shared validation utilities

Database (PostgreSQL via Prisma)
  ├─ members
  ├─ tournaments + child tournament hierarchy
  ├─ matches / bracket_matches / tournament_participants
  ├─ rating_history
  └─ point_exchange_rules + type-specific config tables
```

## Tournament plugin architecture

Tournament behavior is delegated to plugins rather than hardcoded route branches.

Key outcomes:
- New tournament types can be added with focused plugin logic.
- Match update handling is centralized in one generic endpoint.
- Compound tournaments are modeled as parent/child tournament trees.

### Generic match endpoint
`PATCH /api/tournaments/:tournamentId/matches/:matchId`

This endpoint normalizes and validates input, then delegates type-specific behavior to plugin `updateMatch` logic.

## Core domain entities

- **Member**: identity, auth, roles, active status, optional rating.
- **Tournament**: type, status, cancellation, parent-child hierarchy.
- **TournamentParticipant**: participant link + rating snapshot.
- **Match**: score/forfeit outcomes (with optional tournament relation).
- **BracketMatch**: playoff structure/progression links.
- **RatingHistory**: immutable rating change records.
- **PointExchangeRule**: effective-dated rating exchange table.
- **PreliminaryConfig / SwissTournamentData**: type-specific config.

## Data and consistency rules

### Shared validation
Validation source of truth is `server/src/utils/memberValidation.ts`.

Used for:
- email format
- birth date bounds
- US phone number format
- rating input validity
- suspicious rating detection

This logic is reused in server routes and client import/UI flows to keep behavior consistent.

### Rating integrity
- Rating changes are persisted to `rating_history`.
- Point exchange rules are stored in `point_exchange_rules`.
- Corrective flows keep historical trail instead of rewriting history.

## Auth and authorization model

- Auth is token/session based depending on route/middleware.
- Roles: `PLAYER`, `COACH`, `ORGANIZER`, `ADMIN`.
- Route and operation permissions are role-gated.

## Real-time model

Socket.io broadcasts tournament and match changes so clients can refresh state without full reload loops.

## Deployment model

- Client static hosting (Vite build artifacts)
- Server Node process (Express)
- Managed PostgreSQL (Supabase or equivalent)

### Fresh Supabase bootstrap path
For brand-new environments:
1. Push latest Prisma schema with `db push` (no migrations required)
2. Seed rating rules table
3. Create/update Sys Admin account

Implemented via `server/scripts/setupSupabaseFresh.ts` and `npm run setup-supabase-fresh`.

## Known constraints / debt

- `Players.tsx` remains a large, high-responsibility component.
- Styling/state logic is mixed in places on the client.
- Prisma package version mismatch warning currently appears during build.