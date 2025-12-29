# Vercel Deployment Troubleshooting

This guide explains how to check for errors when your Vercel deployment doesn't start.

## How to Access Vercel Logs

### Method 1: Vercel Dashboard (Easiest)

1. **Go to Vercel Dashboard:**
   - Visit https://vercel.com/dashboard
   - Sign in to your account

2. **Select Your Project:**
   - Click on your project name
   - Or go directly to: https://vercel.com/[your-username]/ping-pong-tournament-management-sys

3. **View Deployment:**
   - Click on the latest deployment (usually the first one in the list)
   - You'll see the deployment status and details

4. **Check Logs:**
   - Click the **"Logs"** tab at the top
   - This shows build logs and runtime logs
   - Scroll down to see all logs from the deployment

5. **Check Build Logs:**
   - Look for the build section
   - Errors will be highlighted in red
   - Common errors:
     - Build command failures
     - Missing dependencies
     - Environment variable issues
     - TypeScript compilation errors

### Method 2: Vercel CLI

```bash
# Install Vercel CLI (if not already installed)
npm i -g vercel

# Login to Vercel
vercel login

# Link to your project (if not already linked)
cd /path/to/your/project
vercel link

# View logs
vercel logs

# View logs for specific deployment
vercel logs https://ping-pong-tournament-management-sys.vercel.app

# Follow logs in real-time
vercel logs --follow
```

### Method 3: Function Logs (For Serverless Functions)

If you have serverless functions:
1. Go to your deployment in Vercel Dashboard
2. Click **"Functions"** tab
3. Click on a function to see its logs
4. Check for runtime errors

## Common Issues and Solutions

### 1. Build Errors

**Symptom:** Deployment fails during build phase

**Check:**
- Look in the **Logs** tab for build errors
- Common errors:
  ```
  Error: Command "npm run build" exited with 1
  Cannot find module 'xyz'
  Missing environment variable
  ```

**Solution:**
- Check `vercel.json` build command is correct
- Ensure all dependencies are in `package.json`
- Verify environment variables are set in Vercel project settings

### 2. Application Doesn't Start

**Symptom:** Build succeeds but app shows error page or doesn't load

**Check:**
- Open your deployment URL: `https://ping-pong-tournament-management-sys.vercel.app`
- Open browser Developer Tools (F12)
- Check **Console** tab for JavaScript errors
- Check **Network** tab for failed requests

**Common Issues:**
- Frontend can't connect to backend API
- Missing `VITE_API_URL` environment variable
- CORS errors
- 404 errors for assets

**Solution:**
- Set `VITE_API_URL` in Vercel project settings
- Check if backend API is accessible
- Verify API CORS settings allow your Vercel domain

### 3. Environment Variable Issues

**Symptom:** App works locally but not on Vercel

**Check:**
1. Go to Vercel Dashboard → Your Project
2. Click **Settings** → **Environment Variables**
3. Verify all required variables are set:
   - `VITE_API_URL` (for frontend)
   - Any other environment variables your app needs

**Solution:**
- Add missing environment variables
- Redeploy (Vercel automatically redeploys when env vars change, or trigger manually)

### 4. Missing Output Directory

**Symptom:** `No Output Directory named "public" found`

**Check:**
- Verify `vercel.json` has `outputDirectory` set correctly
- For Vite builds, should be: `"outputDirectory": "client/dist"`

**Solution:**
- Update `vercel.json`:
  ```json
  {
    "outputDirectory": "client/dist"
  }
  ```

### 5. Runtime Errors

**Symptom:** App loads but shows errors or crashes

**Check:**
- Browser console (F12 → Console)
- Network tab for failed API calls
- Vercel function logs (if using serverless functions)

**Common Issues:**
- API endpoint returns errors
- Missing environment variables at runtime
- Database connection issues (if backend is on Vercel)

## Step-by-Step Debugging

### Step 1: Check Deployment Status

1. Go to Vercel Dashboard
2. Click on your project
3. Look at the latest deployment status:
   - ✅ **Ready** - Deployment successful
   - ⚠️ **Building** - Still building
   - ❌ **Error** - Build failed
   - ⚠️ **Failed** - Runtime error

### Step 2: View Build Logs

1. Click on the deployment
2. Scroll to **Build Logs** section
3. Look for errors (usually in red)
4. Common build errors:
   ```
   npm ERR! missing: xyz
   Error: Command failed
   Module not found
   ```

### Step 3: Check Runtime Logs

1. Click **"Logs"** tab
2. Look for runtime errors
3. Check for:
   - Server startup errors
   - API request failures
   - Database connection errors

### Step 4: Test Your Deployment

1. Open your deployment URL in browser
2. Open Developer Tools (F12)
3. Check Console for errors
4. Check Network tab:
   - Failed requests (red status codes)
   - 404 errors
   - CORS errors

### Step 5: Verify Environment Variables

1. Vercel Dashboard → Your Project → **Settings**
2. Click **Environment Variables**
3. Verify all required variables are set
4. Note: Environment variables are only available at build time for frontend apps

### Step 6: Check API Connectivity

If your frontend needs to connect to a backend:

1. Verify backend is deployed and running
2. Test backend URL directly:
   ```bash
   curl https://your-backend-url.com/api/health
   ```
3. Check CORS settings on backend
4. Verify `VITE_API_URL` is set correctly in Vercel

## Quick Diagnostic Commands

### Using Vercel CLI

```bash
# Check deployment status
vercel ls

# View logs for latest deployment
vercel logs

# View specific deployment
vercel inspect https://ping-pong-tournament-management-sys.vercel.app

# Pull environment variables (to verify what's set)
vercel env ls
```

### Using Browser

```javascript
// Open browser console on your Vercel deployment
// Check if API URL is configured
console.log('API URL:', import.meta.env.VITE_API_URL);

// Test API connection
fetch(`${import.meta.env.VITE_API_URL || '/api'}/health`)
  .then(r => r.json())
  .then(console.log)
  .catch(console.error);
```

## Common Error Messages

### Build Errors

```
Error: Command "npm run build" exited with 1
```
- Check build logs for specific error
- Usually missing dependencies or TypeScript errors

```
prisma: command not found
```
- Ensure `prisma` is in `dependencies` (not `devDependencies`)
- Check `vercel.json` install command installs all dependencies

```
Cannot find module '@prisma/client'
```
- Run `npm run install:all` or ensure all dependencies are installed
- Check `installCommand` in `vercel.json`

### Runtime Errors

```
Failed to fetch
```
- Backend API not accessible
- CORS issue
- Wrong `VITE_API_URL`

```
404 Not Found
```
- Missing files/assets
- Wrong `outputDirectory` in `vercel.json`
- Build didn't complete successfully

```
Network Error
```
- Backend not running
- Wrong API URL
- Network/firewall issue

## Verifying Your Deployment

### 1. Check Build Successfully Completed

In Vercel Dashboard:
- Deployment status shows ✅ **Ready**
- Build logs show no errors
- Build time is reasonable (not too long)

### 2. Verify Output Files

```bash
# If you have access to build output
ls -la client/dist/

# Should see:
# - index.html
# - assets/ directory with JS/CSS files
```

### 3. Test the Deployment

1. Visit: `https://ping-pong-tournament-management-sys.vercel.app`
2. Should see your app (not error page)
3. Open browser console - should see no errors
4. Try using the app - verify functionality works

### 4. Check API Connection

If your app needs a backend:
1. Open browser console
2. Check Network tab
3. Look for API calls
4. Verify they're going to correct backend URL
5. Check if requests succeed (200 status) or fail (4xx/5xx)

## Getting Help

When asking for help, provide:

1. **Vercel deployment URL:** `https://ping-pong-tournament-management-sys.vercel.app`
2. **Error messages** from:
   - Vercel logs (screenshot or copy/paste)
   - Browser console
   - Network tab
3. **What you see:** Error page, blank page, app loads but doesn't work, etc.
4. **Environment:** Production deployment on Vercel
5. **Recent changes:** What you changed before the issue started

## Quick Fix Checklist

- [ ] Check Vercel Dashboard → Logs for errors
- [ ] Verify `vercel.json` is correct
- [ ] Check environment variables are set
- [ ] Verify build completes successfully
- [ ] Check browser console for errors
- [ ] Verify backend API is accessible
- [ ] Check CORS settings if using external backend
- [ ] Verify `VITE_API_URL` is set correctly
- [ ] Check that all dependencies are in `package.json`
- [ ] Ensure `outputDirectory` matches your build output

