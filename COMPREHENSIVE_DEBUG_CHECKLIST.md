# Comprehensive Debug Checklist

## 1. Fly.io Logs ✅
Check the verbose logs we just added:

```bash
flyctl logs -a spin-master --follow
```

**Look for:**
- `[INFO] Creating JWT token` - during login
- `[INFO] Verifying JWT token` - during API calls
- `[WARN] JWT token verification failed` - when it fails

**Compare:**
- `secretSource` in token creation vs verification (should match!)
- `secretLength` in token creation vs verification (should match!)
- `jwtSecretSet` and `sessionSecretSet` values

## 2. Browser Console ✅
**Check:**
- Any error messages (red text)
- Network errors
- JavaScript errors

**Run this in console to inspect token:**
```javascript
const token = localStorage.getItem('pingpong_token');
console.log('Token exists:', !!token);
if (token) {
  const parts = token.split('.');
  if (parts.length === 3) {
    const payload = JSON.parse(atob(parts[1]));
    console.log('Token payload:', payload);
    console.log('Token created at:', new Date(payload.iat * 1000));
    console.log('Token expires at:', new Date(payload.exp * 1000));
    console.log('Token expired?', Date.now() > payload.exp * 1000);
  }
}
```

## 3. Browser Network Tab 🔍
**Open DevTools → Network tab:**

**For login request (`/api/auth/member/login`):**
- Status code: Should be 200
- Response: Should contain `{ member: {...}, token: "..." }`
- Check Response tab to see the actual token returned

**For subsequent requests (e.g., `/api/auth/member/me`, `/api/tournaments`):**
- Status code: 401 = failed, 200 = success
- Request Headers: Look for `Authorization: Bearer eyJ...`
- Response: Check error message

**Key check:** Is the `Authorization` header present and correct?

## 4. Fly.io Secrets 🔑
**Check what secrets are actually set:**

```bash
flyctl secrets list -a spin-master
```

**Look for:**
- `JWT_SECRET` - is it set? What's its length?
- `SESSION_SECRET` - is it set? What's its length?

**Important:** Compare the secret lengths with what's logged:
- If `JWT_SECRET` is set and has length 32, but logs show `secretLength: 6`, something is wrong
- If `SESSION_SECRET` is set but logs show `secretSource: "default"`, it's not being read

## 5. Compare Token Creation vs Verification 📊
**Create a side-by-side comparison:**

| Aspect | Token Creation (Login) | Token Verification (API Call) |
|--------|----------------------|------------------------------|
| secretSource | ? | ? |
| secretLength | ? | ? |
| jwtSecretSet | ? | ? |
| sessionSecretSet | ? | ? |
| usingDefault | ? | ? |

**They should match!** If they don't, that's your problem.

## 6. Check Environment Variables at Runtime 🏃
**Add temporary logging to see all env vars (security note: don't log values, just names):**

Actually, we already log which ones are set. But you can verify by:

1. Check Fly.io secrets (step 4 above)
2. Compare with what logs say is set
3. If secrets exist in Fly.io but logs say `jwtSecretSet: false`, they're not being loaded

## 7. Test Token Manually (Optional) 🧪
**Decode the token payload to verify it:**

```javascript
// In browser console
const token = localStorage.getItem('token');
if (token) {
  const parts = token.split('.');
  const header = JSON.parse(atob(parts[0]));
  const payload = JSON.parse(atob(parts[1]));
  
  console.log('Token header:', header);
  console.log('Token payload:', payload);
  console.log('Algorithm:', header.alg);
  console.log('Member ID:', payload.memberId);
  console.log('Token type:', payload.type);
}
```

**Expected:**
- `alg`: "HS256"
- `memberId`: 0 (or your member ID)
- `type`: "member"

## 8. Check Token Storage 📦
**Verify token is stored correctly:**

```javascript
// In browser console
console.log('Token in localStorage:', localStorage.getItem('token'));
console.log('Member in localStorage:', localStorage.getItem('member'));
```

**If token is missing:** Login didn't succeed
**If token exists but API calls fail:** Secret mismatch or token expired

## 9. Verify CORS and Cookies 🌐
**Check Network tab → Headers:**

**For login request:**
- Response headers should include `Set-Cookie` (for session)
- Check if cookies are being set

**For API requests:**
- Request headers should include `Authorization: Bearer ...`
- Check if cookies are being sent (if using session auth)

## 10. Check Timing ⏱️
**When did the error occur?**
- Right after login? → Token creation issue
- After page refresh? → Token storage/retrieval issue
- After some time? → Token might have expired

**From logs, check:**
- Time between token creation and verification attempts
- Token expiration time vs current time

## Summary: Most Important Checks

1. **Fly.io logs** - Compare `secretSource` and `secretLength` between creation and verification
2. **Fly.io secrets** - Verify what's actually set: `flyctl secrets list -a spin-master`
3. **Network tab** - Check if `Authorization` header is present and status codes
4. **Browser console** - Check for errors and decode token to verify it's valid

## What to Look For

**If logs show:**
- ✅ Same `secretSource` in creation and verification → Secrets match, but maybe values don't
- ❌ Different `secretSource` → Fallback logic issue (should be fixed now)
- ⚠️ `usingDefault: true` → No secrets set, using insecure default

**If Fly.io secrets show:**
- JWT_SECRET set but logs show `jwtSecretSet: false` → Environment variable not loaded
- SESSION_SECRET set but logs show `secretSource: "default"` → Environment variable not loaded

**If Network tab shows:**
- No `Authorization` header → Token not being sent (client-side issue)
- `Authorization` header present but 401 → Token verification failed (secret mismatch)

