# How to Delete and Recreate Fly.io App

This guide explains how to completely remove your current Fly.io configuration and start fresh.

## Option 1: Delete App and Start Fresh (Recommended)

### Step 1: Delete the Fly.io App

1. **List your apps** to see the current app name:
   ```bash
   flyctl apps list
   ```

2. **Delete the app** (this removes it from Fly.io):
   ```bash
   flyctl apps destroy your-app-name
   ```
   
   You'll be prompted to confirm. Type "yes" to confirm.

   ⚠️ **Warning**: This permanently deletes the app and all its data. If you have any data you want to keep, back it up first.

### Step 2: Remove Local Configuration Files

Delete the local Fly.io configuration:

```bash
# Remove fly.toml
rm fly.toml

# Remove .fly directory if it exists
rm -rf .fly
```

### Step 3: Create New App

1. **Initialize new app**:
   ```bash
   flyctl launch
   ```

2. When prompted:
   - **App name**: Choose a new unique name
   - **Region**: Choose your region
   - **PostgreSQL**: Skip (using Supabase)
   - **Redis**: Skip
   - **Deploy now**: No (configure first)

3. **Configure fly.toml** (see `FLYIO_FLYTOML_CONFIG.md` for details)

4. **Set environment variables**:
   ```bash
   flyctl secrets set DATABASE_URL="your-database-url"
   flyctl secrets set JWT_SECRET="your-secret"
   flyctl secrets set SESSION_SECRET="your-secret"
   flyctl secrets set CLIENT_URL="your-vercel-url"
   flyctl secrets set NODE_ENV="production"
   ```

5. **Deploy**:
   ```bash
   flyctl deploy
   ```

---

## Option 2: Keep App, Just Reset Configuration

If you want to keep the same app but reset the configuration:

### Step 1: Remove Local Files Only

```bash
# Remove fly.toml
rm fly.toml

# Remove .fly directory
rm -rf .fly
```

### Step 2: Reconnect to Existing App

1. **List apps** to find your app name:
   ```bash
   flyctl apps list
   ```

2. **Create new fly.toml** for existing app:
   ```bash
   flyctl config save -a your-app-name
   ```
   
   This downloads the current configuration from Fly.io.

3. **Or create manually**: Copy the `fly.toml` template from `FLYIO_FLYTOML_CONFIG.md` and set the app name.

### Step 3: Update Configuration

Edit `fly.toml` as needed, then deploy:
```bash
flyctl deploy
```

---

## Option 3: Rename/Change App Name

If you want to change the app name:

### Step 1: Create New App with New Name

```bash
flyctl launch
# Choose new app name when prompted
```

### Step 2: Delete Old App (Optional)

If you no longer need the old app:
```bash
flyctl apps destroy old-app-name
```

---

## Complete Clean Slate (Nuclear Option)

If you want to completely start over:

```bash
# 1. Delete the app from Fly.io
flyctl apps destroy your-app-name

# 2. Remove all local Fly.io files
rm fly.toml
rm -rf .fly

# 3. Remove Dockerfile if you want to recreate it
rm Dockerfile

# 4. Remove .dockerignore if you want to recreate it
rm .dockerignore

# 5. Logout and login again (optional)
flyctl auth logout
flyctl auth login

# 6. Create fresh app
flyctl launch
```

---

## Verification Steps

After recreating, verify everything:

1. **Check app status**:
   ```bash
   flyctl status
   ```

2. **Check secrets**:
   ```bash
   flyctl secrets list
   ```

3. **View logs**:
   ```bash
   flyctl logs
   ```

4. **Test health endpoint**:
   ```bash
   curl https://your-app-name.fly.dev/api/health
   ```

---

## Common Issues

### Error: "App not found"
- The app was already deleted or name is wrong
- Use `flyctl apps list` to see available apps

### Error: "App name already taken"
- Choose a different, unique app name
- Fly.io app names are globally unique

### Error: "Permission denied"
- Make sure you're logged in: `flyctl auth whoami`
- Make sure you own the app or have access

### Configuration Not Working
- Verify `fly.toml` is in project root
- Check `flyctl config validate` for errors
- Ensure Dockerfile exists if using Dockerfile build

---

## Quick Reference

```bash
# List all apps
flyctl apps list

# Delete app
flyctl apps destroy app-name

# Create new app
flyctl launch

# View current config
flyctl config show

# Validate config
flyctl config validate

# Deploy
flyctl deploy

# View status
flyctl status

# View logs
flyctl logs
```


