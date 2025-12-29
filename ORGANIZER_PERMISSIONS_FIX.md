# Organizer Permissions Fix

## Issue
Regular users were able to create and modify tournaments, which should only be allowed for users with the ORGANIZER role.

## Root Cause
The `isOrganizer` function was checking roles correctly, but the implementation could be more robust. All tournament modification routes now have explicit organizer checks.

## Solution

### 1. Enhanced `isOrganizer` Function
- Added explicit array checks
- Added logging for debugging
- Simplified role comparison to use `includes('ORGANIZER')`
- Checks both session-based and JWT-based authentication

### 2. Added Organizer Checks to All Modification Routes

**Routes now requiring ORGANIZER role:**
- ✅ `POST /tournaments` - Create tournament
- ✅ `POST /tournaments/bulk` - Bulk create tournaments
- ✅ `PATCH /tournaments/:id/name` - Update tournament name
- ✅ `PATCH /tournaments/:id/complete` - Complete tournament
- ✅ `PATCH /tournaments/:id/bracket` - Update bracket positions
- ✅ `PATCH /tournaments/:id/participants` - Update participants
- ✅ `POST /tournaments/:id/matches` - Add match
- ✅ `PATCH /tournaments/:tournamentId/matches/:matchId` - Update match
- ✅ `DELETE /tournaments/:tournamentId/matches/:matchId` - Delete match
- ✅ `DELETE /tournaments/:id` - Delete tournament
- ✅ `POST /tournaments/preview-bracket` - Preview bracket
- ✅ `POST /tournaments/:id/reseed` - Reseed bracket

**Routes that remain public (read-only):**
- `GET /tournaments` - View all tournaments
- `GET /tournaments/active` - View active tournaments
- `GET /tournaments/:id` - View single tournament
- `GET /tournaments/:id/bracket` - View bracket structure

## Testing

To verify the fix works:

1. **Test as regular user (PLAYER role only):**
   - Try to create a tournament → Should get 403 error
   - Try to update tournament name → Should get 403 error
   - Try to add a match → Should get 403 error
   - Try to complete tournament → Should get 403 error

2. **Test as organizer:**
   - All operations should work normally

3. **Check logs:**
   - Enable debug logging: `DEBUG=true npm run dev`
   - Look for "Organizer access granted" or "Organizer access denied" messages
   - Verify roles are being checked correctly

## Debugging

If regular users can still modify tournaments:

1. **Check user's roles in database:**
   ```sql
   SELECT id, email, roles FROM members WHERE email = 'user@example.com';
   ```
   - Should only have `['PLAYER']` for regular users
   - Should have `['PLAYER', 'ORGANIZER']` or `['ORGANIZER']` for organizers

2. **Check session data:**
   - Look at server logs for "Organizer access" messages
   - Verify `req.member.roles` contains the correct values

3. **Verify authentication:**
   - Ensure user is properly authenticated
   - Check that `req.member` or `req.memberId` is set correctly

## Code Changes

### `isOrganizer` Function
- Now uses explicit `includes('ORGANIZER')` check
- Added comprehensive logging
- Handles both session and JWT authentication
- Returns `false` by default (secure by default)

### All Modification Routes
- Added `isOrganizer` check at the start of each route handler
- Returns 403 error if user is not an organizer
- Error message: "Only Organizers can [action]"

## Security Notes

- **Default Deny**: Function returns `false` by default
- **Explicit Checks**: All modification routes explicitly check for organizer role
- **No Bypass**: No routes bypass the organizer check
- **Logging**: All access attempts are logged for auditing

