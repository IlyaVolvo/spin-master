# How to Update VITE_API_URL in Vercel for Fly.io

This guide explains how to update the `VITE_API_URL` environment variable in Vercel to point to your Fly.io backend instead of Railway.

## Step-by-Step Instructions

### Step 1: Get Your Fly.io Backend URL

1. Get your Fly.io app URL:
   ```bash
   flyctl info
   ```
   
   Or check your app at: `https://your-app-name.fly.dev`
   
   Your backend URL will be: `https://your-app-name.fly.dev`

   ⚠️ **Important**: 
   - Use `https://` (not `http://`)
   - No trailing slash at the end
   - Example: `https://spin-master.fly.dev`

### Step 2: Update Environment Variable in Vercel Dashboard

1. Go to [vercel.com](https://vercel.com) and sign in
2. Navigate to your project
3. Go to **Settings** → **Environment Variables**
4. Find the `VITE_API_URL` variable in the list
5. Click the **pencil/edit icon** (or click on the variable name)
6. Update the **Value** field with your Fly.io URL:
   ```
   https://your-app-name.fly.dev
   ```
7. Make sure it's enabled for the environments you want:
   - ✅ Production
   - ✅ Preview (optional, but recommended)
   - ✅ Development (optional)
8. Click **Save**

### Step 3: Redeploy Your Frontend

After updating the environment variable, you need to redeploy for the changes to take effect:

**Option A: Redeploy from Dashboard**
1. Go to the **Deployments** tab
2. Find the latest deployment
3. Click the **three dots menu (⋯)**
4. Click **Redeploy**
5. Click **Redeploy** to confirm

**Option B: Trigger New Deployment**
1. Make a small change to your code (or just push a commit)
2. Push to Git - Vercel will auto-deploy

**Option C: Redeploy via CLI**
```bash
vercel --prod
```

### Step 4: Verify the Update

1. After deployment completes, visit your Vercel app
2. Open browser DevTools (F12)
3. Go to **Console** tab
4. Look for any API connection errors
5. Go to **Network** tab
6. Try logging in or making an API request
7. Verify requests are going to `your-app-name.fly.dev` instead of Railway URL

## Quick Reference

**Old Value (Railway):**
```
https://spin-master.up.railway.app
```

**New Value (Fly.io):**
```
https://your-app-name.fly.dev
```

## Troubleshooting

### Changes Not Applied

**Problem**: Frontend still connects to Railway

**Solutions**:
1. Make sure you **redeployed** after changing the variable
2. Check that you updated `VITE_API_URL` (not just `API_URL`)
3. Clear browser cache and hard refresh (Ctrl+Shift+R / Cmd+Shift+R)
4. Verify the variable value in Vercel dashboard (no typos, no trailing slash)

### CORS Errors

**Problem**: `Access-Control-Allow-Origin` errors

**Solutions**:
1. Verify `CLIENT_URL` in Fly.io is set to your Vercel URL
   ```bash
   flyctl secrets set CLIENT_URL="https://your-vercel-app.vercel.app"
   ```
2. No trailing slash in `CLIENT_URL`
3. Restart Fly.io app after updating:
   ```bash
   flyctl apps restart your-app-name
   ```

### Variable Not Showing Up

**Problem**: `VITE_API_URL` is undefined in the app

**Solutions**:
1. Make sure variable name starts with `VITE_` (Vite requirement)
2. Redeploy after adding/changing the variable
3. Check that variable is enabled for the correct environment (Production/Preview)

## Using Vercel CLI (Alternative Method)

You can also update via CLI:

```bash
# Install Vercel CLI if not already installed
npm i -g vercel

# Login
vercel login

# Set environment variable
vercel env add VITE_API_URL production
# Enter value when prompted: https://your-app-name.fly.dev

# Remove old Railway URL (optional)
vercel env rm VITE_API_URL production
# Then add the new one

# Redeploy
vercel --prod
```

## Environment-Specific Values

If you want different values for different environments:

1. In Vercel dashboard, when editing `VITE_API_URL`:
   - **Production**: `https://your-app-name.fly.dev`
   - **Preview**: `https://your-app-name.fly.dev` (or a staging URL)
   - **Development**: `http://localhost:3001` (for local dev)

2. The same variable can have different values for each environment

## Checklist

- [ ] Got Fly.io backend URL (e.g., `https://spin-master.fly.dev`)
- [ ] Updated `VITE_API_URL` in Vercel dashboard
- [ ] Verified no trailing slash in the URL
- [ ] Enabled for Production environment
- [ ] Redeployed the frontend
- [ ] Verified API calls go to Fly.io (check Network tab)
- [ ] Updated `CLIENT_URL` in Fly.io (if needed)
- [ ] Tested login/API functionality

## After Updating

Once updated, your architecture will be:
```
┌──────────┐                    ┌─────────┐
│  Vercel  │ ──VITE_API_URL──>  │ Fly.io  │
│(Frontend)│                    │(Backend)│
└──────────┘                    └─────────┘
                                         │
                                         v
                                   ┌──────────┐
                                   │ Supabase │
                                   │(Database)│
                                   └──────────┘
```


