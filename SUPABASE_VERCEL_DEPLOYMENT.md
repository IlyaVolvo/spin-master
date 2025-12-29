# Complete Deployment Guide: Vercel + Supabase

This guide walks you through deploying:
- **Frontend** → Vercel
- **Backend** → Render.com or Railway (Vercel serverless functions are not ideal for this backend)
- **Database** → Supabase (PostgreSQL)

## Architecture

```
┌─────────────┐      API Calls      ┌──────────────┐     DATABASE_URL    ┌─────────────┐
│   Vercel    │ ──────────────────> │   Render/    │ ─────────────────> │  Supabase   │
│  (Frontend) │                     │   Railway    │                    │ (PostgreSQL)│
│             │                     │  (Backend)   │                    │             │
└─────────────┘                     └──────────────┘                    └─────────────┘
```

## Step 1: Set Up Supabase Database

### 1.1 Create Supabase Project

1. Go to https://supabase.com
2. Sign up or log in
3. Click **"New Project"**
4. Fill in:
   - **Name**: `pingpong-tournament` (or any name)
   - **Database Password**: Create a strong password (save it!)
   - **Region**: Choose closest to you
   - **Pricing Plan**: Free tier is fine to start
5. Click **"Create new project"**
6. Wait 2-3 minutes for project to initialize

### 1.2 Get Database Connection String

1. In your Supabase project, go to **Settings** → **Database**
2. Scroll down to **"Connection string"**
3. Select **"URI"** tab
4. Copy the connection string (it looks like):
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres
   ```
5. Replace `[YOUR-PASSWORD]` with the password you created
6. **Save this connection string** - you'll need it for your backend

**Note:** There's also a "Connection pooling" option - use the regular connection string for now.

### 1.3 Run Database Migrations

Your database needs the schema (tables, etc.). You have two options:

**Option A: Using Prisma Migrate (Recommended)**

1. Update your local `.env` temporarily:
   ```bash
   cd server
   # Edit .env file, set DATABASE_URL to Supabase connection string
   DATABASE_URL="postgresql://postgres:YOUR-PASSWORD@db.xxxxx.supabase.co:5432/postgres"
   ```

2. Run migrations:
   ```bash
   cd server
   npx prisma migrate deploy
   ```

3. Generate Prisma client:
   ```bash
   npm run prisma:generate
   ```

**Option B: Using Supabase SQL Editor**

1. Go to Supabase project → **SQL Editor**
2. Click **"New query"**
3. Copy the contents of your latest migration file from `server/prisma/migrations/`
4. Paste and run the SQL
5. (Less recommended - use Prisma migrate if possible)

## Step 2: Deploy Backend to Render.com

### 2.1 Create Render Account

1. Go to https://render.com
2. Sign up (free tier available)

### 2.2 Create PostgreSQL Database (Optional - Only if Not Using Supabase)

**Skip this step** since you're using Supabase.

### 2.3 Deploy Backend Service

1. In Render dashboard, click **"New +"** → **"Web Service"**
2. Connect your GitHub repository:
   - Click **"Connect account"** if not connected
   - Select your repository
3. Configure the service:
   - **Name**: `pingpong-api` (or any name)
   - **Region**: Choose closest to you
   - **Branch**: `main`
   - **Root Directory**: `server`
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build && npx prisma generate`
   - **Start Command**: `npm start`
   - **Instance Type**: Free tier is fine to start
4. Click **"Advanced"** → **"Add Environment Variable"**
5. Add these environment variables:

   ```
   DATABASE_URL=postgresql://postgres:YOUR-PASSWORD@db.xxxxx.supabase.co:5432/postgres
   JWT_SECRET=your-random-secret-key-here-make-it-long-and-random
   SESSION_SECRET=another-random-secret-key-here
   CLIENT_URL=https://ping-pong-tournament-management-sys.vercel.app
   PORT=10000
   NODE_ENV=production
   ```

   **Important:**
   - Replace `YOUR-PASSWORD` with your Supabase password
   - Replace the host with your actual Supabase host
   - Generate random strings for `JWT_SECRET` and `SESSION_SECRET` (you can use: `openssl rand -hex 32`)
   - Use your actual Vercel frontend URL for `CLIENT_URL`

6. Click **"Create Web Service"**
7. Render will start building and deploying your backend
8. Wait for deployment to complete (first deployment takes 5-10 minutes)
9. **Copy the service URL** (e.g., `https://pingpong-api.onrender.com`)

### 2.4 Update Supabase Connection Settings (If Needed)

1. Go to Supabase → **Settings** → **Database**
2. Scroll to **"Connection Pooling"**
3. If you're using connection pooling (optional), update the connection string
4. For most cases, the regular connection string works fine

## Step 3: Configure Vercel Frontend

### 3.1 Set Environment Variable in Vercel

1. Go to https://vercel.com/dashboard
2. Select your project: `ping-pong-tournament-management-sys`
3. Go to **Settings** → **Environment Variables**
4. Click **"Add New"**
5. Add:
   - **Key**: `VITE_API_URL`
   - **Value**: `https://pingpong-api.onrender.com/api` (use your actual Render backend URL + `/api`)
   - **Environment**: Select `Production` (and `Preview` if you want)
6. Click **"Save"**

### 3.2 Redeploy Frontend

After adding the environment variable:

1. Go to **Deployments** tab
2. Click **"..."** menu on the latest deployment
3. Click **"Redeploy"**
4. Or push a new commit to trigger a new build

**Important:** `VITE_*` environment variables are embedded at build time, so you must trigger a new build after adding/changing them.

## Step 4: Create Admin User

After your backend is deployed and connected to Supabase:

### Option A: Using the Script (Recommended)

1. **Locally, temporarily set DATABASE_URL to Supabase:**
   ```bash
   cd server
   # Edit .env file
   DATABASE_URL="postgresql://postgres:YOUR-PASSWORD@db.xxxxx.supabase.co:5432/postgres"
   ```

2. **Run the createSysAdmin script:**
   ```bash
   cd server
   npm run create-sys-admin
   ```

3. **Or set environment variables:**
   ```bash
   export SYS_ADMIN_EMAIL="admin@pingpong.com"
   export SYS_ADMIN_PASSWORD="YourSecurePassword123!"
   npm run create-sys-admin
   ```

### Option B: Through API (After Backend is Deployed)

1. **Create member via API:**
   ```bash
   curl -X POST https://pingpong-api.onrender.com/api/players \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -d '{
       "firstName": "System",
       "lastName": "Administrator",
       "email": "admin@pingpong.com",
       "gender": "OTHER",
       "birthDate": "1990-01-01",
       "roles": ["ADMIN"]
     }'
   ```

2. **Or use Supabase SQL Editor:**
   ```sql
   -- This requires hashing the password, so Option A is easier
   ```

## Step 5: Verify Everything Works

### 5.1 Test Backend

```bash
# Test backend health endpoint
curl https://pingpong-api.onrender.com/api/health

# Should return: {"status":"ok"}
```

### 5.2 Test Database Connection

Check Render logs to ensure backend connected to Supabase:
1. Render Dashboard → Your Service → **Logs** tab
2. Look for successful database connection messages
3. Look for "Server started" message

### 5.3 Test Frontend

1. Visit your Vercel URL: `https://ping-pong-tournament-management-sys.vercel.app`
2. Open browser console (F12)
3. Check Network tab - API calls should go to your Render backend
4. Try logging in with your admin credentials

### 5.4 Verify Database

Access Supabase database:
1. Go to Supabase → **Table Editor**
2. You should see your tables: `Member`, `Tournament`, `Match`, etc.
3. Check the `Member` table - you should see your admin user

## Step 6: Access Database from Supabase

### Method 1: Supabase Dashboard (Easiest)

1. Go to your Supabase project
2. Click **"Table Editor"** in the sidebar
3. Browse and edit tables visually

### Method 2: SQL Editor

1. Go to **SQL Editor**
2. Write and run SQL queries:
   ```sql
   SELECT * FROM "Member";
   SELECT COUNT(*) FROM "Tournament";
   ```

### Method 3: Connection String (External Tools)

1. Go to **Settings** → **Database**
2. Copy **Connection string** (URI)
3. Use with:
   - **psql**: `psql "postgresql://postgres:PASSWORD@host:5432/postgres"`
   - **Prisma Studio**: Set `DATABASE_URL` and run `npm run prisma:studio`
   - **TablePlus/DBeaver**: Use connection string

### Method 4: Supabase CLI (Advanced)

```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Access database
supabase db shell
```

## Troubleshooting

### Backend Can't Connect to Supabase

1. **Check connection string:**
   - Make sure password is correct
   - Make sure host is correct
   - Make sure connection string includes `/postgres` database name

2. **Check Supabase settings:**
   - Go to Settings → Database
   - Verify database is active
   - Check if IP restrictions are enabled (should allow all for now)

3. **Check Render logs:**
   - Look for database connection errors
   - Common errors: "password authentication failed", "connection refused"

### Frontend Can't Connect to Backend

1. **Check VITE_API_URL:**
   - Verify it's set in Vercel
   - Format should be: `https://your-backend-url.com/api`
   - Make sure you redeployed after setting it

2. **Check CORS:**
   - Backend `CLIENT_URL` should match your Vercel domain
   - Check Render logs for CORS errors

3. **Check backend is running:**
   - Visit backend URL: `https://pingpong-api.onrender.com/api/health`
   - Should return `{"status":"ok"}`

### Database Schema Missing

1. **Run migrations:**
   ```bash
   cd server
   DATABASE_URL="your-supabase-connection-string" npx prisma migrate deploy
   ```

2. **Check Supabase:**
   - Go to Table Editor
   - Tables should exist if migrations ran successfully

## Summary Checklist

- [ ] Created Supabase project
- [ ] Got Supabase database connection string
- [ ] Ran Prisma migrations to create database schema
- [ ] Created Render account
- [ ] Deployed backend to Render
- [ ] Set environment variables in Render (DATABASE_URL, JWT_SECRET, etc.)
- [ ] Backend is running and accessible
- [ ] Set VITE_API_URL in Vercel
- [ ] Redeployed Vercel frontend
- [ ] Created admin user in database
- [ ] Tested login on Vercel deployment
- [ ] Verified database tables exist in Supabase

## Quick Reference

**Supabase Connection String:**
```
postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres
```

**Render Backend URL:**
```
https://pingpong-api.onrender.com
```

**Vercel Frontend URL:**
```
https://ping-pong-tournament-management-sys.vercel.app
```

**Environment Variables Needed:**

**Render (Backend):**
- `DATABASE_URL` - Supabase connection string
- `JWT_SECRET` - Random secret key
- `SESSION_SECRET` - Random secret key
- `CLIENT_URL` - Your Vercel frontend URL
- `PORT` - Usually 10000 (Render sets this automatically)
- `NODE_ENV` - `production`

**Vercel (Frontend):**
- `VITE_API_URL` - Your Render backend URL + `/api`

## Next Steps

After deployment:
1. Test all features
2. Create your first admin user
3. Add more members/players
4. Create tournaments
5. Monitor logs in Render and Supabase for any issues

Need help with any step? Let me know!

