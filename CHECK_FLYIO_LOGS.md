# Check Fly.io Logs for 500 Error

The 500 error means the request reached the server, but something is failing. We need to see the actual error from the logs.

## Step 1: View Fly.io Logs

Run this command to see the logs:

```bash
flyctl logs -a spin-master
```

Or view logs in real-time (recommended):

```bash
flyctl logs --app spin-master --follow
```

Then try to login in your browser, and watch the logs for error messages.

## Step 2: Look for These Common Errors

### Database Connection Error
```
Can't reach database server at `db.xxxxx.supabase.co:5432`
```
**Fix**: Make sure `DATABASE_URL` includes `?sslmode=require`

### Missing Environment Variable
```
ERROR: DATABASE_URL is not set!
```
**Fix**: Set all required secrets

### Prisma Error
```
PrismaClientInitializationError
```
**Fix**: Check Prisma Client is generated in Dockerfile

### Session Error
```
Session not initialized
```
**Fix**: Check `SESSION_SECRET` is set

## Step 3: Share the Error

Please copy and paste the error message from the logs when you try to login. This will tell us exactly what's wrong.

## Quick Test

Also test the health endpoint:
```bash
curl https://spin-master.fly.dev/api/health
```

If this works but login doesn't, it's likely a database or authentication issue.


