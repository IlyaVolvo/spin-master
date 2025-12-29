# Fix: Deployed App Still Using Old API URL

If you've updated `VITE_API_URL` in Vercel but the deployed app is still using the old Railway URL, here's how to fix it:

## Why This Happens

1. **Vite embeds environment variables at build time** - The `VITE_API_URL` value is compiled into the JavaScript bundle during the build
2. **Browser caching** - Your browser may be serving the old cached JavaScript bundle
3. **No redeploy** - The new environment variable value isn't in the code until you rebuild

## Solution Steps

### Step 1: Verify Environment Variable is Set

1. Go to Vercel Dashboard → Your Project → **Settings** → **Environment Variables**
2. Verify `VITE_API_URL` is set to: `https://spin-master.fly.dev`
3. Make sure it's enabled for **Production** environment
4. If it's not correct, update it and continue to Step 2

### Step 2: Redeploy the Application

**Option A: Redeploy from Dashboard (Easiest)**

1. Go to **Deployments** tab in Vercel
2. Find the latest deployment
3. Click the **three dots menu (⋯)** on the deployment
4. Click **Redeploy**
5. Select **Use existing Build Cache** = **No** (important!)
6. Click **Redeploy**

**Option B: Trigger New Deployment**

Make a small change and push to Git:
```bash
# Make a small change (add a comment or whitespace)
# Then commit and push
git add .
git commit -m "Force redeploy with new API URL"
git push
```

**Option C: Redeploy via CLI**

```bash
vercel --prod --force
```

### Step 3: Clear Browser Cache

After redeployment, clear your browser cache:

**Chrome/Edge:**
- Press `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
- Or: DevTools (F12) → Right-click refresh button → "Empty Cache and Hard Reload"

**Firefox:**
- Press `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)

**Safari:**
- Press `Cmd+Option+R`
- Or: Safari menu → "Empty Caches" (if Developer menu enabled)

### Step 4: Verify the Change

1. Open your Vercel app in an **incognito/private window**
2. Open DevTools (F12)
3. Go to **Network** tab
4. Try to login or make an API request
5. Check the request URL - it should be `https://spin-master.fly.dev/api/...`
6. If you see the old Railway URL, the build didn't pick up the new variable

## Troubleshooting

### Still Seeing Old URL After Redeploy

**Check 1: Verify Variable Name**
- Must be exactly `VITE_API_URL` (case-sensitive)
- Must start with `VITE_` (Vite requirement)

**Check 2: Verify Build Used New Variable**
1. Go to Vercel → Deployments → Latest deployment
2. Click on the deployment
3. Look at build logs
4. Search for `VITE_API_URL` - you should see it in the build process

**Check 3: Check Build Cache**
- When redeploying, make sure to **disable build cache**
- Or wait a few minutes and redeploy again

**Check 4: Check Multiple Environments**
- Make sure `VITE_API_URL` is set for **Production**
- If using Preview deployments, set it there too

### Build Logs Don't Show Variable

If the build logs don't show your variable:
1. Remove the variable from Vercel
2. Save
3. Add it back with the correct value
4. Redeploy

### Verify in Browser Console

You can check what value is actually being used:

1. Open browser console (F12)
2. Run:
   ```javascript
   console.log(import.meta.env.VITE_API_URL)
   ```
3. Should output: `https://spin-master.fly.dev`
4. If it shows the old Railway URL or `undefined`, the build didn't use the new value

## Quick Verification Checklist

- [ ] `VITE_API_URL` is set to `https://spin-master.fly.dev` in Vercel
- [ ] Variable is enabled for Production environment
- [ ] Redeployed with build cache disabled
- [ ] Cleared browser cache / used incognito mode
- [ ] Checked Network tab - requests go to Fly.io
- [ ] Console shows correct URL: `console.log(import.meta.env.VITE_API_URL)`

## Force a Clean Build

If nothing else works, force a completely clean build:

1. Go to Vercel → Settings → General
2. Scroll down to "Build & Development Settings"
3. Click "Clear Build Cache"
4. Go back to Deployments
5. Redeploy

This ensures Vercel starts fresh with the new environment variable.


