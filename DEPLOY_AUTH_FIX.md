# Deploy Authentication Fix

## What Changed

**File:** `server/src/routes/auth.ts`

**Change:** Updated the `/api/auth/member/me` endpoint to also check JWT tokens, not just sessions.

**Why:** The endpoint was only checking session-based auth, but sessions don't work cross-domain (Vercel ↔ Fly.io). Now it also checks JWT tokens in the Authorization header.

## Deployment Steps

### 1. Commit the Changes

```bash
git add server/src/routes/auth.ts
git commit -m "Fix /member/me endpoint to support JWT token authentication"
git push
```

### 2. Deploy to Fly.io

The changes are automatically deployed when you push to your main branch (if you have Fly.io connected to GitHub), OR deploy manually:

```bash
flyctl deploy -a spin-master
```

### 3. Verify Deployment

After deployment, check the logs:

```bash
flyctl logs -a spin-master --follow
```

Then try logging in again from your Vercel app. The authentication should work now.

## What This Fixes

- ✅ `/api/auth/member/me` endpoint now accepts JWT tokens
- ✅ Authentication check on app load will work
- ✅ Cross-domain authentication (Vercel ↔ Fly.io) will work
- ✅ Your existing JWT token will now be accepted

## No Changes Needed

- ❌ **No changes to Vercel** - this is a backend-only fix
- ❌ **No changes to frontend code** - the frontend was already sending tokens correctly
- ❌ **No changes to environment variables** - secrets are already configured correctly

## Summary

1. **Commit and push** the changes to `server/src/routes/auth.ts`
2. **Deploy to Fly.io** (automatic if GitHub connected, or use `flyctl deploy`)
3. **Test** - Refresh your Vercel app and authentication should work!

