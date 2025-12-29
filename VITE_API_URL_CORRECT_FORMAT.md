# VITE_API_URL Correct Format

## YES - It Should Include `/api`

Your `VITE_API_URL` in Vercel should be:

```
https://spin-master.fly.dev/api
```

**NOT:**
```
https://spin-master.fly.dev
```

## Why?

### Server Routes Are Mounted at `/api`

In `server/src/index.ts`:
```typescript
app.use('/api/auth', authRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/tournaments', tournamentRoutes);
```

So routes are:
- `/api/auth/member/login`
- `/api/players`
- `/api/tournaments`

### Frontend Code Uses Base URL + Path

In `client/src/utils/api.ts`:
```typescript
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
const api = axios.create({
  baseURL: API_BASE_URL,
});
```

Then requests are made like:
```typescript
api.post('/auth/member/login', ...)
```

### How URLs Are Constructed

The final URL is: `API_BASE_URL + '/auth/member/login'`

**If VITE_API_URL = "https://spin-master.fly.dev/api":**
- API_BASE_URL = `https://spin-master.fly.dev/api`
- Final URL = `https://spin-master.fly.dev/api/auth/member/login` ✅ **CORRECT**

**If VITE_API_URL = "https://spin-master.fly.dev":**
- API_BASE_URL = `https://spin-master.fly.dev`
- Final URL = `https://spin-master.fly.dev/auth/member/login` ❌ **WRONG** (missing `/api`)

## The Fix

1. Go to **Vercel Dashboard** → Your Project → **Settings** → **Environment Variables**
2. Find `VITE_API_URL`
3. Set it to: `https://spin-master.fly.dev/api` (with `/api` at the end)
4. Click **Save**
5. **Redeploy** with build cache disabled
6. Clear browser cache / use incognito mode

## Verification

After redeploying, check in browser console:
```javascript
console.log(import.meta.env.VITE_API_URL)
// Should output: "https://spin-master.fly.dev/api"
```

Then try to login and check Network tab - the request URL should be:
```
https://spin-master.fly.dev/api/auth/member/login
```

## Summary

✅ **Correct**: `https://spin-master.fly.dev/api`  
❌ **Wrong**: `https://spin-master.fly.dev`

The `/api` is part of your Express route structure, so it must be included in the base URL.


