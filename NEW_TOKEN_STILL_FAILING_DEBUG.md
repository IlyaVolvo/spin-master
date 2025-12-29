# New Token Still Failing - Debugging Steps

## Token Info
- Token is new (created 29 minutes ago)
- Should be signed with correct secret
- Secrets match (confirmed in logs)

## What to Check

### 1. Is Token Being Sent?

Open browser DevTools → Network tab, then make a request (e.g., try to view players). Look at the request headers:

**Check for:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**If missing:** Token isn't being sent (client-side issue)
**If present:** Token is being sent (check server-side)

### 2. What Error Are You Getting?

Check the Network tab response:
- **Status:** 401? 500? Other?
- **Response body:** What error message?

### 3. Check Fly.io Logs During Request

While making a request, watch Fly.io logs:

```bash
flyctl logs -a spin-master --follow
```

**Look for:**
- `[INFO] Verifying JWT token` - Shows token verification attempt
- `[WARN] JWT token verification failed` - Shows why it failed
- Check the `secretHash` - Should match the hash from token creation

### 4. Verify Token Format

Run this in browser console:

```javascript
const token = localStorage.getItem('pingpong_token');
if (token) {
  const parts = token.split('.');
  console.log('Token parts:', parts.length); // Should be 3
  if (parts.length === 3) {
    const header = JSON.parse(atob(parts[0]));
    const payload = JSON.parse(atob(parts[1]));
    console.log('Algorithm:', header.alg); // Should be "HS256"
    console.log('Member ID:', payload.memberId);
    console.log('Type:', payload.type); // Should be "member"
    console.log('Token expires:', new Date(payload.exp * 1000));
    console.log('Is expired?', Date.now() > payload.exp * 1000);
  }
}
```

### 5. Compare Token Creation vs Verification Logs

From Fly.io logs, compare:

**Token Creation (during login):**
```
[INFO] Creating JWT token
"secretHash": "ae152f68fd6edd74"
```

**Token Verification (during API call):**
```
[INFO] Verifying JWT token
"secretHash": "ae152f68fd6edd74"  // Should match!
```

If they match but verification still fails, the error message in the logs will tell us why.

## Common Issues

### Issue 1: Token Not Being Sent

**Symptoms:** No `Authorization` header in Network tab

**Fix:** Check `client/src/utils/auth.ts` - `getAuthHeaders()` function should include token

### Issue 2: Token Expired

**Symptoms:** Token exists but `Date.now() > payload.exp * 1000` is true

**Fix:** Token expired (shouldn't happen if it's 29 minutes old and expires in 7 days, but check anyway)

### Issue 3: Different Secret Used

**Symptoms:** `secretHash` in verification log doesn't match creation log

**Fix:** Secrets don't match (but we confirmed they do, so unlikely)

### Issue 4: Token Format Invalid

**Symptoms:** `jwt.verify()` throws error about token format

**Fix:** Token corrupted or malformed

### Issue 5: CORS/Preflight Issues

**Symptoms:** Request fails before reaching server (no logs on server)

**Fix:** CORS configuration issue

## Next Steps

1. **Check Network tab** - Is Authorization header present?
2. **Check Fly.io logs** - What error is shown when verifying token?
3. **Share the error message** from logs or Network tab response

This will tell us exactly what's failing.

