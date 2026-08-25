# Manual test plan: Hosts

End-to-end checks for scheduling, claim, perks, and **host email reminders / no-show**. Use with [HOST_FEATURE_ADMIN.md](./HOST_FEATURE_ADMIN.md). Unit coverage for window and email math lives under `server/tests/unit/payments/` (`hostPerkMath`, `hostEmailMath`, `hostEmails`, `listCheckInOptions`).

---

## Environment

| Item | Notes |
|------|--------|
| Client / API | Local Vite + `tsx watch` (or your usual ports) |
| Club date / timezone | **System Configuration** → Club Timezone; slots use club-local wall times |
| SMTP | Required for email cases (`SMTP_HOST`, `SMTP_FROM` or `SMTP_USER`, etc.) |
| Cron (optional) | `POST /api/club/cron/host-emails` with `x-club-cron-secret` if `CLUB_CRON_SECRET` is set |
| In-process tick | About once per minute; disable with `HOST_EMAIL_SCHEDULER=0` |

Prefer a dedicated test host member with a real inbox you can read, plus at least one **Admin** with email.

---

## Config checklist (System Configuration → Hosts)

Confirm the **Hosts** section sits **between Payments and Core Settings**, then set:

| Field | Suggested for tests |
|-------|---------------------|
| Host grace period | 30 (or leave default) |
| Host reminder emails | on |
| Minutes before slot start | short for live waits (e.g. **2**) or use DB/cron shortcuts below |
| Host no-show emails to Admins | on |
| Minutes after slot start | short (e.g. **1** or **2**) |

Save System Configuration. Confirm Payment Plans no longer has a Hosts settings block (Host **perks** still live on each plan).

---

## A. Schedule and board

| # | Steps | Expect |
|---|--------|--------|
| A1 | Admin → Hosts: add catalog slots if empty | Slots appear on the week grid every day |
| A2 | Assign an active member to today for one slot; leave another empty | Assigned name + **not claimed**; empty stays **empty** |
| A3 | Open header host strip / Me | Same slots; assignee sees Claim only while claimable |
| A4 | Custom time range for today | Appears on board; assignable |
| A5 | Repeat weeks on a catalog cell | Week 0 set; later empty weeks filled; weeks that already have a host skipped |

---

## B. Check in as host (claim)

| # | Steps | Expect |
|---|--------|--------|
| B1 | As assigned host, before/during duty, open self or kiosk check-in | **Check in as host (…)** is first when claimable |
| B2 | Choose host check-in without a visit yet | Check-in then claim (or error → check-in → claim); shift becomes **claimed**; perk pending or applied |
| B3 | Regular admission while assigned and claimable | Still available; host option remains until claimed / window closes |
| B4 | After claim, open check-in again | Host option gone for that shift |
| B5 | After slot end (and past start+grace if shorter), try claim | Host option gone; Admin can still assign retrospectively |

---

## C. Host Perks

| # | Steps | Expect |
|---|--------|--------|
| C1 | TIME plan with Host perks days = 1; host claims with CURRENT TIME | Grant **applied**; `validTo` extended ~1 day; future TIME chain shifted if any |
| C2 | VISIT pack with Host perks visits = 1; claim | Visits remaining/total +1; grant applied |
| C3 | Claim with no CURRENT TIME/VISIT plan | Grant **pending**; later purchase/promote applies it |
| C4 | Reassign after prior host already got a grant | Prior grant unchanged; new member can get their own |

---

## D. Host reminder email

| # | Steps | Expect |
|---|--------|--------|
| D1 | Assign host with email to a slot starting soon; reminder on; minutes before = short | Host receives one reminder in the window before start; subject mentions host reminder / time range |
| D2 | Wait past slot start without having entered the reminder window | No reminder after start |
| D3 | Same shift already reminded (or `reminderEmailedAt` set) | No second reminder |
| D4 | Host with no email | Reminder skipped; shift still marked so it does not retry forever |
| D5 | Unassigned slot | No reminder |
| D6 | Reminder emails off in System Configuration | No reminder |
| D7 | Reassign to a different host with email after a reminder was sent | New host can get a reminder (markers cleared on reassignment) |

**Shortcut:** set a future start a few minutes out, or call `POST /api/club/cron/host-emails` once the wall clock is inside the reminder window.

---

## E. No-show email to Admins

| # | Steps | Expect |
|---|--------|--------|
| E1 | Assigned host does **not** check in or claim; wait until start + no-show minutes | Each active Admin with email gets one no-show message |
| E2 | Host checks in before the no-show cutoff (or claims) | No no-show email |
| E3 | Host checked in earlier that club day and is still present at start | Counts as arrived; no no-show |
| E4 | Host checked out before slot start and never returns | No-show still fires |
| E5 | Empty cell | No no-show email |
| E6 | No Admin emails | Skipped; no crash |
| E7 | No-show emails off | No Admin mail |
| E8 | After no-show sent, same shift | No duplicate |

**Shortcut:** assign a past-due start on today’s club date (or wait), ensure `claimedAt` null and no qualifying visit, then run the cron or wait for the minute tick.

---

## F. Config placement and save isolation

| # | Steps | Expect |
|---|--------|--------|
| F1 | System Configuration page order | … → **Payments** → **Hosts** → **Core Settings** → … |
| F2 | Change host minutes; Save System Configuration | Values persist after reload |
| F3 | Change only Payment Plans settings; Save | Host email/grace values unchanged |
| F4 | Payment Plans page | No Hosts settings section; plan **Host perks** still editable on a plan |

---

## DB / API notes (optional)

| Table / field | Use |
|---------------|-----|
| `host_shifts.reminderEmailedAt` | Set/clear to retest reminder once |
| `host_shifts.noShowEmailedAt` | Set/clear to retest no-show once |
| `host_shifts.claimedAt` / `claimedVisitId` | Clear to reopen claim; set to simulate claim |
| `club_visits` for host `memberId` + `clubDate` | Control “arrived” for no-show |
| `system_config.payments` JSON | `hostGraceMinutes`, `hostReminderEmailEnabled`, `hostReminderMinutesBeforeStart`, `hostNoShowEmailEnabled`, `hostNoShowMinutesAfterStart` |

```bash
# Backup cron trigger
curl -sS -X POST http://localhost:3001/api/club/cron/host-emails \
  -H "x-club-cron-secret: $CLUB_CRON_SECRET"
```

---

## Pass criteria

- Schedule, claim, and board behave as in sections A–B.
- Perks apply or bank as in C.
- Reminder and no-show emails match D–E with SMTP configured.
- Hosts settings live under System Configuration between Payments and Core Settings (F).
