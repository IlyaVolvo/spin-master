# Diagnosing "Invalid Token" Error

## What This Error Means

The token exists and is being sent, but verification is failing. This typically means:

**JWT_SECRET mismatch** - The token was signed with one secret, but Fly.io is using a different one to verify it.

## Most Likely Cause

You logged in on a different environment (local server or previous Railway deployment) and that token is still in your browser's localStorage. Now you're trying to use it against Fly.io, which has a different JWT_SECRET.

## Quick Fix (No Redeploy Needed)

**Just log in again on the deployed app:**

1. Go to your Vercel app (https://ping-pong-tournament-management-sys.vercel.app)
2. Open browser console (F12)
3. Clear localStorage:
   ```javascript
   localStorage.clear()
   ```
4. Refresh the page
5. Log in again

This will create a **new token** signed with Fly.io's JWT_SECRET, which should work.

## To Verify (Optional)

If you want to check what's happening:

1. **Check what JWT_SECRET Fly.io is using:**
   ```bash
   flyctl secrets list -a spin-master
   ```

2. **Check Fly.io logs when you try to use the token:**
   ```bash
   flyctl logs -a spin-master
   ```
   Look for "Authentication failed" messages.

3. **Verify the token is being sent:**
   - Open browser DevTools → Network tab
   - Try to add a member or make any authenticated request
   - Check Request Headers for `Authorization: Bearer ...`

## Why This Happens

- Each environment (local, Railway, Fly.io) can have a different JWT_SECRET
- Tokens are signed with the secret from the environment where you logged in
- Tokens can only be verified with the same secret that signed them
- When you switch environments, old tokens won't work unless secrets match

## Solution

**Always log in on the environment you're using** - the token will be signed with that environment's secret.

