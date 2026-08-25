# Hosts — administrator guide

This describes how **Hosts** works for an Admin. Membership, plans, check-in, and club-local dates are assumed.

Hosting is a scheduled duty. It does **not** replace regular admission. Host Perks are extra days or visits on the member’s **current** TIME or VISIT plan.

## Where to work

| Task | Where |
|------|--------|
| Schedule and assign hosts | Admin menu → **Hosts** |
| Host Perks amounts | Admin menu → **Payment Plans** → edit a plan → **Host perks** |
| Extra minutes after a short slot | **Payment Plans** → **Hosts** → **Host grace period** |
| Today’s hosts (everyone) | Header strip, and the **Me** page |

Only Admins can edit the slot catalog, grace minutes, plan perks, and assignments. The assignee list is **active members**.

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

## Today’s board

The header strip lists today’s catalog and custom slots (including empty). **Me** shows the same list in full. Assigned hosts see **Claim** / **I hosted** only while their slot is claimable.

## Typical Admin workflows

**Set up weekly coverage.** Add catalog slots. Assign members on the week grid. Use Repeat weeks to fill empty future weeks.

**Someone hosted but did not claim in time.** After grace, assign them on that past cell. Perks apply or bank as pending. Do not expect check-in as host to appear.

**Change perk size.** Edit the payment plan Host perks field. Already-applied grants keep the amounts recorded at apply time. New applies use the plan as it is then.

**Widen the claim window for short slots.** Increase Host grace minutes and save payments settings. Duty-length slots already stay open until they end.
