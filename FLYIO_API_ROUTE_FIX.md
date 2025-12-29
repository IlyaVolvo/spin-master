# Fix: Cannot POST /auth/member/login Error

## The Problem

The error "Cannot POST /auth/member/login" means the request is reaching Fly.io, but the route isn't found. This happens because the request is missing the `/api` prefix.

## The Issue

Your routes are mounted at `/api` in Express:
- `/api/auth/member/login`
- `/api/players`
- `/api/tournaments`

But your `VITE_API_URL` is set to `https://spin-master.fly.dev` (without `/api`).

When the frontend makes a request to `/auth/member/login`, it becomes:
- `https://spin-master.fly.dev/auth/member/login` ❌ (wrong - missing `/api`)

But it should be:
- `https://spin-master.fly.dev/api/auth/member/login` ✅ (correct)

## Solution: Add /api to VITE_API_URL

### Option 1: Update VITE_API_URL in Vercel (Recommended)

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Find `VITE_API_URL`
3. Update the value from:
   ```
   https://spin-master.fly.dev
   ```
   To:
   ```
   https://spin-master.fly.dev/api
   ```
4. Click **Save**
5. **Redeploy** (disable build cache)
6. Clear browser cache

### Option 2: Check Current VITE_API_URL Value

First, verify what it's currently set to. It should be:
```
https://spin-master.fly.dev/api
```

Not:
```
https://spin-master.fly.dev
```

## Why This Happens

The frontend code uses:
```typescript
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
const api = axios.create({
  baseURL: API_BASE_URL,
});
```

Then makes requests like:
```typescript
api.post('/auth/member/login', ...)
```

So the final URL is: `API_BASE_URL + '/auth/member/login'`

If `VITE_API_URL = "https://spin-master.fly.dev"`, you get:
- `https://spin-master.fly.dev/auth/member/login` ❌

If `VITE_API_URL = "https://spin-master.fly.dev/api"`, you get:
- `https://spin-master.fly.dev/api/auth/member/login` ✅

## Verification Steps

After updating:

1. **Check in Browser Console:**
   ```javascript
   console.log(import.meta.env.VITE_API_URL)
   ```
   Should show: `https://spin-master.fly.dev/api`

2. **Check Network Tab:**
   - Try to login
   - Look at the request URL
   - Should be: `https://spin-master.fly.dev/api/auth/member/login`

3. **Test Health Endpoint:**
   ```bash
   curl https://spin-master.fly.dev/api/health
   ```
   Should return: `{"status":"ok"}`

## Quick Fix Summary

1. Update `VITE_API_URL` in Vercel to: `https://spin-master.fly.dev/api`
2. Redeploy (disable build cache)
3. Clear browser cache / use incognito
4. Test login

## Alternative: Change Code (Not Recommended)

If you don't want to include `/api` in the URL, you could modify `client/src/utils/api.ts`:

```typescript
const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001') + '/api';
```

But updating the environment variable is cleaner and doesn't require code changes.


