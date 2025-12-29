# Fix: 401 Unauthorized - Cross-Domain Authentication

## The Problem

You're getting 401 Unauthorized when trying to add a member. This is because:

1. **Sessions don't work across different domains** - Vercel (frontend) and Fly.io (backend) are different domains
2. **Session cookies are domain-specific** - Cookies set by Fly.io won't be sent to Vercel
3. **JWT token exists but might not be sent** - The login returns a JWT token, but it needs to be included in requests

## Solution: Use JWT Token for Cross-Domain Auth

Since sessions won't work across domains, we need to ensure the JWT token is always sent with requests.

### Option 1: Update Session Cookie Settings (For Future)

For sessions to work cross-domain, you need:
- `secure: true` (requires HTTPS - both Vercel and Fly.io have this)
- `sameSite: 'none'` (allows cross-domain cookies)

But this is complex and JWT tokens are simpler for cross-domain.

### Option 2: Ensure JWT Token is Always Sent (Recommended)

The login response includes a JWT token. Make sure it's being stored and sent with every request.

**Check if token is stored after login:**
1. Open browser console
2. Run: `localStorage.getItem('pingpong_token')`
3. Should show a JWT token

**If token is missing:**
- The login might not be storing it properly
- Check the login response includes `token` field

### Option 3: Update Session Cookie Settings for Cross-Domain

Update `server/src/index.ts` session configuration:

```typescript
cookie: {
  secure: true,        // Changed from false - requires HTTPS
  httpOnly: true,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  sameSite: 'none',    // Changed from 'lax' - allows cross-domain
},
```

**Important**: This requires:
- Both domains use HTTPS (✅ Vercel and Fly.io do)
- CORS is properly configured (✅ already done)

## Quick Fix: Check Token is Being Sent

1. **Open browser DevTools** → Network tab
2. **Try to add a member**
3. **Click on the failed request** (`POST /api/players`)
4. **Check Request Headers** - look for:
   - `Authorization: Bearer <token>` - Should be present
   - `Cookie: pingpong.sid=...` - Might not work cross-domain

5. **If Authorization header is missing:**
   - Check `localStorage.getItem('pingpong_token')` in console
   - If null, the token wasn't stored during login
   - If present, the token should be in the Authorization header

## Debug Steps

1. **Check if you're logged in:**
   ```javascript
   // In browser console
   localStorage.getItem('pingpong_token')
   localStorage.getItem('pingpong_member')
   ```

2. **Check what's sent with the request:**
   - Open Network tab
   - Try to add member
   - Check the request headers

3. **Check Fly.io logs:**
   ```bash
   flyctl logs -a spin-master
   ```
   Look for authentication debug messages

## Most Likely Issue

The JWT token is probably not being sent. The `getAuthHeaders()` function only sends the token if it exists. Make sure:
1. Login stores the token: `setToken(response.data.token)`
2. Token is in localStorage: Check with console
3. Token is sent with requests: Check Network tab headers


