# Fix Prisma Binary Target Issue on Fly.io

## The Problem

Prisma Client is being generated for "linux-musl" but Fly.io's Alpine Linux requires "linux-musl-openssl-3.0.x".

## Solution Applied

1. ✅ Updated `server/prisma/schema.prisma` to include the correct binary target
2. ✅ Updated Dockerfile to explicitly use the schema file

## Next Steps: Force Rebuild

Fly.io might be using cached Docker layers. You need to force a clean rebuild:

### Option 1: Deploy with No Cache (Recommended)

```bash
flyctl deploy -a spin-master --no-cache
```

The `--no-cache` flag forces Fly.io to rebuild everything from scratch.

### Option 2: Clear Build Cache in Fly.io

1. Go to Fly.io dashboard
2. Find your app
3. Look for cache clearing options
4. Or use: `flyctl cache clear -a spin-master` (if available)

### Option 3: Make a Small Change to Force Rebuild

Make a small change to trigger a new build:
- Add a comment to Dockerfile
- Or touch a file

Then deploy:
```bash
flyctl deploy -a spin-master
```

## Verify the Fix

After redeployment, check logs:
```bash
flyctl logs -a spin-master
```

Try to login and verify there are no more Prisma binary target errors.

## What Was Changed

**server/prisma/schema.prisma:**
```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "linux-musl-openssl-3.0.x"]
}
```

**Dockerfile:**
- Explicitly uses `--schema=./prisma/schema.prisma` to ensure correct schema is used

## If Still Not Working

If you still see the error after `--no-cache` deploy:

1. Verify the schema file was committed and pushed:
   ```bash
   git log -1 -- server/prisma/schema.prisma
   ```

2. Check the build logs to see if Prisma generate ran:
   ```bash
   flyctl logs -a spin-master | grep -i prisma
   ```

3. Try rebuilding Prisma Client locally first to verify:
   ```bash
   cd server
   npx prisma generate
   ```


