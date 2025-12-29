# Debug 401 Unauthorized Error

## Quick Debug Steps

### Step 1: Check if You're Actually Logged In

Open browser console and run:
```javascript
// Check if token exists
localStorage.getItem('pingpong_token')

// Check if member data exists
localStorage.getItem('pingpong_member')
```

**Expected:**
- `pingpong_token` should have a JWT token string
- `pingpong_member` should have member data with roles including "ADMIN"

### Step 2: Check What's Sent with the Request

1. Open **DevTools** → **Network** tab
2. Try to add a member
3. Click on the failed `POST /api/players` request
4. Check **Request Headers**:
   - Look for `Authorization: Bearer <token>` - **Should be present**
   - If missing, the token isn't being sent

### Step 3: Check Fly.io Logs

```bash
flyctl logs -a spin-master
```

Look for authentication messages when you try to add a member. Should see:
- "Checking session authentication"
- Either "Session authentication successful" or "JWT member authentication successful"

If you see "No session or token provided", the token isn't being sent.

## Common Issues

### Issue 1: Token Not Stored After Login

**Symptom**: `localStorage.getItem('pingpong_token')` returns `null`

**Fix**: 
- Log out and log back in
- Check browser console for errors during login
- Verify login response includes `token` field

### Issue 2: Token Not Sent with Requests

**Symptom**: Authorization header missing in Network tab

**Fix**: 
- Check `getAuthHeaders()` is being called (it is, via axios interceptor)
- Verify token exists: `localStorage.getItem('pingpong_token')`
- If token exists but not sent, there might be an issue with the interceptor

### Issue 3: Session Cookie Not Working Cross-Domain

**Symptom**: Session cookie not being sent (expected - sessions don't work cross-domain)

**Fix**: 
- I've updated the code to use `sameSite: 'none'` for cross-domain
- But JWT token should work regardless
- Make sure JWT token is being used (it should be)

## Most Likely Solution

The JWT token should work. Make sure:

1. **You're logged in** - Check localStorage has token
2. **Token is sent** - Check Network tab shows Authorization header
3. **Token is valid** - Check Fly.io logs for authentication success

If token exists but still getting 401, check Fly.io logs to see why authentication is failing.


