# Per-member online payment services

**Status:** Design approved. **Step 1 implemented** on branch `feature/payments-member-provider-step1`. Steps 2–4 not yet implemented.

**Related:**
- Manual check-in/payment tests: [`MANUAL_PAYMENT_CHECKIN_TESTS.md`](./MANUAL_PAYMENT_CHECKIN_TESTS.md)
- Stripe runbook (will be updated in step 4 for email-async + per-member assignment): [`STRIPE_TEST_MODE_INTEGRATION.md`](./STRIPE_TEST_MODE_INTEGRATION.md)

---

## 1. Purpose

Replace the old model of **one global online payment provider per install** with:

1. **Multiple** online payment services registered in code (e.g. `dummy`, `stripe-test`, later `stripe`).
2. An **immutable install mode** (`test` | `production`) that decides which services Admin may assign.
3. **Per-member** assignment of at most one online service (Admin only, in Player Settings).
4. Online checkout that is **async**: the app creates a payment intent and emails a pay link; confirmation happens only via provider webhook (or reconcile)—the app does not drive card UI.

Cash (desk) remains a separate path and is never chosen as the member’s “online payment service.”

---

## 2. Concepts

### 2.1 Install mode (`payments.installMode`)

| Value | Meaning |
|-------|---------|
| `test` | Only services tagged `environment: 'testing'` appear in Admin’s member assignment list |
| `production` | Only services tagged `environment: 'production'` appear |

**Immutable after bootstrap.** Set once when system config is first written to the DB:

- Environment: `PAYMENTS_INSTALL_MODE` (aliases: `PAYMENTS_MODE`; values `test` / `testing` or `production` / `prod` / `live`)
- Or CLI: `--payments-install-mode=test|production`

Default if unset: **`test`** (safer for local/staging).

Admin System Config / Payments UI shows the mode as **read-only**. API updates that try to change `installMode` are ignored.

**Why:** Same codebase for staging and production. Staging DB stays in `test` (fake + Stripe test). Production DB is initialized with `production` and live Stripe keys—no code fork.

### 2.2 Payment provider plugins

Each provider implements `PaymentProvider` (`server/src/payments/types.ts`) and declares:

| Field | Role |
|-------|------|
| `id` | Stable string (`dummy`, `stripe-test`, `stripe`, `cash`, …) |
| `displayName` | Admin UI label |
| `environment` | `testing` \| `production` (online PSPs; cash is not filtered by install mode for desk flows) |
| `isUsable()` | Can this process start checkouts (e.g. keys present)? |
| `isOfferedForNewPayments()` | Soft-retire flag |

**Planned / current online ids:**

| id | environment | Role |
|----|-------------|------|
| `dummy` | testing | Dev fake PSP (delayed confirm); CI / offline |
| `stripe-test` | testing | Real Stripe API with `sk_test_…` (no live charges) — **step 3** |
| `stripe` | production | Real Stripe with `sk_live_…` — same module as stripe-test; usable when live keys + production install |

**Cash** (`cash`): desk PENDING until Admin clears; not assignable as the member’s online service.

### 2.3 Member fields

| Field | Meaning |
|-------|---------|
| `paymentProviderId` | Nullable string. Admin-assigned online PSP id. **`null` = Pay online not available** for that member. |
| `onlinePayConsent` | Explicit checkmark agreement to pay online. |
| `email` | Required for any online setup and for pay-link delivery. |
| `autoRenewEnabled` | Requires online capability; cleared when online is disabled via email removal / consent rules. |

New members: `paymentProviderId` starts **unset** (`null`). Admin must assign a service before online pay can be used (once step 2 enforces this).

### 2.4 What members vs Admin choose

| Actor | Can choose |
|-------|------------|
| **Admin** | Which online **service** is on the member (`paymentProviderId`), from the install-mode-filtered list |
| **Member** | **Cash vs Pay online** at purchase time (when gates allow)—**not** which PSP |
| **Member** | Consent checkmark (self or Admin), when email is present |

Members never pick among Stripe / Test / future PayPal.

---

## 3. Gates for “Pay online”

Pay online is available only when **all** are true:

1. `paymentProviderId` is set to an assignable, usable provider for this install  
2. Member has a non-empty **email**  
3. `onlinePayConsent === true`

### 3.1 Email cleared (Admin)

- Turn off `onlinePayConsent`
- Turn off `autoRenewEnabled` (and clear `autoRenewFamilyKey`)
- **Keep** `paymentProviderId` so Admin does not re-pick the service when email is restored  
- After email returns, online stays off until consent is checked again

### 3.2 Assigning a service

- **Admin only**
- Requires email already present (or set in the same request such that final email is non-empty)
- Value must be in the current assignable list (usable + offered + `environment` matches `installMode`, not cash)
- Empty / null clears assignment

### 3.3 Auto-renew

Uses the same online capability. If email is removed or online is otherwise disabled, auto-renew is turned off. (Full resolution via `paymentProviderId` is step 2.)

---

## 4. Layered selection model

```text
Code registry: dummy | stripe-test | stripe | cash | …
        ↓
Immutable installMode: test | production
        ↓
Admin Player Settings: assign one offered online service (or None)
        ↓
Checkout method: Cash | Pay online  (member or Admin on behalf)
        ↓
Online path: member.paymentProviderId → that plugin only
Cash path: cash provider (desk clear)
```

**Removed (no legacy):** global `SystemConfig.payments.providerId`. If old JSON still contains it, it is stripped/ignored on load.

---

## 5. Async online payment flow (approved design; steps 3+)

The application does **not** collect cards and does **not** require the member to stay in the app while paying.

```text
Online checkout requested
    → Create PENDING ClubPayment + provider Checkout Session
    → Email checkout URL to the member’s email
    → UI shows pending; no redirect / no blocking wait for pay
    → Member pays outside the app (email link → Stripe Checkout)
    → Provider webhook → confirmPayment → entitlement / PAID
    → Optional socket refresh if UI is open
```

### 5.1 Return URLs

Stripe success/cancel URLs point at a simple client page: **“You can close this page.”** Branding polish is deferred; review the real page before calling it final.

### 5.2 Email send failures

SMTP accept ≠ inbox delivery. Classification for v1 is on **send attempt** only (no inbox bounce webhooks yet).

| Class | Examples | Behavior |
|-------|----------|----------|
| **Irrecoverable** | Invalid address, mailbox unknown, hard reject | Show error; **cash escape available immediately** |
| **Recoverable** | SMTP timeout, transient 4xx, rate limit | Retry; after **SystemConfig delay**, same cash escape |

**Cash escape rule (no double pay):** never mark cash paid while a Stripe Session is still payable. Escape path must **cancel/expire/confirm unpaid** on the online session first, then switch the obligation to cash PENDING (Admin clear as today).

Mail failure alone does **not** mean the online payment failed—a Session might still be paid if the link was obtained another way.

### 5.3 Stripe implementation shape (step 3)

- One **confined** Stripe module (Checkout, webhook verify, reconcile)—not scattered callers
- Two registrations: `stripe-test` and `stripe` (thin wrappers)
- Webhooks: `POST /api/payments/webhook/stripe-test` and `…/webhook/stripe`
- Raw body required for signature verification
- Production enablement: production install + `sk_live_…` (and live webhook secret)—same code

---

## 6. UI surfaces

### 6.1 Payments Admin (System / Payment settings)

- Read-only **Payments install mode**
- List of **Available Payment services** for this mode
- Provider-specific settings (e.g. dummy confirm delay)—not API keys (keys stay in env)
- Other club payment knobs (trial, courtesy, default consent, reminders) unchanged in role
- **No** global “active online provider” selector

### 6.2 Player Settings (Admin)

- **Online payment service** dropdown (only when member has email): None + assignable services
- **Consent to pay online** checkbox (email required to show/enable meaningfully)
- Non-admins cannot change `paymentProviderId`

### 6.3 Member Plan / checkout

- Member (or Admin on behalf) may still choose **Cash vs Pay online** when gates allow
- Online → email pay link (step 3); Cash → existing desk PENDING / immediate confirm rules

---

## 7. Implementation steps

| Step | Scope | Status |
|------|--------|--------|
| **1** | `Member.paymentProviderId`; `installMode`; drop global `providerId`; provider `environment`; Admin picker; email-clear keeps provider; Payments Admin read-only mode | **Done** (this branch) |
| **2** | Checkout + auto-renew resolve from `member.paymentProviderId`; enforce gates in API/UI | Pending |
| **3** | Stripe module (`stripe-test` / `stripe`); email pay link; webhooks; mail-fail + delayed cash escape | Pending |
| **4** | Tests polish; update Stripe runbook for email-async + per-member model | Pending |

Until step 2, online checkout may still use a **temporary** sole-matching-provider fallback when exactly one online PSP matches install mode (e.g. only `dummy`). That is intentional scaffolding, not the final rule.

---

## 8. Configuration reference

### 8.1 Environment / CLI (bootstrap)

```bash
# Preferred
PAYMENTS_INSTALL_MODE=test          # or production

# Optional alias
PAYMENTS_MODE=test

# Or once at process start
node … --payments-install-mode=production
```

### 8.2 Stripe (step 3; not required for step 1)

```bash
STRIPE_SECRET_KEY=sk_test_…         # stripe-test
STRIPE_WEBHOOK_SECRET=whsec_…
CLIENT_URL=https://…                # return page origin
# Production later: sk_live_… + production installMode + stripe webhook path
```

### 8.3 Database

Migration: `server/prisma/migrations/20260807210000_member_payment_provider_id/`

```sql
ALTER TABLE "members" ADD COLUMN "paymentProviderId" TEXT;
```

---

## 9. Code map

| Area | Location |
|------|----------|
| Provider interface + `environment` | `server/src/payments/types.ts` |
| Registry | `server/src/payments/PaymentProviderRegistry.ts`, `index.ts` |
| Assignable list / install filter | `server/src/payments/getActivePaymentProvider.ts` |
| Install mode resolve + immutable update | `server/src/services/systemConfigService.ts` |
| Member PATCH (`paymentProviderId`, email clear) | `server/src/routes/players.ts` |
| Providers API (`installMode`, `assignableProviders`) | `server/src/payments/routes/checkout.ts` |
| Admin payments UI | `client/src/components/PaymentsAdmin.tsx` |
| Player Settings picker | `client/src/components/Players.tsx` |
| Client config types | `client/src/utils/systemConfig.ts` |

---

## 10. Out of scope (deferred)

| Item | Meaning | Drawback of deferring |
|------|---------|------------------------|
| Member multi-PSP choice | Member picks among online services | Admin must reassign to change PSP |
| PayPal / Venmo | No plugin yet | Venmo users stay on cash/desk |
| Fancy return branding | Minimal “close this page” after Stripe | Less polished post-pay moment |
| Inbox bounce webhooks | No SendGrid/Mailgun bounce → auto cash escape | Rare “sent but never arrived” cases need manual help / retry / expiry |

---

## 11. Manual test focus (step 1)

See also conversational checklist; summary:

1. Payments Admin: read-only install mode; assignable list; no global provider select  
2. Admin Player Settings: assign / clear online service (email required)  
3. Clear email → consent + auto-renew off; service id retained  
4. Non-admin cannot set `paymentProviderId`  
5. Cash path still works; do not expect Stripe email flow yet  

Apply migration before testing against a live DB.
