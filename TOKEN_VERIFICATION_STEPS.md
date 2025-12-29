# Verify Token is Being Sent

## Step 1: Check Network Tab

1. Open **DevTools** (F12) → **Network** tab
2. **Clear** the network log
3. Try to add a member or refresh the page
4. Click on a failed request (e.g., `GET /api/auth/member/me`)
5. Look at **Request Headers**
6. Check for: `Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

**Is the Authorization header present?**
- ✅ **Yes** → Token is being sent, check Fly.io logs for why it's rejected
- ❌ **No** → Token exists but isn't being sent (axios interceptor issue)

## Step 2: Check Fly.io Logs

```bash
flyctl logs -a spin-master
```

Try to make a request (refresh page or add member), then look for:

**If token is being sent:**
- "JWT member authentication successful" → Token accepted
- "Invalid token" → Token rejected (wrong secret or expired)
- "No session or token provided" → Token not sent (shouldn't happen if header exists)

**If token is NOT being sent:**
- "No session or token provided" → This confirms token isn't being sent

## Step 3: Verify Token Format

Your token payload shows:
- `memberId: 0` (this is correct - your admin user has id 0)
- `type: "member"` (correct)
- `exp: 1767636333` (expiration timestamp)

The token looks valid. The issue is likely:
1. **Token not being sent** - Check Network tab
2. **Token expired** - Check expiration time
3. **Wrong JWT_SECRET** - Fly.io JWT_SECRET doesn't match the one used to sign the token

## Quick Test: Manually Send Token

You can test if the token works by using curl:

```bash
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJtZW1iZXJJZCI6MCwidHlwZSI6Im1lbWJlciIsImlhdCI6MTc2NzAzMTUzMywiZXhwIjoxNzY3NjM2MzMzfQ.RJm6IaqLb4LkaqPUUSJDWPI68-DJop_pynOXBnIf_6I" \
  https://spin-master.fly.dev/api/auth/member/me
```

If this works, the token is valid and the issue is it's not being sent from the browser.
If this fails, the token is invalid (wrong secret or expired).

## Most Likely Issue

Since you have the token, but getting 401 errors, the most likely causes are:

1. **Token not being sent** - Check Network tab for Authorization header
2. **JWT_SECRET mismatch** - The secret used to sign the token doesn't match Fly.io's JWT_SECRET
3. **Token expired** - Check expiration time

Please check the Network tab first to see if the Authorization header is present.


