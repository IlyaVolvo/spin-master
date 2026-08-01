# Club hours and auto-checkout

Permanent product/engineering description of club open/close hours, how they appear to members, midnight auto-checkout, and admin “close club.”

Related code (as implemented or planned):

| Area | Location |
|------|----------|
| Branding / hours config | `server/src/services/systemConfigService.ts`, `client/src/utils/systemConfig.ts` |
| Club-local calendar day | `server/src/utils/clubDate.ts` (`getClubDate`, day bounds) |
| Hours resolution | `server/src/utils/clubHours.ts` (resolve effective hours + close instant) |
| Auto-checkout | `server/src/payments/autoCheckout.ts` |
| Cron | `POST /api/club/cron/auto-checkout` |
| Admin close club | `POST /api/club/admin/close-club` |
| System Settings UI | `client/src/components/SystemSettings.tsx` |
| Header hours | `client/src/App.tsx` (beside club name) |
| Attendance Log | `client/src/components/AttendanceLogAdmin.tsx` |

Timezone for all wall-clock and calendar-day logic is `branding.clubTimezone` (IANA).

---

## Concepts

### Club date

A visit’s **club date** is the calendar day `YYYY-MM-DD` in the club timezone when the visit belongs (written at check-in via `getClubDate()`). It is not the UTC date of the check-in timestamp.

### Open / close hours

Hours are **same calendar day only** (no overnight spans). If play continues past midnight, that is modeled as the **next day’s open** time, not a close after midnight on the previous day.

Each day is either:

- **Closed**, or
- **Open** with `open` and `close` as `HH:mm` where `open < close` on that day.

### Weekly defaults vs overrides

1. **Weekly hours** — one schedule per weekday (Mon–Sun).
2. **Hour overrides** — a **single calendar date** that replaces that day’s weekly default, with optional **comment** (holiday, early close, etc.).

Effective hours for a club date = override for that date if present, else the weekday default.

---

## Config shape (`branding`)

Stored in system config JSON (`SystemConfig.branding`):

```ts
type DayHours =
  | { closed: true }
  | { closed: false; open: string; close: string }; // HH:mm

type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

branding: {
  clubName: string | null;
  clubTimezone: string;
  weeklyHours: Record<Weekday, DayHours>;
  hourOverrides: Array<{
    date: string; // YYYY-MM-DD
    hours: DayHours;
    comment: string | null;
  }>;
}
```

Validation:

- Valid IANA `clubTimezone` (existing rule).
- Times `HH:mm`; when not closed, `open < close`.
- Override dates unique.

### Close instant used for auto-checkout

For a given club date `ymd`:

1. Resolve effective hours for `ymd`.
2. If open with a close time → UTC instant of that club-local `close` on `ymd`.
3. If closed (or close missing) → fallback: club-local **start of the next calendar day** (so stale open visits still get a deterministic checkout stamp).

---

## Who sees hours

| Audience | Where | What |
|----------|--------|------|
| All logged-in users | App header, **to the right of the club name** | Today’s effective hours (e.g. `9:00a–10:00p` or `Closed`). If today has an override **comment**, show it (inline or tooltip). |
| Admins | System Configuration | Edit weekly hours + overrides. |

Public results pages do **not** show club hours (out of scope unless added later).

---

## System Configuration UI

Under **Club name** (branding area; timezone remains in that area):

- Collapsible section **“Open / Close hours”**, **default collapsed**.
- Seven weekday rows: Closed toggle + open/close inputs.
- Overrides list: add / edit / remove by date, hours or closed, comment.

---

## Auto-checkout

### Purpose

Close visits left open after the club day ends, with `checkOutAt` equal to that day’s **configured close time** (not “when the cron happened to run”).

### When it runs

External cron calls `POST /api/club/cron/auto-checkout` (authenticated with `x-club-cron-secret` / `CLUB_CRON_SECRET` when configured). Intended cadence: at or after **club-local midnight** (same operational window as other midnight jobs).

### Behavior

1. Consider open visits: `checkOutAt IS NULL`, `rejectedAt IS NULL`.
2. Default path: `clubDate` **strictly before** today’s club-local date (all stale days, not only yesterday).
3. Optional body `{ "clubDate": "YYYY-MM-DD" }` — close open visits for that day only.
4. For each visit (grouped by `clubDate`): set  
   - `checkOutAt` = close instant for that `clubDate` (see above)  
   - `closedBy` = `AUTO`
5. Do **not** use one shared `now` timestamp for all rows when days differ.

### `closedBy` values

| Value | Meaning |
|-------|---------|
| `AUTO` | Club close: midnight auto-checkout **or** admin bulk “close club” |
| `SCAN` / `MANUAL` | Individual checkout (member self-service or staff toggle) — unchanged |

Attendance Log status tooltip for `AUTO` may note club close.

---

## Admin: close club

Admins can check out **everyone still present** without waiting for midnight.

- Endpoint: `POST /api/club/admin/close-club`
- Body: `{ "password": "<admin login password>", "checkOutAt"?: "<ISO datetime>" }` — **password required**; `checkOutAt` defaults to now and may be before or after that day’s scheduled close.
- Closes all open non-rejected visits (`checkOutAt: null`).
- Sets `closedBy: AUTO` (same as scheduled club close).
- UI: Attendance Log — “Close club” with optional datetime and confirmation; returns closed count.

---

## Operational notes

- Cron must be scheduled in production; enabling the route alone does not fire on a timer inside the app.
- Startup auto-run of auto-checkout remains optional/off unless explicitly wired.
- Club date filters and “present today” continue to use `clubDate` / open visits; hours config does not replace those fields.

---

## Out of scope (current)

- Overnight close on the same “session” spanning two calendar dates
- Publishing hours on public results / marketing pages
- Changing meaning of individual `SCAN` / `MANUAL` checkouts
