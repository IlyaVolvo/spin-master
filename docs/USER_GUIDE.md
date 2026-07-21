# Spin Master — User Guide

## 1) Purpose of the application

Spin Master is a club and tournament management application for table tennis.

You can use it to:
- manage members and roles
- create tournaments in multiple formats
- record tournament and standalone match results
- track ratings over time
- review match history and statistics
- import and export player data

## 2) Login and first access

1. Open the application URL.
2. Sign in with your email and password.
3. If your account was newly created or marked for reset, you will be asked to set a new password.

### First-time invitation flow
- New users may receive an invitation email.
- The invitation link opens the same secure password setup flow used for password resets.
- The link is time-limited and intended for one-time use.

### Password reset
- Use **Forgot Password** on the login page if you cannot sign in.
- Password reset links expire and are one-time use.

## 3) Main screen navigation

The main navigation is available from the header.

### Players
Use this page to:
- browse the member table
- filter and search for members
- add or edit members
- activate or deactivate members
- start tournament creation by selecting players
- start standalone match recording
- import or export player records

### Tournaments
Use this page to:
- view active tournaments
- view completed tournaments
- expand schedules, participants, and format-specific details
- enter or edit match results
- review standings, bracket progress, and final results
- repeat an earlier tournament setup
- modify eligible tournament setups

### Statistics
Use this page to review player and rating trends, including performance summaries derived from recorded results.

### History
Use this page to inspect:
- match history
- opponent history
- rating history
- tournament and standalone match records in chronological context

### Top-right account area
From the top-right area you can:
- access your account settings
- log out
- view the small build/changeset identifier shown above the logout button

## 4) Roles and permissions

### Player / Coach
Players and coaches can:
- view application data
- edit their own profile fields
- change their own password

They cannot:
- edit other members
- manage roles
- create or administer tournaments unless they also have elevated roles

### Organizer
Organizers can do everything a Player/Coach can do, plus:
- create tournaments
- select participants
- manage tournament progress
- enter and edit tournament match results

### Admin
Admins can do everything an Organizer can do, plus:
- edit any member profile
- change member roles
- manage active status
- trigger password reset or invitation-style onboarding flows for members

## 5) Member management

## Add a member
Admins can create a member from the Players page.

Required fields:
- First Name
- Last Name
- Email
- Birth Date
- Gender
- At least one role

Optional fields:
- Rating
- Phone
- Address
- Picture URL

When a member is created:
- the account is created immediately
- a password setup email is sent
- the user completes password setup through the secure reset/invitation link

## Edit a member
- Admins can edit any member.
- Non-admin users can edit only their own profile.

Common editable fields include:
- name
- email
- gender
- birth date
- rating
- phone
- address
- roles
- active status

## Active and inactive members
- Inactive members stay in the system for historical accuracy.
- Only active members can be selected for new tournaments and new match entry.

## 6) Validation rules you may see in the UI

### Birth date
- Must be within the allowed date range.
- Invalid dates show inline validation feedback.

### Email
- Must be in valid email format.
- Duplicate member emails are rejected.

### Phone
- If provided, the phone number must be a valid **US phone number**.

### Rating
- Must be an integer from `0` to `9999`, or left empty.
- Ratings outside the expected range may trigger a confirmation dialog.

### Names
- Names must use valid characters and length according to the member validation rules.

## 7) Standalone match recording

In addition to tournaments, the application supports standalone matches.

Use this when you want to record a single match that is not part of a tournament.

Typical flow:
1. Go to **Players**.
2. Start match recording.
3. Select the two players.
4. Enter the set score or forfeit result.
5. Save the match.

Standalone matches appear in historical views and contribute to rating history where applicable.

## 8) Tournament creation overview

Tournament creation is driven from the Players page.

General flow:
1. Click to start tournament creation.
2. Select a tournament type.
3. Optionally enter a tournament name.
4. Select the participating active players.
5. Continue to the format-specific setup wizard.
6. Review the generated structure.
7. Create the tournament.
8. You will be taken to the Tournaments page after creation.

### Selection behavior
- Only active players can be selected.
- The app shows the number of selected players.
- Some formats have minimum and maximum participant limits.
- You can use **Select All** and **Deselect All** during participant selection.

## 9) Tournament types

The application currently supports the following tournament formats.

### Round Robin
Best for smaller groups where every participant should play every other participant.

Characteristics:
- every player plays all other players once
- standings are based on recorded results
- useful for complete group play

Typical use cases:
- club nights
- small divisions
- final groups

### Playoff / Bracket
Best for elimination-style events.

Characteristics:
- seeded bracket structure
- winners advance through the bracket
- supports bracket preview before creation

Typical use cases:
- knockout events
- final championship stage

### Multi Round Robin
Best when you want several separate round-robin groups instead of one large all-play-all tournament.

Characteristics:
- players are split into multiple groups
- each group becomes its own round-robin tournament
- useful when one full round robin would be too large

### Preliminary + Final Round Robin
Best when you want a qualifying stage and then a final all-play-all stage.

Characteristics:
- players first compete in preliminary round-robin groups
- top qualifiers advance to a final round-robin group
- can support auto-qualified players directly into the final stage

### Preliminary + Final Playoff
Best when you want qualifying groups followed by a knockout finish.

Characteristics:
- players first compete in preliminary round-robin groups
- top qualifiers advance to a final playoff bracket
- can support auto-qualified players directly into the final stage

### Swiss System
Best for larger events where you want multiple rounds without eliminating players early.

Characteristics:
- players are paired round by round based on performance
- not every player meets every other player
- the number of rounds is configurable
- a meaningful Swiss event requires more participants than a small round robin

## 10) Tournament type participant requirements

Current creation rules include:
- **Round Robin**: minimum 3 players in the creation flow
- **Playoff / Bracket**: minimum 6 players
- **Multi Round Robin**: minimum 6 players
- **Preliminary + Final Round Robin**: minimum 8 players
- **Preliminary + Final Playoff**: minimum 8 players
- **Swiss**: minimum 6 players

Some formats also enforce upper limits or format-specific constraints in their setup wizard.

## 11) Tournament creation details by format

### Round Robin creation
After player selection:
- review the selected participants
- confirm the setup
- create the tournament

The system then generates the full all-play-all schedule.

### Playoff creation
After player selection:
- the app generates a bracket preview
- seeding and bracket positions can be reviewed
- you then confirm and create the tournament

### Multi Round Robin creation
After player selection:
- define or review group structure
- confirm group assignments
- create the set of round-robin groups

### Preliminary formats creation
After player selection:
- choose the preliminary configuration
- confirm groups and final-stage settings
- create the compound tournament structure

These formats create a parent tournament with child tournaments for the preliminary and final stages.

### Swiss creation
After player selection:
- choose the number of rounds
- review the setup
- create the tournament

The app will then manage pairings round by round.

## 12) Running a tournament

Once a tournament is active, go to the **Tournaments** page to manage it.

Depending on the format, you may see:
- participant list
- generated schedule
- standings table
- bracket progression
- current round information
- compound tournament hierarchy

### Entering results
Organizers and Admins can:
- open a match
- enter set scores
- record forfeits where supported
- save or correct results

### Tournament progress
As results are entered, the app updates:
- played match counts
- standings or bracket advancement
- tournament completion status
- rating-related data when applicable

## 13) Repeating or modifying a tournament

From the Tournaments page, you can reuse existing setups in supported flows.

Typical uses:
- repeat a recurring event with the same participant pool
- modify a tournament setup before re-running it

The app reopens the creation flow with existing context where supported.

## 14) Ratings and ranking behavior

Ratings are central to the application and are used in several places.

### What ratings are used for
- player ordering and ranking views
- bracket seeding in elimination formats
- snapshotting player strength at tournament start
- match and tournament history review

### Rating snapshots
When a player enters a tournament, the app stores their rating at that time as a historical snapshot.

This means:
- later rating changes do not rewrite past tournament entry ratings
- tournament history remains historically accurate

### Rating changes
Depending on the tournament or match type, the application calculates rating effects when results are completed.

In general:
- played results can affect ratings
- forfeits and byes may be treated differently from normal played matches
- some tournament types calculate ratings per match
- rankings in many user-facing lists are derived from ratings rather than stored separately

### Reading rating history
History and statistics views help you answer questions such as:
- what was a player’s rating before and after a match
- how much a match changed a rating
- how a player’s rating progressed over time

## 15) Statistics and history

### Statistics page
Use the Statistics page for high-level performance review.

Typical uses:
- trend monitoring
- rating progression review
- comparative performance summaries

### History page
Use the History page when you need detail.

Typical uses:
- review a member’s match list
- inspect head-to-head results
- view chronological rating changes
- compare tournament matches and standalone matches

## 16) CSV import and export

CSV tools are available from the Players page.

### Export
Export creates a CSV file containing player/member data for reuse outside the app.

Typical exported fields include:
- first name
- last name
- email
- date of birth
- gender
- roles
- phone
- address
- rating

### Import
Import accepts a CSV upload and validates rows before creating members.

**Header row (optional):** If the first non-empty line looks like a column header, it is used to map columns by name. The parser treats that line as a header when it contains the labels `firstname`, `lastname`, `email`, and either `birthdate` or `date of birth`, and when no cell on that line looks like an email address (so a normal data row is not mistaken for a header).

**No header row:** If the first line is not recognized as a header, every line is treated as a data row. Columns are then read in the **same order as export**:

1. `firstname`  
2. `lastname`  
3. `email`  
4. `date of birth`  
5. `gender`  
6. `roles`  
7. `phone`  
8. `address`  
9. `rating`  

When you use a header row, required columns are still:

- `firstname`
- `lastname`
- `email`
- `date of birth` or `birthdate`

Optional columns (by header name or, without a header, by position above) include:

- `gender`
- `roles`
- `phone`
- `address`
- `rating`

### Import behavior
- the selected CSV file is uploaded to the server
- the server parses and validates the file
- valid rows are imported
- invalid rows are reported with row-level errors
- successfully created imported users receive invitation-style password setup emails

### Import validation checks
- valid email format
- valid birth date
- valid US phone number if provided
- valid rating from `0` to `9999` if provided
- duplicate member checks by email and name

## 17) Common screens and workflow tips

### Players page tips
- Use filters to narrow the list before selecting players.
- Only active players can be added to new competitions.
- During tournament creation, filters stay available to help with participant selection.

### Tournaments page tips
- Expand details to see schedule and participant information.
- Use active/completed sections to separate work-in-progress from historical review.
- Completed tournaments remain available for audit and reporting.

### History page tips
- Use it when you need exact rating-before and rating-after context.

## 18) Troubleshooting

### I cannot save a member
- Check inline validation errors.
- Verify required fields are present.
- Confirm the email is unique and correctly formatted.

### I cannot select a player for a tournament
- The member may be inactive.
- Only active players can be selected.

### Import fails
- If you use a header row, check that the first line includes the expected column names (`firstname`, `lastname`, `email`, and `birthdate` or `date of birth`).
- If you omit the header, confirm columns follow the export order (see **No header row** above).
- Review row-level validation errors.
- Confirm birth dates, email format, phone format, and ratings.

### A new member did not receive an email immediately
- Check the member email address in the record.
- Check SMTP configuration and server logs.
- Review spam or delayed delivery behavior in the recipient mailbox.

### My rating or ranking looks unexpected
- Check whether the result was saved as a played match, forfeit, or bye.
- Use the History page to review rating-before and rating-after details.

## 19) Quick FAQ

**Q: Why can’t I edit another user?**  
A: Only Admins can edit other members.

**Q: Why can’t I add an inactive player to a tournament?**  
A: Only active players can be selected for new tournaments and new match entry.

**Q: Why did my rating appear different in an older tournament?**  
A: Tournament entries store historical rating snapshots from the time the tournament was created.

**Q: Why does the app show both tournaments and standalone matches in history?**  
A: The history views are designed to give a complete chronological picture of recorded competition.

**Q: Why is phone rejected?**  
A: Phone validation enforces US format.

