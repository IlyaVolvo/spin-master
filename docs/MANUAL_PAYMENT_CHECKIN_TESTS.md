# Manual test plan: payments, plans, check-in/out

This document defines **manual** tests for payment plans, check-in/checkout, payments, payment history, and payment notifications against the **local check-in DB** (`pingpong_checkin` via `server/.env` `DATABASE_URL`).

Unit tests cover the same decision paths under `server/tests/unit/payments/`. Use this doc for end-to-end UI/API confirmation and for **DB shortcuts** when waiting for real check-ins or calendar time is impractical.

---

## Environment

| Item | Value |
|------|--------|
| DB | `pingpong_checkin` (local) |
| API | typically `http://localhost:3003` |
| Client | typically `http://localhost:3002` |
| Club date | `CLUB_TIMEZONE` (default UTC) — visit `clubDate` is `YYYY-MM-DD` in that zone |
| Cron auth | If `CLUB_CRON_SECRET` is set, send header `x-club-cron-secret: <secret>` |

Useful SQL shell:

```bash
cd server && npx prisma db execute --schema prisma/schema.prisma --stdin
```

Or connect with any Postgres client to `DATABASE_URL`.

---

## Safety

- Prefer a **dedicated test member** (not your only admin). Example IDs from this env: `2` (Ilya), `3` (Uma) — confirm before updating.
- Snapshot or note original rows before edits; restore when done.
- Do **not** run destructive SQL against production.

---

## Key tables / columns

| Table | Columns that matter |
|-------|---------------------|
| `members` | `segment`, `purchaseCreditCents`, `autoRenewEnabled`, `autoRenewFamilyKey`, `trialEndsOn`, `trialExpiryNotifiedAt`, `onlinePayConsent`, `courtesySuspended`, `email`, `scorePin`, `isActive` |
| `club_plans` | `familyKey`, `kind` (`TIME`/`VISIT`), `segment`, `priceCents`, `durationUnit`/`durationValue`, `visitCount`, `isActive` |
| `club_entitlements` | `type`, `status` (`CURRENT`/`FUTURE`/`ENDED`), `validFrom`/`validTo`, `visitsRemaining`/`visitsTotal`, `amountPaidCents`, `familyKey`, `active`, `planId` |
| `club_visits` | `clubDate`, `checkInAt`/`checkOutAt`, `dailyPaymentApplied`, `isCourtesy`, `courtesyClearedAt`, `obligationPaymentId` |
| `club_payments` | `amountCents`, `listAmountCents`, `creditAppliedCents`, `provider`, `externalRef`, `status`, `purpose`, `metadata`, `recordedAt` |
| `system_config` | JSON `payments` (courtesy + reminders), `clubPlans.segments` |

---

## DB recipes (shortcuts)

Use these instead of grinding through many check-ins or waiting for dates.

### Set visit pack remaining (skip N check-ins)

```sql
-- Find CURRENT visit pack for member
SELECT id, "visitsRemaining", "visitsTotal", status, active
FROM club_entitlements
WHERE "memberId" = :MEMBER_ID AND status = 'CURRENT' AND type = 'VISIT_PACK';

-- Leave exactly 1 visit (next check-in exhausts pack)
UPDATE club_entitlements
SET "visitsRemaining" = 1, active = true, status = 'CURRENT'
WHERE id = :ENTITLEMENT_ID;

-- Exhaust pack without more check-ins
UPDATE club_entitlements
SET "visitsRemaining" = 0, status = 'ENDED', active = false
WHERE id = :ENTITLEMENT_ID;
```

### Expire a TIME plan immediately

```sql
UPDATE club_entitlements
SET "validTo" = NOW() - INTERVAL '1 hour',
    status = 'ENDED',
    active = false
WHERE id = :ENTITLEMENT_ID;
-- Or leave CURRENT until midnight/refresh:
UPDATE club_entitlements
SET "validTo" = NOW() - INTERVAL '1 hour'
WHERE id = :ENTITLEMENT_ID AND status = 'CURRENT';
```

`refreshCurrentEntitlement` ends CURRENT when `validTo <= now` on next check-in/plan load.

### Near-expiry banner (TIME)

```sql
-- Expires in 2 days (set Payments reminders.periodDaysBeforeExpiry >= 2)
UPDATE club_entitlements
SET "validTo" = NOW() + INTERVAL '2 days'
WHERE id = :ENTITLEMENT_ID AND status = 'CURRENT';
```

### Near-expiry banner (VISIT)

```sql
UPDATE club_entitlements
SET "visitsRemaining" = 1
WHERE id = :ENTITLEMENT_ID AND type = 'VISIT_PACK' AND status = 'CURRENT';
-- Ensure Payments → reminders.visitPackVisitsRemaining >= 1 and check-in banner enabled
```

### Trial window

```sql
-- Inclusive last free day = today (UTC noon storage)
UPDATE members
SET "trialEndsOn" = (CURRENT_DATE + TIME '12:00') AT TIME ZONE 'UTC',
    "trialExpiryNotifiedAt" = NULL
WHERE id = :MEMBER_ID;

-- Trial already ended (for midnight email / no free trial check-in)
UPDATE members
SET "trialEndsOn" = ((CURRENT_DATE - 1) + TIME '12:00') AT TIME ZONE 'UTC',
    "trialExpiryNotifiedAt" = NULL
WHERE id = :MEMBER_ID;

-- Clear trial
UPDATE members SET "trialEndsOn" = NULL, "trialExpiryNotifiedAt" = NULL WHERE id = :MEMBER_ID;
```

### Credit for checkout

```sql
UPDATE members SET "purchaseCreditCents" = 2500 WHERE id = :MEMBER_ID;  -- $25.00
```

### Courtesy conditions

```sql
-- After pack/period ended, allow grace: ensure a prior entitlement exists (ENDED ok)
-- Suspend courtesy:
UPDATE members SET "courtesySuspended" = true WHERE id = :MEMBER_ID;
UPDATE members SET "courtesySuspended" = false WHERE id = :MEMBER_ID;

-- Clear uncleared courtesy visits so grace counters reset:
UPDATE club_visits
SET "courtesyClearedAt" = NOW()
WHERE "memberId" = :MEMBER_ID AND "isCourtesy" = true AND "courtesyClearedAt" IS NULL;
```

### FUTURE plan already queued (blocks purchase)

```sql
-- Insert only if no FUTURE exists; adjust planId/familyKey from club_plans
INSERT INTO club_entitlements (
  "memberId", type, status, label, "validFrom", "validTo",
  "visitsRemaining", "visitsTotal", "amountPaidCents", "familyKey",
  active, "planId", "planSegment", "createdAt", "updatedAt"
) VALUES (
  :MEMBER_ID, 'MONTHLY', 'FUTURE', 'Test future',
  NOW() + INTERVAL '7 days', NOW() + INTERVAL '37 days',
  NULL, NULL, 5500, 'monthly',
  true, :PLAN_ID, 'Regular', NOW(), NOW()
);
```

### Force cash PENDING (if needed without UI)

Prefer UI checkout. If planting:

```sql
-- Prefer creating via UI; columns must match app expectations
-- status PENDING, provider cash, externalRef cash_..., list/credit/amount set
```

### Clear same-day visit history (re-test first-of-day debit)

```sql
DELETE FROM club_visits WHERE "memberId" = :MEMBER_ID AND "clubDate" = CURRENT_DATE::text;
-- Also delete today's $0 covered-visit ledger if present:
DELETE FROM club_payments
WHERE "memberId" = :MEMBER_ID
  AND purpose LIKE 'Covered visit%'
  AND "recordedAt"::date = CURRENT_DATE;
DELETE FROM club_payments
WHERE "memberId" = :MEMBER_ID
  AND purpose LIKE 'Visit pack debit%'
  AND "recordedAt"::date = CURRENT_DATE;
```

### Auto-renew midnight eligibility

Needs: `autoRenewEnabled`, `autoRenewFamilyKey`, email, `onlinePayConsent`, no CURRENT/FUTURE, last ENDED entitlement’s `validTo` (or `updatedAt` for packs) on **previous club day**.

```sql
UPDATE members SET
  "autoRenewEnabled" = true,
  "autoRenewFamilyKey" = 'monthly',
  "onlinePayConsent" = true
WHERE id = :MEMBER_ID;

UPDATE club_entitlements SET status = 'ENDED', active = false
WHERE "memberId" = :MEMBER_ID AND status IN ('CURRENT','FUTURE');

UPDATE club_entitlements
SET status = 'ENDED', active = false,
    "validTo" = (CURRENT_DATE - 1 + TIME '12:00') AT TIME ZONE 'UTC'
WHERE id = :ENDED_ENTITLEMENT_ID;
```

Then: `POST /api/club/cron/midnight` with body `{ "clubDate": "<today YYYY-MM-DD>" }`.

---

## Manual test matrix

Mark each: Pass / Fail / Skip. Prefer **UI** unless the DB recipe is listed.

### A. Payment plans & segments

| ID | Steps | Expected | DB shortcut |
|----|-------|----------|-------------|
| A1 | `/payments` → Plans: add TIME plan (e.g. 1 DAY) per segment | Plan appears; inactive soft-delete works | — |
| A2 | Add VISIT plan (visitCount 2) | Charge = price × visits | — |
| A3 | Edit member Segment (admin only); non-admin sees read-only | Segment drives price variant | `UPDATE members SET segment=…` |
| A4 | Change segments list under Plans | Regular always required | system_config `clubPlans` |

### B. Checkout, credit, cash queue, history

| ID | Steps | Expected | DB shortcut |
|----|-------|----------|-------------|
| B1 | Member `$` → buy TIME cash | PENDING cash; Cash Queue shows Amount / Credit / Cash / Effective date | Credit: set `purchaseCreditCents` |
| B2 | Admin Clear cash | SUCCEEDED; CURRENT entitlement; credit deducted; history shows list/credit/cash | — |
| B3 | Buy cash then Reject | CANCELLED; no entitlement; credit **not** deducted | — |
| B4 | Buy online (consent + email; dummy provider) | Confirms after delay; history + receipt email if mail configured | — |
| B5 | Buy while CURRENT (no auto-renew) | FUTURE queued; purchase blocked until FUTURE gone | Insert FUTURE entitlement |
| B6 | Enable auto-renew | Blocks further purchase; needs email+consent | — |
| B7 | Kiosk session: attempt checkout | 403 | — |
| B8 | During trial: buy plan | FUTURE starting day after `trialEndsOn`; purpose notes trial | Set `trialEndsOn` |
| B9 | Full credit ≥ list price | Cash paid $0.00; clear still grants plan | `purchaseCreditCents` ≥ list |
| B10 | Plan screen payment history | All statuses; list/credit/cash visible | — |
| B11 | Admin reimburse FUTURE | FUTURE ended; credit increased | — |

### C. Check-in / check-out

| ID | Steps | Expected | DB shortcut |
|----|-------|----------|-------------|
| C1 | Kiosk PIN check-in with CURRENT TIME | Check-in; $0 “Covered visit” payment | — |
| C2 | Check-out then check-in same day | Second check-in **free** (no extra debit) | — |
| C3 | VISIT pack check-in | `visitsRemaining` −1 | Set remaining to 2 before test |
| C4 | Last visit of pack | Pack ENDED; next day/first visit → courtesy or payment | Set `visitsRemaining=1` then check in |
| C5 | No plan, not trial, courtesy allowed | Courtesy visit + obligation PENDING | End entitlement; grace > 0 |
| C6 | Courtesy exhausted / suspended | PAYMENT_REQUIRED | Suspend member or grace=0 |
| C7 | Trial active, no plan | Free check-in; trial warning | Set `trialEndsOn` ≥ today |
| C8 | Trial ended, no plan | Courtesy or PAYMENT_REQUIRED | `trialEndsOn` yesterday |
| C9 | Near-expiry TIME | Banner “expires in N day(s)” | `validTo` within threshold |
| C10 | Low visit pack | Banner “Only N visit(s) remaining” | `visitsRemaining` ≤ threshold |
| C11 | Banner disabled in Payments settings | No banner | — |
| C12 | PPV member without today’s per-visit payment | PAYMENT_REQUIRED | Entitlement type `PAY_PER_VISIT_EXTERNAL` |
| C13 | Auto-checkout cron | After club-local midnight, cron closes open visits with `clubDate < today`, stamping `checkOutAt` at each day’s configured close (`closedBy: AUTO`). See `docs/CLUB_HOURS_AND_AUTO_CHECKOUT.md` | Open visits from prior club days closed at close wall-clock |

### D. Notifications

| ID | Steps | Expected | DB shortcut |
|----|-------|----------|-------------|
| D1 | Clear cash / succeed online with email | Receipt: list, credit, charged | — |
| D2 | Courtesy check-in with admin notify on | Admin email if configured | — |
| D3 | `POST /cron/payment-reminders` with near-expiry CURRENT | Member reminder email | Near-expiry entitlement + email |
| D4 | `POST /cron/midnight` after trial end | Trial-ended email once; `trialExpiryNotifiedAt` set | Trial ended yesterday; notified null |
| D5 | Midnight promote FUTURE | FUTURE → CURRENT when eligible | FUTURE `validFrom` ≤ now; no CURRENT |
| D6 | Midnight auto-renew | Online checkout started when eligible | See auto-renew recipe |

### E. Admin ops

| ID | Steps | Expected | DB shortcut |
|----|-------|----------|-------------|
| E1 | Payments member search by name/ID → Open | Plan screen | — |
| E2 | Set credit on plan screen | Balance updates | Or SQL credit |
| E3 | Courtesy Visits admin Suspend | Blocks courtesy | — |
| E4 | Payments settings save (provider, grace, reminders) | Persists without wiping system settings | — |

---

## Suggested order (efficient)

1. Create short plans (1-day TIME, 2-visit pack) — A1/A2  
2. Pick test member; set segment/credit/trial as needed — SQL or Players edit  
3. Cash purchase + Clear + history — B1/B2/B10  
4. Visit pack with DB remaining shortcuts — C3/C4  
5. Expire TIME via SQL → courtesy — C5/C6  
6. Trial — C7/C8/B8/D4  
7. Reminder banners + cron — C9/C10/D3  
8. Midnight promote / auto-renew — D5/D6  

---

## Unit test mapping

| Manual area | Unit tests |
|-------------|------------|
| Purchase rules | `planPurchaseRules.test.ts` |
| Checkout / credit / trial FUTURE / cash | `runCheckout.test.ts` |
| Confirm / reject / credit columns / packs | `confirmPayment.test.ts` |
| Cash provider | `CashPaymentProvider.test.ts` |
| Plan pricing / segments | `resolvePlan.test.ts` |
| Courtesy evaluation | `evaluateCourtesy.test.ts` |
| Trial helpers / notify | `memberTrial.test.ts` |
| Entitlement refresh / reimburse | `entitlementQueue.test.ts` |
| Receipt amounts | `paymentReceiptEmail.test.ts` |
| Online provider selection | `getActivePaymentProvider.test.ts` |
| Check-in first-of-day debit / trial / courtesy / PPV | `checkInAccess.test.ts` |
| Check-in expiry banners | `checkInReminders.test.ts` |
| Midnight end/promote/auto-renew/trial | `midnightJobs.test.ts` |
| Reminder emails | `reminderCron.test.ts` |

Run:

```bash
cd server && npx jest --runInBand --testPathPatterns=tests/unit/payments
```

---

## Cron cheat sheet

```http
POST /api/club/cron/midnight
Content-Type: application/json
x-club-cron-secret: <optional>

{ "clubDate": "2026-07-30" }
```

```http
POST /api/club/cron/payment-reminders
POST /api/club/cron/reconcile-payments
POST /api/club/cron/auto-checkout
```

**Auto-checkout:** closes open visits with `clubDate` strictly before today’s club-local date; stamps `checkOutAt` at each day’s configured club close (`closedBy: AUTO`). Body may include `{ "clubDate": "YYYY-MM-DD" }` for a single-day run. See `docs/CLUB_HOURS_AND_AUTO_CHECKOUT.md`. Admin bulk close: `POST /api/club/admin/close-club` with optional `{ "checkOutAt": "<ISO>" }`.
