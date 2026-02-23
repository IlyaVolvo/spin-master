# Spin Master — User Guide

## 1) Login and first access
1. Open the app URL.
2. Sign in with email + password.
3. If your account is marked for reset, set a new password on first login.

### Password reset
- Use **Forgot Password** on the login page.
- Reset tokens expire and are one-time use.

## 2) Main pages
- **Players**: members table, add/edit member, quick actions (match/tournament entry by role).
- **Tournaments**: active/completed tournaments and match management.
- **Statistics**: rating trend and performance summaries.
- **History**: match/rating history views.

## 3) Roles and permissions

### Player / Coach
- View data across the system.
- Edit own profile fields.
- Change own password.
- Cannot manage other members.

### Organizer
- Everything Player/Coach can do, plus:
- Create/manage tournaments.
- Enter/edit tournament match results.

### Admin
- Everything Organizer can do, plus:
- Edit any member profile.
- Manage active status and roles.
- Reset member passwords.

## 4) Member management (Players page)

### Add member
Admins can add members with required fields:
- First Name
- Last Name
- Email
- Birth Date
- Gender

Optional fields:
- Rating
- Phone
- Address
- Picture URL

### Edit member
- Admins can edit any member.
- Non-admin users can edit only their own profile.

## 5) Validation rules you will see in UI

### Birth date
- Must be in allowed range.
- Out-of-range date shows an inline red error under the field.

### Email
- Must be a valid email format.

### Phone
- Must be a valid **US phone number** (if provided).

### Rating
- Must be an integer from `0` to `9999` (or empty).
- Ratings outside `800..2100` trigger a **confirmation popup**:
  - **Confirm**: keep new value.
  - **Cancel**: revert to previous value.

## 6) Tournaments

Depending on role and configuration, users can create and run:
- Round Robin
- Playoff
- Preliminary + Final formats
- Swiss
- Single Match

General flow:
1. Select tournament type.
2. Select players.
3. Complete type-specific setup steps (grouping/bracket settings).
4. Create tournament.
5. Record matches.
6. Complete tournament.

## 7) Match entry
- Organizers (and Admins) can record match results directly.
- For player-level self-service match flows, the app may require opponent verification depending on route/flow.

## 8) CSV import/export (Players)

### Export
- Exports selected player records to CSV.

### Import
- CSV parser validates:
  - email
  - birth date
  - US phone number
  - rating (`0..9999` integer or empty)
- Invalid rows are skipped with row-level error messages.

## 9) Troubleshooting
- If Save is blocked, check inline field errors.
- If rating change does not persist, verify suspicious-rating popup confirmation.
- If import fails, review row-level CSV errors and fix data format.

## 10) Quick FAQ

**Q: Why can’t I edit another user?**  
A: Only Admins can edit other members.

**Q: Why did my rating revert?**  
A: You likely canceled the suspicious-rating confirmation popup.

**Q: Why is phone rejected?**  
A: Phone validation enforces US format.

