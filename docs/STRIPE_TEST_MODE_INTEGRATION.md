# Stripe test-mode integration runbook

**Purpose:** Integrate Stripe against this app’s pluggable payment layer and exercise the **full real-world flow** (Checkout redirect → pay → webhook → entitlement) **without live charges**. This is the last prep step before turning on live keys / real money.

**Scope for this phase:** one online provider (`stripe`) + existing **Cash**. Multi-provider picker and PayPal/Venmo are out of scope.

**Related code today:**

- Provider interface: `server/src/payments/types.ts`
- Registry init: `server/src/payments/index.ts` (`dummy`, `cash` only)
- Online selection: `resolveMemberOnlinePaymentProvider(member)` from `Member.paymentProviderId`
- Checkout: `runMemberCheckout` → `provider.startCheckout`
- Webhook: `POST /api/payments/webhook/:providerId`
- Confirm: `confirmPayment`
- Client plan UI: `MemberPlanScreen` — **does not open `checkoutUrl` yet**
- Env already used for app URLs: `CLIENT_URL` (default `http://localhost:3000`)

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

CLIENT_URL=http://localhost:3002   # must match the SPA origin used for success/cancel return
```

**Usable rule for the plugin:** `isUsable()` should be true only when `STRIPE_SECRET_KEY` is set and starts with `sk_test_` or `sk_live_` (reject empty / wrong prefix). Prefer refusing live keys in local/dev unless an explicit `STRIPE_ALLOW_LIVE=1` (optional safety).

Admin: set `SystemConfig.payments.providerId` to `stripe` once the plugin is registered and usable (Payments Admin / System Settings). Cash remains available via `method: 'cash'`.

---

## 3. Implementation checklist (code)

### 3.1 Dependency

- Add official `stripe` package on the server.

### 3.2 `StripePaymentProvider` (`id: 'stripe'`)

Implement `PaymentProvider`:

**`startCheckout`**

1. Create Stripe Checkout Session (mode `payment`) with:
   - `line_items` / `price_data` from `amountCents`, `currency`, description from `purpose` / product
   - `customer_email` from `memberEmail` when present
   - `client_reference_id` or `metadata`: `{ paymentId, memberId, … }` (needed for webhook ↔ `ClubPayment`)
   - `success_url` / `cancel_url` under `CLIENT_URL` (e.g. return to plan/kiosk with query `?payment=success|cancel&paymentId=…`)
2. Persist on `ClubPayment`: `provider: 'stripe'`, `externalRef` = session id (`cs_test_…`) or PaymentIntent id (pick one and use consistently in webhook + reconcile)
3. Return `{ paymentId, externalRef, checkoutUrl: session.url, confirmedImmediately: false }`

**`parseWebhook`**

- Verify signature with `STRIPE_WEBHOOK_SECRET` and **raw body**
- Map events, at minimum:
  - `checkout.session.completed` (paid) → `SUCCEEDED`
  - `checkout.session.expired` / payment failed paths → `FAILED` or `CANCELLED` as appropriate
- Emit `ConfirmEvent` with `providerId: 'stripe'`, `externalRef` matching what you stored

**`reconcilePending`**

- Retrieve Session (or PI) by `externalRef`; if paid, return `SUCCEEDED`; if expired/canceled, map accordingly; else `null`

**Settings (optional for v1)**

- Schema keys for success path labels only if needed; keys stay in env, not SystemConfig.

### 3.3 Register provider

In `initializePaymentProviders()`:

- `register(new StripePaymentProvider())` alongside `dummy` and `cash`.

### 3.4 Raw body for webhooks (critical)

Today `server/src/index.ts` uses global `express.json()`, which **breaks** Stripe signature verification.

Before JSON parser (or only for this route):

- Mount `POST /api/payments/webhook/stripe` with `express.raw({ type: 'application/json' })`, **or**
- Use a verify callback that preserves `req.rawBody` for that path.

`parseWebhook` must use the raw Buffer Stripe signed.

### 3.5 Client: open Checkout

In `MemberPlanScreen` (and any other online checkout callers):

1. After `POST /payments/checkout`, if `res.data.checkoutUrl` is present, `window.open(checkoutUrl, …)` or `window.location.assign` (prefer new tab on kiosk if you need the plan screen to keep listening).
2. Keep existing `waitForPaymentUpdate` so when webhook → `confirmPayment` → socket `payment:updated`, UI flips to confirmed.
3. On cancel return URL, show pending/cancelled messaging; do not grant entitlement without `SUCCEEDED`.

Cash path unchanged (no URL).

### 3.6 Soft-retire / coexistence with `dummy`

- With `providerId: 'stripe'`, online checkouts use Stripe.
- If Stripe keys missing, `isUsable()` false → admin cannot select it; fall back guidance: keep using `dummy` until keys exist.
- Do not auto-pick among multiple online providers beyond existing rules until multi-provider work later.

### 3.7 Tests (automated)

- Unit: webhook signature parse → `ConfirmEvent`; map completed/expired.
- Unit/mocks: `startCheckout` stores `externalRef` and returns URL.
- Do not hit Stripe network in CI unless using recorded fixtures; prefer mocked Stripe SDK.

---

## 4. Local webhook forwarding (simulates production delivery)

Production will POST to your public URL. Locally:

```bash
stripe listen --forward-to localhost:3003/api/payments/webhook/stripe
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
3. System Settings: active online provider = **stripe**.
4. Member under test:
   - `isActive`
   - email set
   - `onlinePayConsent = true`
   - allowed to purchase (no blocking FUTURE / auto-renew rules)
5. Known plan family with a small `priceCents` (e.g. $1.00) for easy reading in Stripe Dashboard.

---

## 6. Manual E2E — “real world” in test mode (no live charges)

### 6.1 Happy path (card)

1. Open Member plan → select plan → **Pay online** → purchase.
2. Browser opens **Stripe Checkout** (hosted).
3. Pay with test card:
   - Success: `4242 4242 4242 4242`, any future expiry, any CVC, any postal.
4. Complete payment → redirect to success URL.
5. **Expect:**
   - Stripe Dashboard (Test) → Payments / Checkout: succeeded
   - `stripe listen` shows `checkout.session.completed` → `200` from your API
   - `club_payments`: `provider=stripe`, `status=SUCCEEDED`, `externalRef` set
   - Entitlement / plan UI updated; socket-driven “confirmed” on plan screen
   - Receipt email if member email + mail configured (optional)

### 6.2 Decline / fail

1. Use decline card `4000 0000 0000 0002` (or current Stripe test decline card).
2. **Expect:** Checkout shows failure; `ClubPayment` stays `PENDING` or becomes `FAILED` per your mapping; **no** entitlement grant.

### 6.3 Cancel / abandon

1. Start checkout, close Stripe page or use cancel URL.
2. **Expect:** no `SUCCEEDED`; no new CURRENT entitlement from this attempt; session may expire → webhook/`reconcile` maps to cancelled/failed later.

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

## 8. After local test: Stripe **test mode** on staging deployment

Do this only after §6–§7 pass locally. Staging still uses **test** keys (`sk_test_…`) — no live charges. Do **not** put `sk_live_…` on staging for this phase.

### 8.1 Preconditions

- [ ] Stripe provider code + raw webhook body fix are merged and ready to deploy
- [ ] Local happy path (§6.1) passed with `stripe listen`
- [ ] You know staging URLs:
  - **API** (Render web service), e.g. `https://<staging-api>.onrender.com`
  - **Client / SPA** origin used as `CLIENT_URL` (must match success/cancel redirect host)

### 8.2 Deploy the build

1. Deploy the server (and client if separate) that includes the Stripe plugin to the **staging** environment.
2. Confirm the deploy is healthy (health check / login / existing cash checkout still works).
3. Confirm `/api/payments/webhook/stripe` is reachable on the public API host (404 for wrong method is fine; the route must exist).

### 8.3 Stripe Dashboard — Test mode webhook for staging

Stay in Dashboard **Test mode**.

1. **Developers → Webhooks → Add endpoint**.
2. Endpoint URL:

   ```text
   https://<staging-api-host>/api/payments/webhook/stripe
   ```

3. Subscribe at least to:
   - `checkout.session.completed`
   - `checkout.session.expired`
   - any additional events your `parseWebhook` handles
4. Create the endpoint and open **Reveal** under Signing secret → copy `whsec_…`.
5. **Important:** this secret is **not** the one from `stripe listen`. Local CLI and staging Dashboard each have their own `whsec_…`.

Optional: disable or ignore the local-only CLI forwarding while testing staging (CLI is for laptop only).

### 8.4 Render (or host) environment variables

On the **staging** API service, set (or update) and **redeploy / restart** so the process picks them up:

| Variable | Value |
|----------|--------|
| `STRIPE_SECRET_KEY` | Same or dedicated `sk_test_…` (Test mode API key) |
| `STRIPE_WEBHOOK_SECRET` | Staging endpoint `whsec_…` from §8.3 |
| `CLIENT_URL` | Staging SPA origin (no trailing slash issues — match what Checkout success/cancel URLs use) |
| `STRIPE_PUBLISHABLE_KEY` | `pk_test_…` only if the client needs it |
| `STRIPE_ALLOW_LIVE` | unset / not `1` |

Checklist:

- [ ] No `sk_live_` / live `whsec_` on staging
- [ ] Webhook secret matches the **staging** Dashboard endpoint, not local CLI
- [ ] `CLIENT_URL` is the URL members actually open in the browser for staging
- [ ] Service restarted after env change

### 8.5 App config on staging

1. Log in as admin on **staging**.
2. System Settings / Payments: set active online provider to **`stripe`** (requires Stripe `isUsable()` with keys present).
3. Pick a staging test member: email + `onlinePayConsent`, allowed to purchase.
4. Prefer a small plan price for easy Dashboard verification.

### 8.6 Staging E2E (test cards, still no real money)

Repeat the core of §6 against the **staging** URLs (not localhost):

1. Happy path with `4242 4242 4242 4242`.
2. In Stripe Dashboard → Webhooks → staging endpoint: delivery **succeeded** (HTTP 2xx).
3. In Render logs: webhook received and confirm path ran.
4. In staging DB / UI: `club_payments.provider = stripe`, `SUCCEEDED`, entitlement updated.
5. Spot-check decline or cancel once if time allows.
6. Confirm Cash path still works on staging.

### 8.7 Staging-specific pitfalls

| Symptom | Likely cause |
|---------|----------------|
| Checkout opens then return URL is wrong host | `CLIENT_URL` not set to staging SPA |
| Payment succeeds in Stripe, app stays pending | Wrong `STRIPE_WEBHOOK_SECRET` (CLI secret on staging), or webhook URL points at wrong service |
| Signature verification failures in logs | Body parsed as JSON before Stripe verify; or secret mismatch |
| Provider not selectable / “not usable” | Missing `STRIPE_SECRET_KEY` on staging or deploy without Stripe code |
| Webhook 404 | Path not `/api/payments/webhook/stripe`, or old deploy |

### 8.8 Staging exit criteria (test mode ready in deployed env)

- [ ] Staging deploy includes Stripe + raw body webhook handling
- [ ] Dashboard **Test** webhook endpoint points at staging API and shows successful deliveries
- [ ] Staging env uses `sk_test_…` + staging `whsec_…` only
- [ ] Happy-path purchase on staging confirms payment and updates plan
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

## 10. After this document (live cutover — out of scope here)

Separate change control:

1. Complete Stripe business verification / bank payout setup.
2. Create a **separate** Dashboard webhook endpoint for the **live** API host (Live mode) + `sk_live_` / live `whsec_`.
3. Flip env only on the intended environment; smoke with a **tiny** real charge and refund.
4. Do not reuse staging’s test `whsec_…` for live.
5. Communicate to members: online = card/wallets; Venmo remains cash/manual until PayPal provider.

---

## 11. Decision context (why Stripe first)

- App today supports **one** active online provider + cash.
- Stripe matches Checkout URL + webhook + reconcile cleanly.
- Venmo is popular locally but belongs with a later **PayPal** provider (or manual cash clear), not as a requirement to finish this runbook.
