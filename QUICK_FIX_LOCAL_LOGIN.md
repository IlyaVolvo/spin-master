# Quick Fix: Local Login 500 Error

## The Issue
You're getting a 500 error when trying to login locally. This means the request is reaching the server, but the server is encountering an error.

## Immediate Steps

### 1. Check Server Logs

Look at the terminal where you're running the server (`cd server && npm run dev`). You should see an error message when you try to login.

**What to look for:**
- Database connection errors
- Missing environment variables
- Prisma errors
- Any stack traces

### 2. Verify Server is Running

```bash
# Check if server is running
curl http://localhost:3001/api/health
```

Should return: `{"status":"ok"}`

If not, start the server:
```bash
cd server
npm run dev
```

### 3. Check Server Environment Variables

Make sure `server/.env` exists and has:
```env
DATABASE_URL="your-database-url"
JWT_SECRET="your-secret"
SESSION_SECRET="your-secret"
CLIENT_URL="http://localhost:3000"
```

### 4. Most Common Causes

**A. Database Connection Failed**
- Check `DATABASE_URL` is correct in `server/.env`
- Verify database is accessible
- If using Supabase, make sure connection string includes `?sslmode=require`

**B. Prisma Client Not Generated**
```bash
cd server
npx prisma generate
npm run dev  # restart server
```

**C. Missing Environment Variables**
- Check server logs for "not defined" or "undefined" errors
- Verify all required env vars are set

## Next Steps

1. **Check server terminal** - What error message appears when you try to login?
2. Share the error message and I can help you fix it

The 500 error is coming from the server, so the server logs will tell us exactly what's wrong.


