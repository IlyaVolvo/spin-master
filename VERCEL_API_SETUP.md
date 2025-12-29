# Setting Up Backend API URL for Vercel Deployment

Your frontend is deployed on Vercel but needs to connect to your backend API. Currently, it's trying to use `/api` (relative URL) which doesn't work because Vercel only serves static files.

## The Problem

Your frontend at `https://ping-pong-tournament-management-sys.vercel.app` is trying to call:
```
POST https://ping-pong-tournament-management-sys.vercel.app/api/auth/member/login
```

But Vercel only serves static files - there's no backend API at that URL.

## Solution: Configure Backend API URL

You need to:

1. **Deploy your backend** to a hosting service (Render, Railway, Cloud Run, etc.)
2. **Set the backend URL** in Vercel environment variables
3. **Rebuild** your frontend so it uses the correct API URL

## Steps

### Step 1: Deploy Backend (if not already done)

Choose one:
- **Render.com** (recommended - easiest)
- **Railway.app**
- **Google Cloud Run**
- **Any Node.js hosting service**

See `BACKEND_DEPLOYMENT_OPTIONS.md` for detailed instructions.

### Step 2: Get Your Backend URL

After deploying, you'll get a URL like:
- Render: `https://pingpong-api.onrender.com`
- Railway: `https://pingpong-api.railway.app`
- Cloud Run: `https://pingpong-api-xxxxx-uc.a.run.app`

### Step 3: Set Environment Variable in Vercel

1. Go to **Vercel Dashboard** → Your Project
2. Click **Settings** → **Environment Variables**
3. Click **Add New**
4. Set:
   - **Key**: `VITE_API_URL`
   - **Value**: `https://your-backend-url.com/api` (include `/api` at the end)
   - **Environment**: Select `Production` (and `Preview` if you want)
5. Click **Save**

**Important:** Environment variables starting with `VITE_` are embedded at **build time**, not runtime. After adding the variable, you need to **trigger a new deployment**.

### Step 4: Trigger New Deployment

After setting the environment variable:

1. Go to **Deployments** tab in Vercel
2. Click the **"..."** menu on the latest deployment
3. Click **Redeploy**
4. Or push a new commit to trigger a new build

### Step 5: Verify

After deployment completes:

1. Visit your Vercel URL
2. Open browser console (F12)
3. Check Network tab - API calls should now go to your backend URL
4. Try logging in - it should connect to your backend

## Current Configuration

Your frontend code in `client/src/utils/api.ts` uses:

```typescript
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
```

- If `VITE_API_URL` is set, it uses that
- Otherwise, it uses `/api` (relative URL - only works locally with Vite proxy)

## Testing Locally vs Production

**Local Development:**
- Uses Vite proxy: `/api` → `http://localhost:3001`
- Configured in `client/vite.config.ts`

**Production (Vercel):**
- No proxy available
- Must use absolute URL: `VITE_API_URL=https://your-backend-url.com/api`

## Troubleshooting

### Still getting 404 errors?

1. **Check environment variable is set:**
   - Vercel Dashboard → Settings → Environment Variables
   - Make sure `VITE_API_URL` is set correctly

2. **Check you redeployed after setting the variable:**
   - Environment variables are embedded at build time
   - You must trigger a new build after adding/changing them

3. **Verify backend URL is correct:**
   - Test backend directly: `curl https://your-backend-url.com/api/health`
   - Should return a response

4. **Check backend CORS settings:**
   - Backend must allow requests from your Vercel domain
   - Check `CLIENT_URL` environment variable in your backend
   - Should include: `https://ping-pong-tournament-management-sys.vercel.app`

5. **Check browser console:**
   - Open Developer Tools → Network tab
   - See what URL is actually being called
   - Should be your backend URL, not `/api`

## Quick Checklist

- [ ] Backend is deployed and accessible
- [ ] `VITE_API_URL` is set in Vercel environment variables
- [ ] New deployment was triggered after setting the variable
- [ ] Backend CORS allows your Vercel domain
- [ ] Test backend URL directly (should respond)
- [ ] Check browser Network tab to verify API calls go to correct URL

