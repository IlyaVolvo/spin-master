# Ping Pong Tournament System - User Guide

Welcome to the Ping Pong Tournament System! This guide will help you navigate and use all the features available to you.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Login & Authentication](#login--authentication)
3. [Forgot Password](#forgot-password)
4. [Player Profiles](#player-profiles)
5. [Tournaments](#tournaments)
6. [Statistics & History](#statistics--history)
7. [User Roles & Permissions](#user-roles--permissions)
8. [Frequently Asked Questions](#frequently-asked-questions)

---

## Getting Started

### First Time Login

1. Open your web browser and navigate to the application URL
2. You will see the login screen
3. Enter your email address and password
4. Click "Login"

**Default Password**: If you're a new user, your default password is `changeme`. You will be prompted to change it on your first login.

---

## Login & Authentication

### Logging In

1. Enter your **email address** in the Email field
2. Enter your **password** in the Password field
3. Click the **"Login"** button

### Password Requirements

- Minimum 6 characters
- Can contain letters, numbers, and special characters

### Changing Your Password

If you need to change your password:

1. Log in to your account
2. Navigate to the **Players** tab
3. Find your name in the player list
4. Click the **Settings icon (⚙️)** next to your name, or double-click on your name
5. Scroll down to the **"Change Password"** section
6. Enter your current password
7. Enter your new password
8. Confirm your new password
9. Click **"Change Password"**

**Note**: Only you can change your own password. Other users (including Admins) cannot see or change your password.

### Logging Out

1. Click the **"Logout"** button in the top-right corner of the screen
2. You will be returned to the login screen

---

## Forgot Password

If you've forgotten your password, you can reset it using the "Forgot Password" feature.

### Requesting a Password Reset

1. On the login screen, click **"Forgot Password?"** below the Login button
2. Enter your email address
3. Click **"Send Reset Token"**
4. A password reset token will be generated

**In Development Mode**: The reset token will be displayed on screen. Copy this token to use in the next step.

**In Production**: The reset token will be sent to your email address.

### Resetting Your Password

1. After receiving your reset token, click **"Reset Password"** (or close the dialog and click "Forgot Password?" again)
2. Enter your **email address**
3. Enter the **reset token** you received
4. Enter your **new password**
5. Confirm your new password
6. Click **"Reset Password"**
7. You will see a success message
8. Return to the login screen and log in with your new password

**Important**: 
- Reset tokens expire after 1 hour
- Each token can only be used once
- After resetting, you can log in immediately with your new password

---

## Player Profiles

The **Players** tab shows all members who have the "Player" role.

### Viewing Player Information

- **Name**: Player's full name
- **Rating**: Current USATT-style rating (higher = better)
- **Games Played**: Number of matches played (can be filtered by date range)
- **Status**: Active or Inactive players

### Filtering Games Played

You can filter the "Games Played" count by date range:

1. Click the dropdown next to "Games" in the table header
2. Select a date range option:
   - **All Time**: Shows all games ever played
   - **This Month**: Shows games from the current month
   - **This Year**: Shows games from the current year
   - **Custom Range**: Allows you to select a specific date range
3. For Custom Range:
   - Select a start date
   - Select an end date
   - Click **"OK"** to apply, or **"Cancel"** to discard
   - The selected range will be displayed below the dropdown

### Editing Your Profile

**You can edit your own profile**, or **Admins can edit any profile**:

1. Find the player you want to edit in the list
2. Look for the **Settings icon (⚙️)** next to their name
   - If you see the icon, you have permission to edit
   - If you don't see the icon, you don't have permission
3. Click the Settings icon, or **double-click** on the player's name
4. An edit form will appear with the following fields:
   - **First Name**
   - **Last Name**
   - **Birth Date**
   - **Email** (only you or an Admin can change)
   - **Gender**
   - **Phone Number**
   - **Address**
   - **Picture URL**
   - **Active Status** (Admins only)
5. Make your changes
6. Click **"Save Changes"** or **"Cancel"** to discard

**Note**: 
- The cursor will change to a pointer (hand) when hovering over editable names
- Non-editable names will show a regular arrow cursor
- Only you can change your own password (see "Changing Your Password" above)

### Viewing Player Statistics

1. Click on a player's name in the list
2. Select **"View Statistics"** from the menu
3. You'll see:
   - Rating history over time
   - Win/loss records
   - Tournament participation

### Viewing Player Match History

1. Click on a player's name in the list
2. Select **"View History"** from the menu
3. You'll see:
   - All matches played
   - Opponents
   - Scores
   - Rating changes

---

## Tournaments

The **Tournaments** tab shows all tournaments in the system.

### Viewing Tournaments

- **Tournament Name**: The name of the tournament
- **Type**: Round Robin or Playoff
- **Status**: Active or Completed
- **Participants**: List of players in the tournament

### Tournament Types

#### Round Robin Tournaments

- All players play against each other
- Results are displayed in a matrix/grid format
- Each cell shows the score between two players
- Empty cells indicate matches not yet played

#### Playoff Tournaments

- Single-elimination bracket format
- Players are seeded based on their ratings
- Winners advance to the next round
- Final winner is determined through elimination rounds

### Viewing Tournament Results

1. Click on a tournament name to view details
2. For Round Robin tournaments:
   - See the results matrix
   - View standings (sorted by wins/losses)
3. For Playoff tournaments:
   - See the bracket structure
   - View match results at each round
   - See the tournament winner

### Entering Match Results

**Only Organizers can enter match results**:

1. Navigate to the tournament
2. For Round Robin tournaments:
   - **Double-click** on an empty cell in the results matrix
   - Or click the **"?"** button in an empty cell
   - Enter the scores for each set
   - Click **"Save"**
3. For Playoff tournaments:
   - **Click** on a match box in the bracket
   - Enter the scores
   - Click **"Save"**

**Note**: 
- If you're not an Organizer, you'll see an arrow cursor (not editable)
- If you're an Organizer, you'll see a pointer cursor on editable matches
- Tooltips will indicate if you can edit a match

### Creating Tournaments

**Only Organizers can create tournaments**:

1. Navigate to the **Players** tab
2. Click the **"Tournament"** button
3. Select players to include in the tournament
4. Choose tournament type (Round Robin or Playoff)
5. Click **"Create Tournament"**

**Note**: The Tournament button will be disabled (grayed out) if you're not an Organizer.

### Deleting Tournaments

**Only Organizers can delete tournaments**:

1. Navigate to the **Tournaments** tab
2. Find the tournament you want to delete
3. Click the **Delete icon (🗑️)** next to the tournament name
4. Confirm the deletion

**Note**: The Delete button will be disabled if you're not an Organizer.

---

## Statistics & History

### Statistics Tab

The **Statistics** tab allows you to view rating history for multiple players:

1. Navigate to the **Statistics** tab
2. Select one or more players from the list
3. Click **"View Statistics"**
4. You'll see:
   - Rating trends over time
   - Comparison between selected players
   - Rating changes by tournament

### History Tab

The **History** tab shows detailed match history:

1. Navigate to the **History** tab
2. Select a player from the dropdown
3. Optionally select specific opponents to filter
4. Click **"View History"**
5. You'll see:
   - All matches for the selected player
   - Opponents and scores
   - Rating changes after each match
   - Match dates

---

## User Roles & Permissions

The system has four user roles with different permissions:

### Player

**What Players can do**:
- ✅ View all players, tournaments, statistics, and history
- ✅ Edit their own profile (name, email, phone, address, etc.)
- ✅ Change their own password
- ❌ Cannot create or delete tournaments
- ❌ Cannot enter match results
- ❌ Cannot edit other players' profiles

### Coach

**What Coaches can do**:
- ✅ View all players, tournaments, statistics, and history
- ✅ Edit their own profile
- ✅ Change their own password
- ❌ Cannot create or delete tournaments
- ❌ Cannot enter match results
- ❌ Cannot edit other players' profiles

### Organizer

**What Organizers can do**:
- ✅ Everything Players can do, plus:
- ✅ Create tournaments
- ✅ Delete tournaments
- ✅ Enter and edit match results in all tournaments
- ❌ Cannot edit other players' profiles (unless they're also an Admin)

### Admin

**What Admins can do**:
- ✅ Everything Organizers can do, plus:
- ✅ Edit any player's profile (except password)
- ✅ Reset any player's password (forces password change on next login)
- ✅ Activate/deactivate players
- ✅ Change player roles

**Visual Indicators**:
- **Settings icon (⚙️)**: Appears next to names you can edit
- **Disabled buttons**: Tournament/Match creation buttons are grayed out if you don't have permission
- **Cursor changes**: 
  - Pointer (hand) = You can interact/edit
  - Arrow = Read-only

---

## Frequently Asked Questions

### Q: I forgot my password. What should I do?

A: Click "Forgot Password?" on the login screen, enter your email, and follow the instructions to reset your password.

### Q: Why can't I create a tournament?

A: Only users with the "Organizer" role can create tournaments. Contact an Admin if you need this permission.

### A: Why can't I enter match results?

A: Only Organizers can enter match results. If you need to enter results, contact an Admin to grant you the Organizer role.

### Q: Can I change another player's information?

A: No, you can only edit your own profile. Only Admins can edit other players' information.

### Q: How do I know if I can edit a player's profile?

A: Look for the Settings icon (⚙️) next to the player's name. If you see it, you can edit. If not, you don't have permission.

### Q: What happens when an Admin resets my password?

A: Your password will be cleared, and you'll be required to set a new password the next time you log in. You won't need to enter your old password.

### Q: How long are password reset tokens valid?

A: Reset tokens expire after 1 hour and can only be used once.

### Q: Can I see other players' passwords?

A: No. Passwords are never displayed to anyone, including Admins. Only you can change your own password (Admins can reset it, which forces you to set a new one).

### Q: What does "Games Played" show?

A: It shows the number of matches a player has participated in. You can filter this by date range (All Time, This Month, This Year, or Custom Range).

### Q: How are player ratings calculated?

A: Ratings use a USATT-style system and are calculated based on tournament results and match outcomes. Ratings change after each completed tournament.

### Q: What's the difference between Round Robin and Playoff tournaments?

A: 
- **Round Robin**: All players play against each other. Results are shown in a matrix.
- **Playoff**: Single-elimination bracket. Players are seeded and compete in rounds until a winner is determined.

---

## Getting Help

If you encounter any issues or have questions:

1. Check this user guide first
2. Contact your system administrator
3. Check the visual indicators (icons, cursor changes, disabled buttons) to understand what actions you can perform

---

## Tips for Best Experience

1. **Keep your password secure**: Use a strong, unique password
2. **Update your profile**: Keep your contact information up to date
3. **Check ratings regularly**: View statistics to track your progress
4. **Review match history**: Learn from past matches to improve
5. **Understand your role**: Know what actions you can and cannot perform based on your role

---

*Last updated: December 2024*

