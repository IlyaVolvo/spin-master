# Manual test plan: private and group lessons

End-to-end checks for **private (individual) lessons** and **group classes**. Unit coverage lives under `server/tests/unit/` (`individualLessonService`, `groupClassService`, `groupClassWorkflow`, `busyTimeService`, `lessonTime`, `coachCalendarGrid`).

Use these four local members. Confirm they exist before starting; create or enable them if a row is missing.

| Person | Role in this plan | Typical login |
|--------|-------------------|---------------|
| **Ilya Volvovski** | Coach (creator). Use an Admin session when a step says Admin. | `ilya@volvovski.com` (local password, often `sobaka`) |
| **Demi von Smash** | Second coach (invitee, second calendar) | Look up her member email |
| **Polly Wordlot** | Player A (first to book / designated seat) | Look up her member email |
| **Amy Turner** | Player B (second book, waitlist, rating/age misses) | Look up her member email |

Lookup:

```sql
SELECT id, email, "firstName", "lastName", roles, rating, "birthDate", "isActive"
FROM members
WHERE ("firstName", "lastName") IN
  (('Ilya','Volvovski'),('Demi','von Smash'),('Polly','Wordlot'),('Amy','Turner'));

SELECT id, "memberId", "teachingActive", "hourlyRateCents", "studentRatingMin", "studentRatingMax"
FROM coach_profiles
WHERE "memberId" IN (
  SELECT id FROM members
  WHERE ("firstName", "lastName") IN (('Ilya','Volvovski'),('Demi','von Smash'))
);
```

Ilya and Demi need `COACH` (or equivalent) plus an active `coach_profiles` row with `teachingActive = true`. Polly and Amy need `PLAYER` and `isActive = true`. Give Polly a rating in a mid band (e.g. 1200) and Amy a lower rating (e.g. 400) so rating-filter cases are visible. Set birth dates if you will test age limits.

---

## Environment

| Item | Notes |
|------|--------|
| Client / API | Local Vite + API (`tsx watch`), usual ports |
| Club hours | Default Mon–Fri **10:00–22:00**, Sat–Sun closed — paint and class times inside weekday hours |
| Lessons config | **Admin → System Configuration → Lessons**: durations 30/60/90/120, student cancel **24h**, coach cancel **2h**, designated hold **3 days**, occurrence deadline **24h**, edit session **10 min** |
| Cron | `POST /api/club/cron/group-class-jobs` (header `x-club-cron-secret` if `CLUB_CRON_SECRET` is set). Also `POST /api/club/cron/lesson-reminders` for reminder mail |
| SMTP | Needed for invite, designated-seat, booked, cancelled, blast, and reminder emails |

Pick **future weekdays** (not today if you need cancel-window tests). Suggested grid:

| Who / what | When |
|------------|------|
| Ilya private availability | Next Monday **16:00–18:00** |
| Demi private availability | Next Monday **18:00–20:00** |
| Shared group class | Next Wednesday **17:00**, 60 min |

Do not overlap Ilya’s private window with the group class on the same coach.

---

## 0. Accounts and teaching profiles

| # | Steps | Expect |
|---|--------|--------|
| 0.1 | Sign in as Ilya. Open **Instructions → Teaching**. Set hourly rate (e.g. $60). Leave student rating blank (any player). Save | Rate shows on Teaching and on public coach page |
| 0.2 | Sign in as Demi. Same: Teaching rate e.g. $50. Optionally set student rating max **800** | Amy (400) can see Demi; Polly (1200) cannot see Demi once the band is on |
| 0.3 | Confirm Polly and Amy can open **Instructions → Find a lesson** | Week grid loads; coaches appear as columns when they have published time |

---

## A. Private lessons — availability

| # | Steps | Expect |
|---|--------|--------|
| A1 | Ilya: Teaching. Start **edit session**. Drag Monday 16:00–18:00. Commit / save | Green availability; booking is frozen for players while the session is active |
| A2 | Polly: Find a lesson, same week, Ilya’s column | Ilya’s 16:00–18:00 is **not** bookable (frozen message) until Ilya ends the session |
| A3 | Ilya: end edit session | Polly can select 60 min starting 16:00, 16:15, … 17:00 |
| A4 | Demi: paint Monday 18:00–20:00, end session | Polly sees Demi in a second column at 18:00–20:00 (if Demi’s rating band allows Polly) |
| A5 | Ilya: restrict the Monday window’s rating or age on the occurrence (if the editor exposes it), or set profile band 1000–1400 | Amy no longer sees Ilya’s times; Polly still does |
| A6 | Cancel one future occurrence vs cancel series from a date | That day (or all later copies) disappears from Polly’s search |

---

## B. Private lessons — book, clash, series

| # | Steps | Expect |
|---|--------|--------|
| B1 | Polly: Find a lesson. Select Ilya Monday **16:00–17:00**, 60 min. Confirm | Checkout starts (cash pending or online link). **My lessons** lists the time. Ilya’s Teaching shows Polly on that slot |
| B2 | Amy: try Ilya Monday **16:00–17:00** | Rejected — Ilya is busy with Polly |
| B3 | Amy: try Ilya Monday **17:00–18:00** (if still open and she passes rating/age) | Books. Both names on Ilya’s Monday |
| B4 | Polly: try Demi Monday **16:30–17:30** | Rejected — Polly is already in Ilya’s lesson (player busy) |
| B5 | Polly: book Demi Monday **18:00–19:00** | Succeeds. Two coaches, no overlap |
| B6 | Polly: reserve repeating Mondays 16:00 (2 or 4 weeks) on Ilya | Booked weeks appear; a week with no availability is skipped, not a hard fail |
| B7 | Open `/coaches/:ilyaCoachProfileId` logged out or as Polly | Public page shows Ilya’s open times; booking still requires login |

---

## C. Private lessons — cancel, pay, rate

| # | Steps | Expect |
|---|--------|--------|
| C1 | Polly cancels a lesson **≥ 24h** before start, with a reason | Slot frees; payment credited or pending cancelled; Ilya and Polly get cancel mail |
| C2 | Polly tries cancel under 24h before start | Error: student window closed. Admin (Ilya) can still cancel |
| C3 | Ilya cancels **≥ 2h** before start | Slot frees; Polly is refunded/credited |
| C4 | Ilya tries cancel under 2h before start | Error: coach window closed. Admin override still works |
| C5 | Amy tries to cancel Polly’s lesson | Not allowed |
| C6 | Ilya: Teaching / log of Polly’s confirmed lesson → reduce hourly rate | Price drops; cannot type a higher rate |
| C7 | Optional: set reminder hours on book; run `POST /api/club/cron/lesson-reminders` in the lead window | Reminder mail once, not after start |

---

## D. Group classes — Ilya only (no Demi)

| # | Steps | Expect |
|---|--------|--------|
| D1 | Ilya: **Instructions → Group classes**. Drag Wednesday 17:00, 60 min. Title e.g. `Wed clinic`. Min 2, max 2. 1 week. No extra coach. Create | Status **ACCEPTING**. Public link `/classes/:code`. Eligible players get blast mail |
| D2 | Polly: `/classes/:code` or My lessons / public class. Register Wednesday | ACCEPTED; checkout; Ilya’s group calendar shows 1/2 |
| D3 | Amy: register same occurrence without waitlist | Full — error |
| D4 | Amy: register with waitlist | WAITING. Not charged yet |
| D5 | Polly drops **≥ occurrence deadline hours** before start | Amy promoted to ACCEPTED, charged, promotion mail |
| D6 | Recreate a class, Polly registers, then Polly tries drop **inside** deadline | Player drop blocked. Ilya (creator) can cancel the occurrence; Polly refunded |

---

## E. Group classes — Ilya invites Demi

| # | Steps | Expect |
|---|--------|--------|
| E1 | Ilya creates a class with **Demi** as extra coach. Do not finalize | Status **PENDING**. Players cannot register yet. Demi gets invite mail with `/group-invites/:token` |
| E2 | Polly opens `/classes/:code` and tries register | Not open for registration |
| E3 | Demi: **Instructions → Invitations** (or email link). Accept | Status **ACCEPTING**. Demi’s Teaching/group calendar shows the class. Players can register |
| E4 | Create another PENDING class, invite Demi. Demi **denies** | Class still opens (no remaining INVITED). Only Ilya is coach. Demi is not busy for that time |
| E5 | Create another PENDING class, invite Demi. Ilya **finalizes** without waiting | Remaining invite marked declined; class ACCEPTING with Ilya only |
| E6 | PENDING class, Demi denies. Ilya adds Demi again as replacement | New invite mail. Demi can accept |
| E7 | Demi tries to finalize Ilya’s PENDING class | Blocked (not creator). Admin can finalize |
| E8 | After Demi accepted, Ilya books a private lesson on himself at the same Wednesday 17:00 | Conflict. Demi also cannot paint overlapping private time while ACCEPTED on the class |

---

## F. Designated seats and expiry

| # | Steps | Expect |
|---|--------|--------|
| F1 | Ilya creates ACCEPTING class, max 2, designate **Polly** (and not Amy). First session several days out | Polly has PENDING holds. Amy does not get those seats. Polly gets designated-seat mail (`/classes/:code?seat=token`) |
| F2 | Amy registers on an occurrence still held for Polly | She waitlists or is blocked until holds expire / Polly declines — seats count as taken while PENDING |
| F3 | Polly accepts reserved seat (app or email token) | PENDING → ACCEPTED; checkout for each held occurrence |
| F4 | Amy cannot accept Polly’s `seat` token | Not your reserved seat |
| F5 | New class, designate Polly, **do not** accept. Advance club date (or wait) to **3 days before first session**. Run `POST /api/club/cron/group-class-jobs` | Polly’s PENDING rows DROPPED; expired mail; Amy can take a seat; waitlist may promote |

Shortcut if you cannot wait:

```sql
-- Inspect holds
SELECT r.id, r.status, m."firstName", o."clubDate", o."startTime"
FROM group_class_registrations r
JOIN members m ON m.id = r."memberId"
JOIN group_class_occurrences o ON o.id = r."occurrenceId"
WHERE m."firstName" IN ('Polly','Amy');
```

Then run the cron, or temporarily set `lessons.designatedAcceptDaysBeforeFirst` to `0` and run cron (restore the config afterward).

---

## G. Below-min auto-cancel

| # | Steps | Expect |
|---|--------|--------|
| G1 | Class min **2**, max 4. Only Polly ACCEPTED (Amy not in). First session about **24h** out (occurrence deadline) | Class still listed |
| G2 | Run `POST /api/club/cron/group-class-jobs` at/after the deadline with fewer than min ACCEPTED | Occurrence cancelled; Polly refunded; cancel mail; Ilya’s calendar clears that block |
| G3 | Same setup but Polly **and** Amy ACCEPTED | Cron does **not** cancel that occurrence |

---

## H. Calendars, log, admin

| # | Steps | Expect |
|---|--------|--------|
| H1 | Ilya Teaching: sees Polly/Amy private lessons and group blocks; Demi’s accepted group time is busy on Demi | No double-book on the same coach |
| H2 | Demi Teaching: her private students + accepted group classes only (not Ilya-only PENDING invites) | Pending invite does not block Demi’s other teaching until she accepts |
| H3 | Polly **My lessons**: private with Ilya/Demi + group registrations (PENDING/ACCEPTED/WAITING) | Drop/cancel matches the rules in C and D |
| H4 | Amy **My lessons**: her bookings only | Polly’s lessons do not appear |
| H5 | Ilya Admin: **Instructions → Log** | CREATE / REGISTER / DROP / INVITE / FINALIZE / CANCEL rows for the classes just exercised |
| H6 | Admin cancel remaining weeks on a multi-week class | Later occurrences cancelled and refunded; `untilOn` pulled back |

---

## Safety

- Use the local DB only. Do not run destructive SQL against production.
- After rating-band and designated-hold config shortcuts, restore **System Configuration → Lessons**.
- Prefer extra future weeks so leftover test classes do not collide with the next run.
