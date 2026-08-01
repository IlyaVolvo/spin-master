# Interactive Role Tutorials — Implementation Plan

**Status:** Implemented (v1 shell + capture pipeline, 2026-08-01)  
**Replaces:** legacy static `/role-tutorials/` screenshot pages.

---

## 1. Goal

Ship a **fully static**, **isolated** tutorial site at `/role-tutorials/` that:

1. Lists scenarios **by role** (Admin, Organizer, Player; Coach later).
2. Walks each scenario step-by-step with **full-page PNGs** from the real app.
3. Requires an explicit **Continue** between steps; prefers a **simulated hotspot click** (`x,y,w,h` as % of image).
4. Soft-warns on every Continue until the hotspot is used (Continue still works).
5. Ends with a short completion summary + related scenarios.
6. Is **re-recorded** by maintainers: reset dedicated tutorial DB → run app against it → Puppeteer capture → commit assets + regenerated JSON coords.

**Non-goals (v1):** in-app overlay, live API/auth on the tutorial pages, in-app discovery links, visual-diff CI, Coach scenarios, production DB involvement.

---

## 2. Approved decisions (summary)

| Area | Decision |
|------|----------|
| Audience | Admins/Organizers primary; Player payments; Coaches later |
| Delivery | Fully static; no auth; no live API |
| Interaction | Hotspot simulate + warn-on-skip Continue |
| Visual | Full-page PNG; desktop primary; mobile if easy |
| Manifest | `scenarios/<slug>.json`; stable slugs; developer-owned prose |
| Capture | Fully scripted Puppeteer; hotspots from element bboxes → % |
| Re-run | Full regenerate for captured fields; continue other scenarios on failure |
| DB | Separate Postgres; always reset; pin club/payments/config |
| Isolation | Tutorial must not affect prod or day-to-day app data |
| URL | Keep `/role-tutorials/` |
| Migration | Fresh start; delete old static tutorials when new system ships |
| Discovery | Known URL only |
| Ops | One documented end-to-end flow; manual re-record; commit PNGs + JSON |

---

## 3. Target file layout

```
client/public/role-tutorials/
  index.html                 # Role → scenario catalog
  play.html                  # Step player (?scenario=<slug>)
  tutorial.css               # Shared styles (hotspot, warn, layout)
  tutorial-player.js         # Load JSON, render step, hotspot, Continue warn
  catalog.json               # Role-grouped index of scenarios (titles, slugs)
  scenarios/
    <slug>.json              # Per-scenario steps + copy + hotspots
  assets/
    <slug>/
      step-01.png
      step-02.png
      ...
      # optional later:
      mobile/
        step-01.png
        ...

server/scripts/tutorials/    # NEW (names flexible)
  resetTutorialDb.ts         # Drop/recreate or migrate+wipe tutorial DB
  seedTutorialDb.ts          # Pinned club, plans, users, sample data
  captureTutorials.ts        # Orchestrator: all scenarios, continue on fail
  scenarios/
    <slug>.ts                # Puppeteer actions for each scenario
  lib/
    browser.ts               # Chrome path, viewport, login helpers
    hotspot.ts               # element → % rect of viewport/screenshot
    manifest.ts              # write/regenerate scenario JSON image+coords
    safety.ts                # refuse non-tutorial DATABASE_URL

# REMOVE when new system ships (do not delete until replacement works):
client/public/role-tutorials/{player,organizer,administrator}.html  # old long pages
client/public/role-tutorials/assets/*.png                           # flat old assets
server/scripts/seedRoleTutorialUsers.ts
server/scripts/captureRoleTutorialScreenshots.ts
# package.json scripts seed:role-tutorials / capture:role-tutorials → replace
```

SPA already treats `/role-tutorials` as static (`App.tsx` `isRoleTutorialsPath` + redirect to `index.html`). Keep that behavior; only swap contents under `public/role-tutorials/`.

---

## 4. Data contracts

### 4.1 `catalog.json`

```json
{
  "roles": [
    {
      "id": "player",
      "label": "Player",
      "scenarios": [
        { "slug": "player-payment-checkin", "title": "Pay and check in" }
      ]
    },
    {
      "id": "organizer",
      "label": "Organizer",
      "scenarios": []
    },
    {
      "id": "admin",
      "label": "Administrator",
      "scenarios": []
    }
  ]
}
```

### 4.2 `scenarios/<slug>.json`

```json
{
  "slug": "player-payment-checkin",
  "role": "player",
  "title": "Pay and check in",
  "description": "One-line catalog blurb.",
  "relatedSlugs": ["admin-payment-settings"],
  "viewport": { "width": 1440, "height": 900 },
  "steps": [
    {
      "id": "login",
      "title": "Sign in",
      "body": "Markdown-or-plain explanation shown beside/under the screenshot.",
      "image": "assets/player-payment-checkin/step-01.png",
      "actionHint": "Click Sign in",
      "hotspot": { "x": 42.5, "y": 61.0, "w": 15.0, "h": 6.5 }
    },
    {
      "id": "done",
      "title": "Checked in",
      "body": "You are now checked in.",
      "image": "assets/player-payment-checkin/step-02.png"
    }
  ]
}
```

**Rules**

- `hotspot` omitted → informational step; Continue with no warn.
- `hotspot` present → Continue warns until click/tap inside rect (percentage of displayed image box).
- Capture script **regenerates** `image` paths and `hotspot` from Puppeteer; developers own `title`/`body`/`actionHint`/`relatedSlugs` (preserve prose on regenerate if keys match by `steps[].id`, or regenerate whole file from TS constants — pick one in implementation; preference: **TS scenario definition is source of truth for structure + default prose**, JSON on disk is the published artifact fully rewritten each capture).

**Regenerate policy (locked):** full regenerate for the scenario artifacts the capture owns. Recommended implementation detail:

- Each `scenarios/<slug>.ts` exports `{ slug, role, title, description, relatedSlugs, steps: [{ id, title, body, actionHint?, capture }] }`.
- Capture writes complete `scenarios/<slug>.json` + PNGs.
- Catalog rebuilt from all scenario modules (or from written JSON).

### 4.3 Hotspot math

At capture time (viewport screenshot):

```
x% = (el.x / viewportWidth) * 100
y% = (el.y / viewportHeight) * 100
w% = (el.width / viewportWidth) * 100
h% = (el.height / viewportHeight) * 100
```

Playback: position overlay using the same % relative to the rendered `<img>` content box (object-fit must be consistent — use `object-fit: contain` and compute against the actual drawn image rect).

---

## 5. Playback UX

1. `index.html` — roles as sections/tabs; list scenario titles → `play.html?scenario=<slug>`.
2. `play.html` — loads `scenarios/<slug>.json`; shows step N of M, PNG, title, body, optional hotspot pulse/outline, **Continue**, **Back**.
3. Hotspot click → mark step “acted”; brief visual feedback; auto-advance optional (prefer **manual Continue** after simulate for clarity).
4. Continue without hotspot → toast/banner: “You skipped the highlighted action. Click the highlighted area to practice, or Continue again to proceed.” (every time until acted).
5. Last step Continue → completion panel: title, short recap, related scenario links, link back to catalog.

No network calls except loading local JSON/PNG (static hosting).

---

## 6. Tutorial database

### 6.1 Provisioning

Mirror the existing **test DB** pattern (`DATABASE_URL_TEST` in `server/env.example`):

```env
# server/.env — local maintainer only; never point at prod
DATABASE_URL_TUTORIAL="postgresql://user:password@localhost:5432/spin_master_tutorials?schema=public"
```

Create DB once (maintainer):

```bash
createdb spin_master_tutorials
# or equivalent on your Postgres host
```

### 6.2 Safety (hard isolation)

Capture/reset/seed scripts must:

1. Require `DATABASE_URL_TUTORIAL` (or `DATABASE_URL` only when it equals the tutorial URL via explicit `TUTORIAL_DB_OK=1` — prefer dedicated env var only).
2. Refuse if URL hostname/db name matches known prod patterns (configurable denylist) or if `NODE_ENV=production`.
3. Never write tutorial seed into `DATABASE_URL` (dev) or production.
4. Document: run capture with server process also using `DATABASE_URL=$DATABASE_URL_TUTORIAL`.

### 6.3 Reset + seed (always reset before capture)

Documented flow (single path):

```bash
# 1) Reset + seed tutorial DB (schema migrate/deploy + wipe + pin data)
cd server && npm run tutorials:reset-seed

# 2) Start API+client against tutorial DB
#    e.g. DATABASE_URL="$DATABASE_URL_TUTORIAL" for server; client as usual

# 3) Capture all scenarios (continues on failure; prints report)
cd server && npm run tutorials:capture
# ROLE_TUTORIAL_BASE_URL=http://localhost:3000
```

Seed pins at least:

- Club name / branding (e.g. “Portland Table Tennis Club”)
- System config needed for payments/check-in screenshots
- Payment plans / rates used in Player payment scenarios
- Demo users: `tutorial-player@…`, `tutorial-organizer@…`, `tutorial-admin@…` (+ enough roster for tournament scenarios)
- Deterministic sample tournaments/payments only as required by capture scripts

Reuse ideas from `seedRoleTutorialUsers.ts` and `setupNewDatabase.ts` / Supabase initial setup, but **dedicated** and **destructive reset** on tutorial DB only.

---

## 7. Capture pipeline

### 7.1 Orchestrator behavior

- Fixed desktop viewport (e.g. 1440×900); optional second pass `TUTORIAL_MOBILE=1` with a phone viewport writing `assets/<slug>/mobile/`.
- For each scenario module: run steps → screenshot → compute hotspot from selector/locator → write PNG + JSON.
- On error: log, mark failed, **continue** remaining scenarios.
- Exit non-zero if any failed (so humans notice); still emit partial successes.
- Full regenerate of that scenario’s assets/JSON when it runs successfully.

### 7.2 Scenario module sketch

```ts
// server/scripts/tutorials/scenarios/player-payment-checkin.ts
export const scenario = {
  slug: 'player-payment-checkin',
  role: 'player',
  title: 'Pay and check in',
  description: '…',
  relatedSlugs: ['admin-payment-settings'],
  steps: [
    {
      id: 'login',
      title: 'Sign in',
      body: '…',
      actionHint: 'Click Sign in',
      capture: async (ctx) => {
        await ctx.loginAs('tutorial-player@spin-master.local');
        // leave page on login success screen OR capture login form before submit
        return { hotspot: await ctx.hotspotFor('button[type="submit"]') };
      },
    },
    // …
  ],
};
```

Exact login/order of screenshots is per-scenario design work during implementation.

---

## 8. v1 scenario catalog (proposed slugs)

Grouped by role. Titles are draft; prose written in scenario modules at implementation time.

### Player (payments-focused)

| Slug | Intent |
|------|--------|
| `player-sign-in` | Login → Players home (player chrome) |
| `player-payment-checkin` | Plan/payment gate → pay/unlock → check in |
| `player-checkout-or-status` | See attendance / check-out or day status (if product supports) |

### Organizer

| Slug | Intent |
|------|--------|
| `organizer-sign-in` | Login → organizer toolbar |
| `organizer-create-tournament-immediate` | Wizard → create now (one primary format, e.g. RR or Playoff) |
| `organizer-player-selection` | Shared player picker steps |
| `organizer-prereg-finalize` | Pre-registration → finalize / cancel |
| `organizer-day-of-scoring` | Enter scores / schedule / print entry points |
| `organizer-abandon` | Abandon flow |
| `organizer-early-complete` | Early completion |
| `organizer-score-correction` | Correct a score |

*(Additional format-specific scenarios can split later: multi-RR, prelim+final, Swiss, compound stop.)*

### Administrator

| Slug | Intent |
|------|--------|
| `admin-sign-in` | Login → admin chrome |
| `admin-system-settings` | Gear → System Settings overview |
| `admin-payment-settings` | Payment-related system/club settings |
| `admin-members-toolbar` | Players admin toolbar (+ Player, roles, etc.) |

**v1 ship bar:** catalog + player shell working; **at least one end-to-end captured scenario per role** (Player payment, Organizer create or day-of, Admin settings); expand catalog incrementally.

Legacy organizer HTML had many tournament scenarios — treat as **content backlog**, not a single launch blocker.

---

## 9. Implementation phases

### Phase 0 — Prep (docs only; this document)

- [x] Design approved
- [x] Plan written (`docs/INTERACTIVE_ROLE_TUTORIALS_PLAN.md`)
- [x] Empty local DB `spin_master_tutorials` created (Postgres); wire `DATABASE_URL_TUTORIAL` in `server/.env` when implementing (not written this session)

### Phase 1 — Static player (no capture yet)

- Replace `index.html` with role catalog driven by `catalog.json`
- Add `play.html` + `tutorial-player.js` (hotspot %, Continue warn, loading local JSON)
- Add 1–2 **hand-authored** sample scenario JSON + placeholder or one manually dropped PNG to prove UX
- Keep old HTML pages until Phase 3 cutover, or hide links from new index

### Phase 2 — Tutorial DB + seed/reset

- `DATABASE_URL_TUTORIAL` in `env.example` (documented)
- `tutorials:reset-seed` with safety checks
- Pin club + payment config + demo users + minimal roster

### Phase 3 — Capture orchestrator

- Browser helpers (from existing `captureRoleTutorialScreenshots.ts`)
- One real scenario captured end-to-end
- Fail-continue report; npm scripts; maintainer section on `index.html`
- Remove old capture/seed scripts and old long HTML when new path is usable

### Phase 4 — Fill v1 catalog

- Implement remaining Player payment + Admin + Organizer scenarios from §8
- Optional mobile pass if low-cost
- Short note in `docs/USER_GUIDE.md` or SETUP pointing at `/role-tutorials/` (known URL; no in-app link)

---

## 10. Cutover checklist

1. [x] New `index.html` / `play.html` / JS / CSS live under `/role-tutorials/`.
2. [x] Captured scenarios per role (49 total: ~10 player, ~20 organizer, ~19 admin).
3. [x] Deleted legacy role HTML + flat assets.
4. [x] Deleted old seed/capture scripts; npm scripts are `tutorials:*`.
5. [x] SPA redirect unchanged (`/role-tutorials` → `index.html`).
6. [x] Capture/reset refuse non-tutorial DB names via `assertTutorialDatabaseUrl`.

---

## 11. Risks

| Risk | Mitigation |
|------|------------|
| Selector flake | Pinned seed; role-stable demo emails; per-scenario continue |
| Wrong DB wiped | Dedicated env + refuse prod/dev URL |
| Hotspot misaligned | % of screenshot; playback uses image content box |
| Huge PNG git noise | Keep viewport fixed; compress PNGs lightly if needed |
| Scope explosion (all tournament formats) | v1 ship bar in §8; backlog the rest |

---

## 12. Explicit non-actions (until implementation authorized)

Per maintainer instruction for the planning pass:

- Do **not** modify application TypeScript/React source for this feature yet.
- Do **not** delete existing `role-tutorials` assets/scripts yet.
- Do **not** auto-commit.

When ready to build: authorize **Phase 1** (static player) or **Phases 1–3** together.

---

## 13. Reference: existing code to reuse (read-only notes)

| Existing | Reuse |
|----------|--------|
| `server/scripts/captureRoleTutorialScreenshots.ts` | Puppeteer login, Chrome path, wait helpers, branding set |
| `server/scripts/seedRoleTutorialUsers.ts` | Demo emails/password pattern |
| `client/src/App.tsx` `isRoleTutorialsPath` / `RoleTutorialsSpaRedirect` | Keep; no auth on static path |
| `client/public/role-tutorials/tutorial.css` | Visual starting point; extend for hotspot/warn |
| `DATABASE_URL_TEST` pattern in SETUP.md | Model for `DATABASE_URL_TUTORIAL` |
| Organizer HTML scenarios §5–20 | Backlog copy/intent for Phase 4 |

---

## 14. Approval record

- Design interview branches 1–7: **approved**
- This implementation plan: written for execution when source changes are allowed
- First implementation slice recommended: **Phase 1 + Phase 2 safety + one Phase 3 scenario** (`player-payment-checkin` or `admin-system-settings`)
