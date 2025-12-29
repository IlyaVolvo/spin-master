# Troubleshooting Guide - Where to See Errors

This guide explains where to find errors when the app doesn't start.

## Local Development

### 1. Terminal/Console Output

When running the app locally, errors appear directly in your terminal:

```bash
# Server
cd server
npm run dev

# Client  
cd client
npm start
```

**Common startup errors you'll see:**
- `ERROR: DATABASE_URL is not set!` - Missing database connection
- `Port 3001 already in use` - Another process is using the port
- `Cannot find module` - Missing dependencies
- `Connection refused` - Database not running or wrong connection string

### 2. Browser Console (Client)

For client-side errors:
1. Open your browser's Developer Tools (F12 or Cmd+Option+I)
2. Go to the **Console** tab
3. Look for red error messages

### 3. Server Log Files

Logs are saved to `server/logs/server-YYYY-MM-DD.log`:

```bash
# View latest log file
cd server
tail -f logs/server-$(date +%Y-%m-%d).log

# Or view the most recent log
ls -t logs/*.log | head -1 | xargs tail -f

# View last 100 lines
tail -100 logs/server-$(date +%Y-%m-%d).log
```

**Note:** Logging must be enabled in `server/.env`:
```env
ENABLE_LOGGING=true
LOG_TO_CONSOLE=true
DEBUG=true  # Enables detailed logging
```

### 4. Check Server Status

```bash
# Check if server is running
curl http://localhost:3001/api/health

# Check what's running on port 3001
lsof -i :3001

# Check server logs in real-time
cd server
npm run dev  # Runs with console output
```

## Production/Deployed Environments

### Vercel

**1. Vercel Dashboard:**
- Go to https://vercel.com/dashboard
- Select your project
- Click on the deployment
- Go to **"Functions"** tab for serverless function logs
- Go to **"Logs"** tab for build and runtime logs

**2. Vercel CLI:**
```bash
# View logs
vercel logs

# View logs for specific deployment
vercel logs <deployment-url>
```

**3. Build Logs:**
- Available in the deployment page
- Shows errors during build process
- Check for TypeScript errors, missing dependencies, etc.

### Render.com

**1. Render Dashboard:**
- Go to https://dashboard.render.com
- Select your service
- Click **"Logs"** tab
- Shows real-time and historical logs

**2. Build Logs:**
- Available during deployment
- Shows npm install/build errors

### Railway

**1. Railway Dashboard:**
- Go to https://railway.app
- Select your project → service
- Click **"Logs"** tab

**2. Railway CLI:**
```bash
railway logs
```

### Google Cloud Run

**1. Cloud Console:**
- Go to Cloud Run in Google Cloud Console
- Select your service
- Click **"Logs"** tab

**2. Cloud Logging:**
```bash
gcloud logging read "resource.type=cloud_run_revision" --limit 50
```

## Common Error Messages and Solutions

### Database Connection Errors

**Error:** `DATABASE_URL is not set!`
```bash
# Solution: Create server/.env file
cd server
cp env.example .env
# Edit .env with your DATABASE_URL
```

**Error:** `Connection refused` or `timeout`
```bash
# Check if database is running
# Local PostgreSQL:
brew services list  # macOS
systemctl status postgresql  # Linux

# Check connection string format
# Should be: postgresql://user:password@host:port/database
```

**Error:** `P1001: Can't reach database server`
- Verify DATABASE_URL is correct
- Check firewall/network settings
- Verify database is running and accessible

### Port Already in Use

**Error:** `Port 3001 already in use`

```bash
# Find and kill the process
lsof -ti:3001 | xargs kill -9

# Or use a different port
# Set PORT=3002 in server/.env
```

### Missing Dependencies

**Error:** `Cannot find module 'xyz'`

```bash
# Install dependencies
cd server
npm install

# Or install all
cd ..
npm run install:all
```

### Prisma Errors

**Error:** `Prisma schema validation failed`

```bash
# Regenerate Prisma client
cd server
npm run prisma:generate

# Run migrations
npm run prisma:migrate
```

## Debugging Steps

### 1. Check Environment Variables

```bash
cd server
cat .env  # Check if DATABASE_URL is set
```

### 2. Test Database Connection

```bash
cd server
# Test connection
psql $DATABASE_URL -c "SELECT version();"

# Or with explicit connection string
psql "postgresql://user:pass@host:5432/dbname"
```

### 3. Check Server Startup

```bash
cd server
# Run in development mode (shows errors in console)
npm run dev

# Check for TypeScript errors
npm run build  # If using tsc
```

### 4. Enable Debug Logging

Edit `server/.env`:
```env
DEBUG=true
ENABLE_LOGGING=true
LOG_TO_CONSOLE=true
LOG_LEVEL=debug
```

### 5. Check Network/Firewall

```bash
# Test if port is accessible
curl http://localhost:3001/api/health

# Check if server is listening
netstat -an | grep 3001  # macOS/Linux
```

## Quick Diagnostic Commands

```bash
# 1. Check if server starts
cd server
npm run dev

# 2. Check database connection
cd server
psql $DATABASE_URL -c "SELECT 1;"

# 3. Check if dependencies are installed
cd server
npm list --depth=0

# 4. Check Prisma setup
cd server
npx prisma validate
npx prisma generate

# 5. View latest logs
cd server
tail -50 logs/server-$(date +%Y-%m-%d).log

# 6. Check environment variables
cd server
echo $DATABASE_URL  # Should show your connection string
```

## Getting Help

When reporting errors, include:

1. **Error message** (full text)
2. **Where you see it** (terminal, browser console, logs)
3. **When it happens** (startup, runtime, specific action)
4. **Environment** (local, Vercel, Render, etc.)
5. **Environment variables** (without sensitive data):
   ```bash
   # Check what's set (don't share actual values)
   cd server
   cat .env | grep -v "PASSWORD\|SECRET\|TOKEN"
   ```

## Log Locations Summary

| Environment | Log Location |
|------------|--------------|
| **Local Dev** | Terminal console, `server/logs/server-YYYY-MM-DD.log` |
| **Vercel** | Dashboard → Deployment → Logs tab |
| **Render** | Dashboard → Service → Logs tab |
| **Railway** | Dashboard → Service → Logs tab |
| **Cloud Run** | Google Cloud Console → Cloud Run → Logs |
| **Heroku** | `heroku logs --tail` or Dashboard → More → View logs |

