# Switch payments from test to production

**Related:**
- Install mode design: [`PER_MEMBER_PAYMENT_PROVIDERS.md`](./PER_MEMBER_PAYMENT_PROVIDERS.md) §2.1
- Stripe test runbook: [`STRIPE_TEST_MODE_INTEGRATION.md`](./STRIPE_TEST_MODE_INTEGRATION.md)

---

## What “mode” is

`system_config.payments.installMode` is either `test` or `production`.

| `installMode` | Online services Admin may assign |
|---------------|----------------------------------|
| `test` | `dummy`, `stripe-test` (`environment: 'testing'`) |
| `production` | `stripe` (`environment: 'production'`) |

Cash is desk-only. It is not assigned as the member’s online service and is not filtered by this flag.

This is **not** `NODE_ENV`. Stripe **test keys** (`sk_test_…`) and **live keys** (`sk_live_…`) are separate from install mode. Both must match:

- `test` + `sk_test_…` + webhook secret → `stripe-test` is selectable
- `production` + `sk_live_…` + `STRIPE_ALLOW_LIVE=1` + webhook secret → `stripe` is selectable

---

## Preferred: set production at first boot

There is **no Admin or API switch**. After the first config write, saves ignore `installMode`.

On a **new** database, before the API process first starts:

1. Set on the API service:

   ```text
   PAYMENTS_INSTALL_MODE=production
   ```

   Aliases: `PAYMENTS_MODE`. Values: `production` / `prod` / `live`.  
   CLI equivalent: `--payments-install-mode=production`

2. Set live Stripe env (see §3) and start the API once.

If `PAYMENTS_INSTALL_MODE` is unset, bootstrap **defaults to `test`**.

Do this on the production database. Do **not** flip a staging DB to production so you can “try live keys.” Use a separate Neon database.

---

## After install is already `test`

Use this only when that database must take real payments and was bootstrapped as `test`. This is a one-off ops change, not a product feature.

### 1. Confirm current mode

```sql
SELECT payments->>'installMode' AS install_mode
FROM system_config
WHERE id = 'system';
```

If this already returns `production`, skip §2.

### 2. Write production into the DB

Same Neon project as the API `DATABASE_URL` (direct host is fine for this SQL):

```sql
UPDATE system_config
SET payments = jsonb_set(payments, '{installMode}', '"production"'),
    "updatedAt" = NOW()
WHERE id = 'system';
```

Check again with the SELECT above.

The running API **caches** config in memory. The new value is not used until restart (§4).

### 3. Render (API service) environment

| Variable | Production value |
|----------|------------------|
| `STRIPE_SECRET_KEY` | `sk_live_…` (Dashboard **Live** mode) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from the **live** Dashboard endpoint in §3a |
| `STRIPE_ALLOW_LIVE` | `1` (required; live keys are refused without it) |
| `CLIENT_URL` | Public SPA origin members use (no trailing slash) |
| `PAYMENTS_INSTALL_MODE` | `production` (does **not** update an existing DB row; keep it aligned for any future empty DB) |

Remove or replace `sk_test_…` on this service. Do not leave test and live secrets mixed.

`STRIPE_PUBLISHABLE_KEY` is optional for Checkout Session.

SMTP must still work for emailed pay links.

#### 3a. Stripe Dashboard (Live mode)

1. Toggle **Live** (not Test).
2. Developers → Webhooks → Add endpoint.
3. URL:

   ```text
   https://<api-host>/api/payments/webhook/stripe
   ```

   API hostname, not the SPA if they differ. Path is `stripe`, not `stripe-test`.
4. Events: `checkout.session.completed`, `checkout.session.expired`.
5. Reveal signing secret → Render `STRIPE_WEBHOOK_SECRET`.

The test endpoint (`…/webhook/stripe-test`) can stay for a **staging** API. Do not point live events at the test path.

### 4. Restart the API

Redeploy or restart the Render web service so it:

- reloads `installMode` from the database
- picks up live keys

Until restart, Admin still behaves as `test`.

### 5. Re-assign members

Anyone with `paymentProviderId` = `stripe-test` or `dummy` will fail online checkout in production mode (environment mismatch).

Admin → member Plan screen → assign **Stripe** (`stripe`). Members still need email and online-pay consent.

Find leftovers:

```sql
SELECT id, "firstName", "lastName", "paymentProviderId"
FROM members
WHERE "paymentProviderId" IS NOT NULL
  AND "paymentProviderId" <> 'stripe';
```

### 6. Smoke check

- Payments UI shows install mode **Production** (read-only).
- Member assignment lists **Stripe**, not Stripe (test) / dummy.
- One small live Checkout (or Stripe test in live only if you accept a real charge).
- Webhook `checkout.session.completed` returns 200; payment becomes SUCCEEDED.

---

## What will not work

| Action | Result |
|--------|--------|
| Change `PAYMENTS_INSTALL_MODE` on an already-bootstrapped DB | Ignored; row already has `test` or `production` |
| Save Payments settings with a new mode | API keeps the locked value |
| Live keys while `installMode` is still `test` | Live provider `stripe` is not assignable |
| `sk_live_…` without `STRIPE_ALLOW_LIVE=1` | `isUsable()` is false |
| Keep members on `stripe-test` after the switch | Checkout: service does not match install mode |

---

## Switching back to test

Same pattern in reverse (not recommended on a DB that already took live payments):

```sql
UPDATE system_config
SET payments = jsonb_set(payments, '{installMode}', '"test"'),
    "updatedAt" = NOW()
WHERE id = 'system';
```

Then `sk_test_…`, unset `STRIPE_ALLOW_LIVE`, webhook `…/webhook/stripe-test`, restart, re-assign `stripe-test`. Prefer a separate staging database instead.
