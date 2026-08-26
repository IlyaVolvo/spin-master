# Hosts — administrator guide

This describes how **Hosts** works for an Admin. Membership, plans, check-in, and club-local dates are assumed.

Hosting is a scheduled duty. It does **not** replace regular admission. Host Perks are extra days or visits on the member’s **current** TIME or VISIT plan.

## Where to work

| Task | Where |
|------|--------|
| Schedule and assign hosts | Admin menu → **Hosts** |
| Host Perks amounts | Admin menu → **Payment Plans** → edit a plan → **Host perks** |
| Claim grace + host emails | Admin menu → **System Configuration** → **Hosts** (between Payments and Core Settings) |
| Who is on duty right now | Club header pill, **Me** page label, and (optional) public Present board |

Only Admins can edit the slot catalog, grace minutes, plan perks, host emails, and assignments. The assignee list is **active members**.

## Slot catalog

A catalog slot is a repeating time range (for example 10:00–14:00), with an optional label. Catalog slots appear **every club day**, including days the club is closed.

Empty cells are allowed: a day can have a slot with nobody assigned.

Deactivating a catalog slot hides it from the week grid. Existing shifts already created for that range stay on the board as assigned history.

## Week grid

**Hosts** shows one week at a time (Monday–Sunday, club calendar). Click a cell to assign or clear a host.

- The **name** on the cell is who is assigned.
- Under the name: **empty**, **not claimed**, or **claimed**, plus **pending** or **applied** when a Host Perk grant exists for that shift (see Perks).

Assigning someone does **not** check them in and does **not** claim Host. That is a separate step.

The assignment picker has a search box. Custom time ranges use a closed dropdown; names appear when you open it.

### Repeat weeks

When assigning from a catalog cell, **Repeat weeks** fills that weekday and slot for N weeks:

- Week 0 (the cell you opened) is set to the chosen member (or Unassigned).
- Later weeks fill **empty** cells only. A week that already has a host is skipped.

### Custom time range

Use **Custom time range** for a one-off window that is not in the catalog (it may overlap catalog slots). You can leave it Unassigned or pick a member, and optionally repeat on following weeks the same way (later weeks skip if that exact range already has a host).

## Claim window (check in as host)

Claim is **explicit**. Admin assignment is not a claim.

The window is **that club day**, from midnight, until the later of **slot end** and **slot start + host grace minutes** (default 30). Hosts can claim while they are on duty.

Example: duty 10:00–14:00, grace 30 → claim is offered until **14:00**. A short 10:00–10:10 slot stays open until **10:30**.

A morning visit that day can still be used to claim an evening slot, as long as the claim window for that slot is still open.

After the window closes, only an Admin can attach a host (retrospective assign). The member cannot claim from check-in or from the today board.

### Where members claim

During the window, if they are the assigned host and have not already claimed this shift:

1. **Check-in** (self or kiosk): **Check in as host (…)**. When it is offered, it is the **first** choice. They still need a successful visit that club day (check in first, then claim, or claim as part of check-in depending on the flow).
2. After they have checked out: **I hosted** / **Claim** on the today board (header or Me), while the window is still open.

PIN kiosk can claim with the member’s score PIN (`pin-host-claim`).

## Host emails (reminders and no-show)

Configured under **System Configuration** → **Hosts**. SMTP must be working (`SMTP_HOST`, `SMTP_FROM` / `SMTP_USER`, etc.). The server checks about once a minute while it is running. External cron can also call `POST /api/club/cron/host-emails` (same `x-club-cron-secret` as other club crons when `CLUB_CRON_SECRET` is set). Set `HOST_EMAIL_SCHEDULER=0` to disable the in-process minute tick.

Each shift is emailed at most once for each kind of message. Reassigning the cell clears those markers so the new host can be reminded and a new no-show can fire if needed.

### Settings

| Setting | Default | Meaning |
|---------|---------|---------|
| Host reminder emails | on | Send a reminder to the assigned host |
| Minutes before slot start to email the host | 60 | Reminder window opens this many minutes before start; closes at slot start. **0** ≈ one minute before start |
| No-show notify emails | *(empty)* | Space- or comma-separated recipients. **Empty = nobody is emailed** |
| Minutes after slot start to treat as no-show | 15 | No-show fires at start + this many minutes. **0** means at slot start |

### Host reminder

If enabled, the assigned host is emailed once in the window from (start − minutes) until **slot start**.

- They must have a usable email on their member record.
- After slot start the reminder is **not** sent (even if it was never sent).
- No assignee → no reminder.
- Subject example: `Host reminder: 18:00–21:00 at {club name}`.

### No-show to Admins

Addresses in **No-show notify emails** are notified when the assigned host has **not arrived** by slot start + no-show minutes. Separate with spaces or commas. The list is independent of who has the Admin role: only those addresses receive the message. If the list is **empty**, nobody is emailed.

**Arrival** means any of:

- They claimed Host for that shift, or
- They have a successful (non-rejected) visit that club day and were still present at slot start (checked in earlier, not checked out before start), or
- They checked in at or after slot start.

Empty (unassigned) cells do not send this email. With an empty notify list, the no-show is skipped until recipients are configured.

Subject example: `Host did not arrive: {name} (18:00–21:00)`.

### Typical email workflows

**Remind hosts before duty.** Leave reminder emails on; set minutes before start (e.g. 60). Ensure hosts have emails.

**Alert designated people when someone does not show.** Add one or more addresses to **No-show notify emails**; set minutes after start (e.g. 15). Have the host check in (or claim) before that cutoff to avoid the alert.

**Turn no-show off.** Clear the notify list under System Configuration → Hosts and Save. Uncheck reminder emails separately if you want reminders off too.

## Host Perks

Each **Club Payment Plan** has a perk amount:

- TIME plan: days added to the current plan (`validTo`). A queued future TIME plan is shifted by the same number of days so it stays chained.
- VISIT pack: visits added to remaining and to total.

**1** means one day or one visit covering the day of duty. **0** still records the grant as applied and adds nothing.

The plan catalog itself is not changed. Only the member’s **current entitlement** (and a chained future TIME plan, if any) is updated.

### Grant statuses on a slot

| Status | Meaning |
|--------|---------|
| *(none)* | No perk row yet (typical while the claim window is still open and they have not claimed). |
| **pending** | A grant exists for this member+shift, but there is no current TIME/VISIT plan to apply it to. |
| **applied** | The grant is finished. Days/visits were added (or 0 if the plan’s perk is 0). |

**not claimed** vs **claimed** is independent: claimed means they used the explicit Host claim during the window. Admin assign after the window can create a **pending** or **applied** grant without a claim.

### When pending becomes applied

As soon as that member has a current YEARLY / MONTHLY / VISIT_PACK plan — already, or later when a plan is purchased, granted, or a future plan becomes current at club midnight. Applied is the final perk state. It does not go back to pending.

Two host shifts the same day can grant twice. Each grant is once per (shift, member).

### Reassignment

Replacing a host never reverses the previous member’s perks. The new assignee can still receive their own grant (including for a past slot, even if they were not present).

## Typical Admin workflows

### How to create the schedule

1. Open **Admin → Hosts**.
2. **Add catalog slots** (time ranges that repeat every club day). Optional labels help distinguish morning/evening.
3. On the **week grid**, click a cell and assign an active member (or leave Unassigned).
4. Use **Repeat weeks** when the same person covers that weekday going forward (later weeks skip cells that already have a host).
5. Use **Custom time range** for one-off windows that are not in the catalog.
6. To drop a catalog slot from the board, **Remove** it — it disappears from the catalog and week columns (existing assigned history for past cells is not wiped for perk/history reasons).

Assigning someone does **not** check them in and does **not** claim Host.

### Perks (define amounts)

1. Open **Admin → Payment Plans** → edit the TIME or VISIT plan hosts use.
2. Set **Host perks**: days for TIME plans, visits for VISIT packs (`1` = one day/visit for that duty; `0` still records applied with no add).
3. Save the plan. New claims/applies use the current plan value; already-applied grants keep the amount recorded at apply time.

See [Host Perks](#host-perks) for pending vs applied and reassignment rules.

### Notifications (reminders and no-show)

1. Open **System Configuration → Hosts**.
2. Turn **Host reminder emails** on/off and set minutes before slot start.
3. Set **No-show notify emails** (space- or comma-separated; empty = nobody) and minutes after slot start.
4. Ensure SMTP works and that hosts/Admins have emails on their member records.
5. Save. Each kind of message is sent at most once per shift (reassign clears markers for the new host).

See [Host emails](#host-emails-reminders-and-no-show) for arrival rules and typical settings.

### Other Admin tasks

**Someone hosted but did not claim in time.** After the claim window closes, assign them on that past cell. Perks apply or bank as pending. Do not expect check-in as host to appear.

**Widen the claim window for short slots.** Increase Host grace minutes in System Configuration → Hosts and save. Duty-length slots already stay open until they end.

**Clear or change an assignee.** Open the cell → Unassigned or pick another member. Prior host’s applied perks are never reversed.

## Typical Host workflows

Hosting does **not** replace normal admission. The host still needs a successful visit that club day.

### Before the slot

- Expect a **reminder email** (if enabled) in the window before slot start.
- Arrive and check in like any other visit (self check-in, kiosk, or Admin check-in).

### Claim Host during the window

While the claim window is open (that club day until the later of slot end and start + grace), if they are assigned and have not claimed yet:

1. Prefer **Check in as host (…)** when it appears at check-in (self or kiosk) — it is listed first when offered.
2. Or claim after check-in via the host claim path on check-in / PIN kiosk (`Claim` / host claim), while the window is still open.

Claim is **explicit**. Being assigned alone is not a claim.

### After claiming / while on duty

- Status on Admin’s week grid moves to **claimed** (and perk **pending** or **applied** when a grant exists).
- No-show email to Admins is avoided if they claimed or otherwise **arrived** by the no-show cutoff (see arrival rules under Host emails).
- Perks apply to their **current** TIME/VISIT plan when one exists; otherwise the grant stays **pending** until they have a current plan.

### Missed the claim window

The member cannot claim from check-in anymore. An Admin must assign (or re-assign) them on that cell for perks.

## User visibility

What different people see:

| Audience | What they see |
|----------|----------------|
| **Admin** | Full **Hosts** week grid and catalog; claim/perk status under each name; System Configuration → Hosts; plan Host perks fields. |
| **Assigned host** | Same on-duty labels as everyone else, plus **Check in as host** (and related claim) while their window is open. Reminder email if configured. |
| **Any signed-in member** | Compact **Host (…)** pill in the club header (name, Not arrived, or No assignment for the active slot). Same text on the **Me** page near Full app. Hidden when no slot is currently active. |
| **Public Present board** (if enabled) | **Host on duty** section during an active slot: arrived host name, Not arrived, or No assignment. Arrived hosts are omitted from the present-members list. |

There is no full “today’s schedule strip” for all slots in the main app header. The header and Me surfaces show **current on-duty** status only. The full week schedule and empty/future cells stay on **Admin → Hosts**.

## Related

- Manual end-to-end checklist: [HOST_FEATURE_USER_TEST_PLAN.md](./internal/HOST_FEATURE_USER_TEST_PLAN.md)
