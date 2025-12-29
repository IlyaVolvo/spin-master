# Debugging 500 Error on Fly.io

A 500 error means the request reached the server, but something is failing on the server side.

## Step 1: Check Fly.io Logs

The logs will show the actual error. Run:

```bash
flyctl logs
```

Or view logs in real-time:
```bash
flyctl logs -a spin-master
```

Look for error messages when you try to login. Common errors:

### Database Connection Error
```
Can't reach database server at `db.xxxxx.supabase.co:5432`
```
**Fix**: Check `DATABASE_URL` includes `?sslmode=require`

### Prisma Client Error
```
PrismaClient is not configured
```
**Fix**: Prisma Client needs to be generated in Dockerfile

### Missing Environment Variable
```
ERROR: DATABASE_URL is not set!
```
**Fix**: Set all required environment variables

### Other Errors
Look for stack traces or specific error messages in the logs.

## Step 2: Verify Environment Variables

Check all secrets are set:

```bash
flyctl secrets list -a spin-master
```

Required variables:
- `DATABASE_URL` - Should include `?sslmode=require`
- `JWT_SECRET`
- `SESSION_SECRET`
- `CLIENT_URL` - Your Vercel URL (no trailing slash)
- `NODE_ENV=production`

## Step 3: Test Health Endpoint

```bash
curl https://spin-master.fly.dev/api/health
```

Should return: `{"status":"ok"}`

If this fails, the server isn't running properly.

## Step 4: Check Server Status

```bash
flyctl status -a spin-master
```

Verify the app is running and healthy.

## Step 5: Common Fixes

### Fix 1: Database Connection

Make sure `DATABASE_URL` has SSL:
```bash
flyctl secrets set DATABASE_URL="postgresql://postgres:PASSWORD@db.xxxxx.supabase.co:5432/postgres?sslmode=require" -a spin-master
```

### Fix 2: Regenerate Prisma Client

The Dockerfile should run `npx prisma generate`. Verify it's in the Dockerfile.

### Fix 3: Restart App

After changing secrets:
```bash
flyctl apps restart spin-master
```

## Step 6: Share the Error

Please share:
1. The error message from `flyctl logs`
2. The output of `flyctl status`
3. The output of `curl https://spin-master.fly.dev/api/health`

This will help identify the exact issue.


