# Local Server Login Issue Troubleshooting

## Issue: 500 Error on Local Login

You're getting a 500 Internal Server Error when trying to login locally.

## Quick Fixes

### Problem 1: Port Mismatch

**The Issue:**
- Frontend is trying to connect to `http://localhost:3000`
- Backend server runs on port `3001` by default

**Solution:**

**Option A: Set VITE_API_URL for local development**

Create or update `client/.env.local`:
```bash
VITE_API_URL=http://localhost:3001
```

Then restart your frontend dev server.

**Option B: Use Vite Proxy (if not already configured)**

Check `client/vite.config.ts` - if it has a proxy, make sure it's correct.

### Problem 2: Server Not Running

**Check if server is running:**
```bash
cd server
npm run dev
```

You should see:
```
Server running on localhost:3001
```

### Problem 3: Database Connection

The 500 error might be due to database connection issues.

**Check server logs** when you try to login - look for error messages.

**Verify DATABASE_URL is set:**
```bash
cd server
cat .env | grep DATABASE_URL
```

### Problem 4: Check Server Logs

The 500 error has a cause. Check your server terminal/logs for the actual error:

1. Look at the terminal where you ran `npm run dev` in the server directory
2. Or check `server/logs/server-YYYY-MM-DD.log`

Common errors:
- Database connection failed
- Missing environment variables
- Prisma Client not generated

## Step-by-Step Debugging

### Step 1: Verify Server is Running

```bash
# In server directory
cd server
npm run dev
```

Should output:
```
Server running on localhost:3001
```

### Step 2: Test Server Health Endpoint

```bash
curl http://localhost:3001/api/health
```

Should return:
```json
{"status":"ok"}
```

### Step 3: Configure Frontend API URL

Create `client/.env.local`:
```bash
VITE_API_URL=http://localhost:3001
```

### Step 4: Restart Frontend Dev Server

```bash
cd client
# Stop current server (Ctrl+C)
npm start
```

### Step 5: Test Login

Try logging in again and check:
1. Browser Network tab - what URL is it hitting?
2. Server terminal - what error appears?
3. Browser Console - any additional error messages?

## Common Error Messages

### "Can't reach database server"
- Check `DATABASE_URL` in `server/.env`
- Verify database is accessible
- Check if using local PostgreSQL or Supabase

### "PrismaClient is not configured"
- Run: `cd server && npx prisma generate`
- Restart server

### "Missing environment variable"
- Check `server/.env` has all required variables:
  - `DATABASE_URL`
  - `JWT_SECRET`
  - `SESSION_SECRET`

### CORS Errors
- Check `CLIENT_URL` in `server/.env` matches frontend URL
- Default should be `http://localhost:3000` for local dev

## Quick Test Commands

```bash
# Test server health
curl http://localhost:3001/api/health

# Test login endpoint (will fail without proper credentials, but tests connectivity)
curl -X POST http://localhost:3001/api/auth/member/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test"}'

# Check server logs
tail -f server/logs/server-$(date +%Y-%m-%d).log
```

## Expected Configuration for Local Development

### `server/.env`:
```env
DATABASE_URL="your-database-url"
JWT_SECRET="your-secret-key"
SESSION_SECRET="your-session-secret"
CLIENT_URL="http://localhost:3000"
PORT=3001
NODE_ENV=development
```

### `client/.env.local`:
```env
VITE_API_URL=http://localhost:3001
```

## Still Not Working?

1. **Check server terminal** for the actual error message
2. **Check browser console** for additional errors
3. **Check Network tab** to see the exact request/response
4. **Verify server is actually running** on port 3001
5. **Check database connection** is working


