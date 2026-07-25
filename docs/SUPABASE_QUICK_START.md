# Supabase + Vercel Quick Start

This is a condensed version of the deployment guide. Follow these steps in order.

## Step 1: Create Supabase Database (5 minutes)

1. Go to https://supabase.com → Sign up/Login
2. Click **"New Project"**
3. Fill in:
   - Name: `pingpong-tournament`
   - Password: Create strong password (save it!)
   - Region: Choose closest
4. Wait for project to initialize (2-3 minutes)

5. Get connection string:
   - Settings → Database → Connection string → URI
   - Copy the connection string
   - Replace `[YOUR-PASSWORD]` with your password
   - Example: `postgresql://postgres:mypassword@db.xxxxx.supabase.co:5432/postgres`

## Step 2: Deploy Initial Database Baseline (2 minutes)

```bash
cd server

# Edit .env file, set DATABASE_URL to Supabase connection string
# DATABASE_URL="postgresql://postgres:YOUR-PASSWORD@db.xxxxx.supabase.co:5432/postgres?sslmode=require"

# Deploy initial DB baseline (schema + required baseline data)
npm run setup-supabase-initial
```

This initializes:
- latest schema (including `members.qrTokenHash`)
- current `point_exchange_rules` table
- exactly one member: Sys Admin (`ORGANIZER` role only)

Default Sys Admin login:
- email: `sys-admin@fake.local`
- password: `Admin123!` (override via `SYS_ADMIN_PASSWORD`)

## Step 3: Deploy Backend to Render (10 minutes)

1. Go to https://render.com → Sign up/Login

2. Click **"New +"** → **"Web Service"**

3. Connect GitHub repo → Select your repository

4. Configure:
   - Name: `pingpong-api`
   - Root Directory: `server`
   - Build Command: `npm install && npm run build && npx prisma generate`
   - Start Command: `npm start`

5. Add Environment Variables:
   ```
   DATABASE_URL=postgresql://postgres:YOUR-PASSWORD@db.xxxxx.supabase.co:5432/postgres
   JWT_SECRET=generate-random-string-here
   SESSION_SECRET=generate-another-random-string-here
   CLIENT_URL=https://ping-pong-tournament-management-sys.vercel.app
   PORT=10000
   NODE_ENV=production
   ```

   Generate secrets: `openssl rand -hex 32`

6. Click **"Create Web Service"**

7. Wait for deployment (5-10 minutes)

8. Copy your backend URL (e.g., `https://pingpong-api.onrender.com`)

## Step 4: Configure Vercel Frontend (2 minutes)

1. Go to https://vercel.com/dashboard

2. Select your project → **Settings** → **Environment Variables**

3. Add:
   - Key: `VITE_API_URL`
   - Value: `https://pingpong-api.onrender.com/api` (your Render URL + `/api`)
   - Environment: Production

4. **Redeploy:**
   - Deployments → "..." → Redeploy
   - Or push a commit

## Step 5: Test (1 minute)

1. Visit: `https://ping-pong-tournament-management-sys.vercel.app`
2. Login with: `sys-admin@fake.local` / `Admin123!`
3. Should work! ✅

## Troubleshooting

**Backend won't start:**
- Check Render logs for errors
- Verify DATABASE_URL is correct
- Make sure `npm run setup-supabase-initial` completed successfully

**Frontend can't connect:**
- Check VITE_API_URL is set in Vercel
- Make sure you redeployed after setting it
- Check browser console for errors

**Database connection failed:**
- Verify Supabase password is correct
- Check connection string format
- Verify Supabase project is active

## Quick Commands

```bash
# Test backend
curl https://pingpong-api.onrender.com/api/health

# Access Supabase database locally
export DATABASE_URL="your-supabase-connection-string"
cd server
npm run prisma:studio
# Opens at http://localhost:5555
```

Done! Your app should now be fully deployed. 🎉

