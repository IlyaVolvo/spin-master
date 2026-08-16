# Stripe test-mode integration runbook

**Status:** Implemented. Assign **`stripe-test`** per member (`Member.paymentProviderId`). Webhooks: `/api/payments/webhook/stripe-test` (test) and `/api/payments/webhook/stripe` (live). Design: [`PER_MEMBER_PAYMENT_PROVIDERS.md`](./PER_MEMBER_PAYMENT_PROVIDERS.md). Live cutover: [`PAYMENTS_TEST_TO_PRODUCTION.md`](./PAYMENTS_TEST_TO_PRODUCTION.md).

**Purpose:** Exercise Stripe against this app’s pluggable payment layer (**Checkout Session → email or in-app → pay → webhook → entitlement**) **without live charges**. Prep before live keys / real money.

**Scope:** providers `stripe-test` + `stripe` (same module) + **Cash**. PayPal/Venmo out of scope.

**Related code today:**

- Provider interface: `server/src/payments/types.ts`
- Registry init: `server/src/payments/index.ts` (`dummy`, `cash`, `stripe-test`, `stripe`)
- Stripe module: `server/src/payments/providers/stripe/`
- Online selection: `resolveMemberOnlinePaymentProvider(member)` from `Member.paymentProviderId`
- Checkout: `runMemberCheckout` → `provider.startCheckout` → email via `deliverOnlinePayLink` **or** `delivery: 'in_app'` + `checkoutUrl`
- Cancel wipe: `POST /api/payments/:paymentId/cancel` (expire Session, delete PENDING); late SUCCEEDED → club credit
- Webhook: `POST /api/payments/webhook/:providerId` (raw body for Stripe paths)
- Confirm: `confirmPayment`
- Client plan UI: `MemberPlanScreen` — **email** checkbox; in-app opens Checkout in a new tab + Cancel; email path keeps “check email”
- Return page: `/payment-return` under `CLIENT_URL`
- Env: `CLIENT_URL` (typical local client `http://localhost:3002`)

Related manual payment/check-in tests: [`MANUAL_PAYMENT_CHECKIN_TESTS.md`](./MANUAL_PAYMENT_CHECKIN_TESTS.md).

---

## 0. Principles

| Mode | Keys | Money | Use |
|------|------|-------|-----|
| **Test** | `sk_test_…`, `pk_test_…`, test webhook secret | No real charges | This entire document |
| **Live** | `sk_live_…`, etc. | Real charges | Only after this runbook passes |

Test mode hits **Stripe’s real API and Checkout UI** with test cards. Behavior matches production; settlement does not.

Keep the `dummy` (dev) provider registered for offline CI; do **not** use it to validate Stripe.

---

## 1. Prerequisites (accounts & tools)

1. Create / use a [Stripe account](https://dashboard.stripe.com).
2. Ensure Dashboard is in **Test mode** (toggle).
3. Install Stripe CLI: `brew install stripe/stripe-cli/stripe` (or equivalent).
4. `stripe login`.
5. From Dashboard → **Developers → API keys**, copy:
   - Secret key `sk_test_…`
   - Publishable key `pk_test_…` (needed if you add client-side Stripe.js later; Checkout Session can work with secret key alone on server)
6. Note local ports from your env (typical from other docs: API `3003`, client `3002` — confirm in your `.env`).

---

## 2. Secrets & config (no live keys)

Add to **local** env only (e.g. `server/.env` — already gitignored). Do not commit.

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...   # from `stripe listen` (local) or Dashboard endpoint (deployed staging)
# Optional if needed later:
# STRIPE_PUBLISHABLE_KEY=pk_test_...
# STRIPE_ALLOW_LIVE=1                 # required before sk_live_ is accepted

CLIENT_URL=http://localhost:3002   # must match the SPA origin used for success/cancel return
```

**Usable rules:** `stripe-test` requires `sk_test_…` + webhook secret; `stripe` requires `sk_live_…` + `STRIPE_ALLOW_LIVE=1` + production install mode. Refuse empty / wrong prefix.

**Admin:** assign `stripe-test` on the member’s Member Plan Admin section (`paymentProviderId`). There is **no** install-wide active online provider. Cash remains available via `method: 'cash'`.

---

## 3. Implementation checklist (code)

### 3.1 Dependency

- Add official `stripe` package on the server.

### 3.2 Stripe providers (`stripe-test` / `stripe`)

Implemented in `server/src/payments/providers/stripe/` (shared module + thin wrappers).

**`startCheckout`**

1. Create Stripe Checkout Session (mode `payment`) with line items, `customer_email`, `client_reference_id` / metadata (`paymentId`, `memberId`, `providerId`)
2. `success_url` / `cancel_url` → `{CLIENT_URL}/payment-return?status=…&paymentId=…`
3. Persist `externalRef` = session id; return `{ checkoutUrl, confirmedImmediately: false }`
4. Orchestrator: if `delivery === 'email'` (Admin, auto-renew, or `emailPayLink`), email via `deliverOnlinePayLink`; if `in_app`, return `checkoutUrl` without email

**`parseWebhook` / `reconcilePending` / `cancelPendingCheckout`**

- Signature verify with raw body; `checkout.session.completed` → SUCCEEDED; expired → CANCELLED
- Reconcile via Session retrieve; cash escape expires unpaid Session first

### 3.3 Register providers

`initializePaymentProviders()` registers `stripe-test` and `stripe` alongside `dummy` and `cash`.

### 3.4 Raw body for webhooks (critical)

`/api/payments/webhook/stripe-test` and `/webhook/stripe` mount `express.raw` **before** the global JSON parser; `req.rawBody` is set for signature verification.

### 3.5 Client: email vs in-app

In `MemberPlanScreen`:

1. After `POST /payments/checkout`: if `delivery === 'in_app'` and `checkoutUrl`, `window.open` Checkout in a new tab; show pending + **Cancel** (`POST /api/payments/:id/cancel`).
2. If `delivery === 'email'` / `payLinkEmailed`, show pending + “check your email”.
3. **email** checkbox patches `emailPayLink` (Admin-on-behalf: checkbox disabled; server forces email).
4. Entitlement updates when webhook → `confirmPayment` → socket / reload.
5. Mail-fail → cash escape UI (`POST /payments/:id/escape-to-cash`) after Session cancel.
6. Stripe return page is minimal (“You can close this page”).

Cash and `dummy` paths unchanged (`dummy` may still wait in-app).

### 3.6 Soft-retire / coexistence with `dummy`

- Assign `stripe-test` per member when keys exist; otherwise keep `dummy` for offline CI.
- If Stripe keys missing, `isUsable()` false → not in assignable list.

### 3.7 Tests (automated)

- Unit: webhook parse → `ConfirmEvent`; `startCheckout` metadata; mail-fail classify; cash escape cancels Session.
- Prefer mocked Stripe SDK in CI.

---

## 4. Local webhook forwarding (simulates production delivery)

Production will POST to your public URL. Locally:

```bash
stripe listen --forward-to localhost:3003/api/payments/webhook/stripe-test
```

(Use your real API port.)

1. CLI prints a **webhook signing secret** `whsec_…` — set as `STRIPE_WEBHOOK_SECRET` and restart API.
2. Leave `stripe listen` running for the whole test session.
3. Optional: `stripe trigger checkout.session.completed` only checks plumbing; prefer a real Checkout pay with a test card (below).

For staging after local E2E passes, do **not** reuse the CLI `whsec_…` — follow §8.

---

## 5. Admin / app setup before manual E2E

1. Server running with test Stripe env vars.
2. `stripe listen` running; webhook secret matches.
3. Admin → member Plan: assign **Stripe (test)** / `stripe-test` (not a global System Settings provider).
4. Member under test:
   - `isActive`
   - email set
   - `onlinePayConsent = true`
   - allowed to purchase (no blocking FUTURE / auto-renew rules)
5. Known plan family with a small `priceCents` (e.g. $1.00) for easy reading in Stripe Dashboard.

---

## 6. Manual E2E — “real world” in test mode (no live charges)

### 6.1 Happy path (card) — in-app (default)

1. Open Member plan → leave **email** unchecked → select plan → **Pay online**.
2. Browser opens **Stripe Checkout** in a **new tab**.
3. Pay with test card:
   - Success: `4242 4242 4242 4242`, any future expiry, any CVC, any postal.
4. Complete payment → redirect to success URL.
5. **Expect:**
   - Stripe Dashboard (Test) → Payments / Checkout: succeeded
   - `stripe listen` shows `checkout.session.completed` → `200` from your API
   - `club_payments`: `provider=stripe-test` (or `stripe`), `status=SUCCEEDED`, `externalRef` set
   - Entitlement / plan UI updated; socket-driven “confirmed” on plan screen
   - Receipt email if member email + mail configured (optional)

### 6.1b Happy path — email pay link

1. Check **email** on plan → **Pay online**.
2. **Expect:** no new Checkout tab; pending + “check email”; link in mail opens Checkout.
3. Complete with test card; same success expectations as §6.1.

### 6.2 Decline / fail

1. Use decline card `4000 0000 0000 0002` (or current Stripe test decline card).
2. **Expect:** Checkout shows failure; `ClubPayment` stays `PENDING` or becomes `FAILED` per your mapping; **no** entitlement grant.

### 6.3 Cancel / abandon (in-app Cancel wipe)

1. Start in-app checkout; on plan screen click **Cancel** before paying (or expire Session via Stripe).
2. **Expect:** PENDING row deleted; Stripe Session expired; plan UI clears pending; no ledger cancel row.
3. Optional race: pay in Stripe **after** Cancel → `club_credits` row + `purchaseCreditCents` increase; **no** plan entitlement from that session.

### 6.4 Webhook missed → reconcile

1. Temporarily stop `stripe listen` (or break webhook secret).
2. Complete a test payment in Checkout (payment succeeds in Stripe).
3. **Expect:** UI may stay pending.
4. Restore webhook **or** run your existing reconcile job / admin path.
5. **Expect:** `reconcilePending` moves payment to `SUCCEEDED` and grants entitlement.

### 6.5 Cash still works

1. Same member, **Cash** method.
2. **Expect:** `provider=cash`, `PENDING`, admin clear required; no Stripe session.

### 6.6 Consent / email gates

1. Clear email or consent → **Pay online** disabled / API error.
2. **Expect:** same as today; Stripe never called.

### 6.7 Wallets (optional)

On a supported device/browser with wallets enabled in Stripe Test Dashboard, confirm Apple Pay / Google Pay **appear** when eligible. Not required to pass the runbook if card path is solid.

---

## 7. Stripe Dashboard checks (test mode)

After a successful run, verify:

- Checkout Session / Payment shows correct **amount** and metadata (`paymentId` / `memberId`)
- No live-mode objects created
- Webhook attempts: delivered, HTTP 2xx from your app

---

## 8. After local test: Stripe **test mode** on staging (Render)

Do this only after §6–§7 pass locally. Staging still uses **test** keys (`sk_test_…`) — no live charges. Do **not** put `sk_live_…` on staging for this phase.

**On Render you do not run `stripe listen`.** Stripe POSTs webhooks to your public API URL. The CLI is laptop-only.

### 8.1 Preconditions

- [ ] Stripe provider code + exact-path raw webhook body handling are merged and ready to deploy
- [ ] Local happy path (§6.1) passed with `stripe listen` → `/api/payments/webhook/stripe-test`
- [ ] You know staging URLs:
  - **API** (Render web service), e.g. `https://<staging-api>.onrender.com`
  - **Client / SPA** origin used as `CLIENT_URL` (must match Checkout success/cancel redirect host)

### 8.2 Deploy the build

1. Deploy the server (and client if separate) that includes Stripe + the webhook raw-body fix to **staging**.
2. Confirm the deploy is healthy (health check / login / cash checkout still works).
3. Confirm the test webhook route exists on the public API host:
   `POST https://<staging-api-host>/api/payments/webhook/stripe-test`
   (404 for wrong method is fine; the route must exist.)

### 8.3 Render environment variables

On the **staging** API service (Environment), set or update, then **redeploy / restart**:

| Variable | Value |
|----------|--------|
| `STRIPE_SECRET_KEY` | `sk_test_…` (Dashboard → Test mode → API keys) |
| `STRIPE_WEBHOOK_SECRET` | Staging Dashboard endpoint `whsec_…` from §8.4 — **not** the local CLI secret |
| `CLIENT_URL` | Staging SPA origin members open in the browser (no trailing slash) |
| `STRIPE_PUBLISHABLE_KEY` | `pk_test_…` only if the client needs it later |
| `STRIPE_ALLOW_LIVE` | leave **unset** / not `1` |

Also keep SMTP configured if pay-link emails should send on staging.

Checklist:

- [ ] No `sk_live_` / live `whsec_` on staging
- [ ] Webhook secret matches the **staging Dashboard** endpoint, not `stripe listen`
- [ ] `CLIENT_URL` is the URL members actually use for staging
- [ ] Service restarted after env change

### 8.4 Stripe Dashboard webhook (this replaces listeners on Render)

Stay in Dashboard **Test mode**. No process to start on Render.

1. **Developers → Webhooks → Add endpoint**.
2. Endpoint URL (test provider path):

   ```text
   https://<staging-api-host>/api/payments/webhook/stripe-test
   ```

3. Subscribe at least to:
   - `checkout.session.completed`
   - `checkout.session.expired`
4. Create the endpoint → **Reveal** signing secret → copy `whsec_…` into Render `STRIPE_WEBHOOK_SECRET` (§8.3) → restart.
5. **Important:** local CLI `whsec_…` and staging Dashboard `whsec_…` are different. Using the CLI secret on Render leaves payments **PENDING** after a successful card pay.

Optional: stop local `stripe listen` while exercising staging so you are not confusing two endpoints.

### 8.5 App config on staging

With `sk_test_…`, only **`stripe-test`** (`Stripe (test)`) is usable — not live `stripe`.

1. Log in as admin on **staging**.
2. Open the test member → Member plan (admin):
   - email set
   - online payment service = **Stripe (test)** / `stripe-test`
   - `onlinePayConsent` on
   - allowed to purchase (no blocking FUTURE if you need a clean buy)
3. Prefer a small plan price for easy Dashboard verification.

There is no install-wide “active online provider”; assignment is **per member**.

### 8.6 Staging E2E (test cards, still no real money)

Repeat the core of §6 against **staging** URLs (not localhost):

1. Member plan → Pay online → email link → pay with `4242 4242 4242 4242`.
2. Stripe Dashboard → Webhooks → staging endpoint: delivery **succeeded** (HTTP 2xx).
3. Render logs: webhook received; confirm path ran (no signature errors).
4. Staging UI / DB: `club_payments.provider = stripe-test`, `SUCCEEDED`, entitlement updated.
5. Spot-check decline or cancel if time allows.
6. Confirm Cash still works on staging.

### 8.7 Staging-specific pitfalls

| Symptom | Likely cause |
|---------|----------------|
| Checkout opens then return URL is wrong host | `CLIENT_URL` not set to staging SPA |
| Payment succeeds in Stripe, app stays PENDING | Wrong `STRIPE_WEBHOOK_SECRET` (CLI secret on staging), or webhook URL points at wrong service / wrong path |
| Signature verification failures in logs | Secret mismatch; or old deploy without exact-path raw-body handling |
| Provider not selectable / “not usable” | Missing `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` on staging, or deploy without Stripe code |
| Webhook 404 | Path not `/api/payments/webhook/stripe-test`, or old deploy |
| Expecting a listener process on Render | Not needed — Dashboard endpoint is the listener |

### 8.8 Staging exit criteria (test mode ready in deployed env)

- [ ] Staging deploy includes Stripe + exact-path raw body webhook handling
- [ ] Dashboard **Test** webhook points at `/api/payments/webhook/stripe-test` and shows successful deliveries
- [ ] Staging env uses `sk_test_…` + staging Dashboard `whsec_…` only
- [ ] Happy-path purchase on staging confirms payment and updates plan (no manual reconcile)
- [ ] Cash still works on staging

When §8.8 passes, staging is valid for ongoing test-mode demos. Live cutover is still §10.
---

## 9. Exit criteria (ready for “real” integration talk / live cutover)

All must be true:

- [ ] `StripePaymentProvider` registered; selectable as sole online provider
- [ ] Checkout opens Stripe-hosted page from the app
- [ ] Test-card success → webhook → `confirmPayment` → entitlement + UI confirm
- [ ] Decline / cancel do not grant access
- [ ] Reconcile recovers a paid-but-missed-webhook case
- [ ] Cash path unchanged
- [ ] Signature verification works (invalid signature → 4xx, no confirm)
- [ ] Only `sk_test_` / test webhook secrets used in local + staging
- [ ] Staging test-mode rehearsal (§8) completed
- [ ] Docs/runbook reviewed by whoever will flip live keys

**Not required for this exit:** PayPal, Venmo, multi-provider UI, live charges.

---

## 10. After this document (live Stripe)

Out of scope here. Follow [`PAYMENTS_TEST_TO_PRODUCTION.md`](./PAYMENTS_TEST_TO_PRODUCTION.md): `installMode` is locked after first boot; live keys alone are not enough.

---

## 11. Why Stripe first

- Checkout Session URL + webhook + reconcile fit the async pay-link model.
- Venmo stays cash/manual until a PayPal provider exists.
