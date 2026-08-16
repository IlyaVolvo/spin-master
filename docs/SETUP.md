# Setup Guide

PostgreSQL + Prisma **migrations** (`prisma migrate deploy`). Do not use `db push` on a shared or production database.

## Prerequisites

- Node.js 18+
- npm
- PostgreSQL (local, [Neon](https://neon.tech), or any Postgres). Quote `DATABASE_URL` in zsh (`?` is special).

## Interactive role tutorials (optional)

Static walkthroughs live at `/role-tutorials/` (no auth). To re-record showcases:

1. Create a DB whose name includes `tutorial` (e.g. `createdb spin_master_tutorials`).
2. Set `DATABASE_URL_TUTORIAL` in `server/.env`.
3. `cd server && npm run tutorials:recapture-showcases`

See `docs/INTERACTIVE_ROLE_TUTORIALS_PLAN.md`.

## 1) Install

From project root:

```bash
npm run install:all
```

## 2) Server env

```bash
cp server/env.example server/.env
```

Minimum:

```env
DATABASE_URL="postgresql://..."
JWT_SECRET="replace-with-strong-secret"
PORT=3001
CLIENT_URL="http://localhost:3000"
```

Defaults match `server/env.example`: API `3001`, Vite `3000` (`VITE_DEV_SERVER_PORT`). To run beside another checkout, use `3003` / `3002` as commented in `env.example`.

**Jest:** separate DB, then `npm run prisma:migrate:test --prefix server`.

```env
DATABASE_URL_TEST="postgresql://user:password@localhost:5432/spin_master_test?schema=public"
```

Optional bootstrap admin for seed scripts: `SYS_ADMIN_EMAIL`, `SYS_ADMIN_PASSWORD`, `SYS_ADMIN_FIRST_NAME`, `SYS_ADMIN_LAST_NAME`.

**Payments install mode** (first API boot on a new DB only):

```env
PAYMENTS_INSTALL_MODE=test
```

Use `production` on a dedicated production DB before first start. After bootstrap the value is locked in `system_config`; see [PAYMENTS_TEST_TO_PRODUCTION.md](./PAYMENTS_TEST_TO_PRODUCTION.md).

## 3) Database

### Shared / production / Neon (apply migration history)

Direct connection string (no `-pooler` host):

```bash
cd server
DATABASE_URL='postgresql://…?sslmode=require' npx prisma migrate deploy
```

`migrate status` only means all folders in `prisma/migrations` are recorded. It does not prove column names match `schema.prisma`. After a `@map` or rename in the schema, add a migration (see `20260814170000_club_visits_checked_in_at`).

### Local empty DB (destructive)

`setupNewDatabase.ts` runs `prisma db push --force-reset` and seeds rules + sys admin. **Local throwaway only.**

```bash
npx tsx server/scripts/setupNewDatabase.ts
```

### Factory reset (destructive)

`npm run setup-supabase-initial` (script name is historical) wipes operational data and reseeds rules + one Organizer. Works against any Postgres `DATABASE_URL` (Neon, local, etc.). Do not run on a DB you care about.

## 4) Run

```bash
npm run dev
```

Or `npm run dev --prefix server` and `npm run dev --prefix client`.

- Client: `http://localhost:3000` (or `VITE_DEV_SERVER_PORT`)
- API: `http://localhost:3001` (or `PORT`)
- Health: `http://localhost:3001/api/health`

## 5) Deploy (Render + Neon)

Typical production-like setup:

1. Neon project; pooled `DATABASE_URL` for the app, **direct** URL for `migrate deploy`.
2. Render web service from this repo (`server` build/start as in the service settings).
3. Env: `DATABASE_URL`, `JWT_SECRET`, `CLIENT_URL` (SPA origin, no trailing slash), `PORT` as Render requires.
4. From a machine with the direct URL: `npx prisma migrate deploy` (this repo does not run migrate in `postbuild`).
5. Stripe: test vs live is [STRIPE_TEST_MODE_INTEGRATION.md](./STRIPE_TEST_MODE_INTEGRATION.md) and [PAYMENTS_TEST_TO_PRODUCTION.md](./PAYMENTS_TEST_TO_PRODUCTION.md).

The API already listens on `0.0.0.0` when `NODE_ENV=production`.

## 6) Troubleshooting

- Prisma / zsh: quote `DATABASE_URL`. Unquoted `?` or a typo (`ATABASE_URL`) falls through to `server/.env` (often localhost).
- Auth: `JWT_SECRET` set; re-login after changing it.
- Prisma client mismatch: align `prisma` and `@prisma/client` in `server/package.json`.

## 7) Commands

```bash
npm run prisma:generate --prefix server
npm run prisma:studio --prefix server
npm test --prefix server
```
