# Debug 401 Errors - Check Token

## Step 1: Check if Token Exists

Open browser console (F12) and run:

```javascript
// Check token
console.log('Token:', localStorage.getItem('pingpong_token'));

// Check member data
console.log('Member:', localStorage.getItem('pingpong_member'));
```

**Expected:**
- Token should be a long JWT string (starts with `eyJ...`)
- Member should have your admin user data

## Step 2: Check Network Request Headers

1. Open **DevTools** → **Network** tab
2. Clear the network log
3. Try to load the page or add a member
4. Click on any failed request (e.g., `GET /api/auth/member/me`)
5. Look at **Request Headers**
6. Check if you see: `Authorization: Bearer eyJ...`

**If Authorization header is MISSING:**
- The token exists but isn't being sent
- This is the problem!

**If Authorization header is PRESENT:**
- Token is being sent
- Check Fly.io logs for why it's being rejected

## Step 3: Check Fly.io Logs

```bash
flyctl logs -a spin-master --follow
```

Then try to load the page. Look for:
- "Checking session authentication"
- "No session or token provided" ← This means token isn't being sent
- "JWT member authentication successful" ← Token is being sent and accepted
- "Invalid token" ← Token is being sent but rejected

## Most Likely Issue

Based on the errors, the token is probably **not being sent** with requests. This could be because:

1. **Token not stored after login** - Log out and log back in
2. **Token expired** - Need to log in again
3. **getAuthHeaders() not working** - Check if token exists but header is missing

## Quick Fix: Log Out and Log Back In

1. Clear localStorage:
   ```javascript
   localStorage.clear()
   ```
2. Refresh the page
3. Log in again
4. Check token is stored: `localStorage.getItem('pingpong_token')`
5. Try the operation again

## If Token Exists But Not Sent

If `localStorage.getItem('pingpong_token')` returns a token but the Authorization header is missing, there's a bug in `getAuthHeaders()`. But looking at the code, it should work.

Please share:
1. What `localStorage.getItem('pingpong_token')` returns
2. Whether the Authorization header is present in Network tab
3. What Fly.io logs show


