# Complete Vercel + Supabase Deployment Guide

This guide covers deploying your PingPong Tournament app using:
- **Frontend** → Vercel (static site hosting)
- **Database** → Supabase (PostgreSQL)
- **Backend** → Railway, Fly.io, or Google Cloud Run (Vercel doesn't support Express backends)

## Important Note: Backend Deployment

**Vercel is primarily for frontend/static sites and serverless functions.** Your Express backend needs a different hosting solution. Options:
- **Railway** (recommended - easiest, free tier available)
- **Fly.io** (good free tier)
- **Google Cloud Run** (pay-as-you-go)
- **Vercel Serverless Functions** (requires refactoring Express app)

---

## Part 1: Set Up Supabase Database

### Step 1.1: Create Supabase Project

1. Go to https://supabase.com
2. Sign up or log in
3. Click **"New Project"**
4. Fill in:
   - **Name**: `pingpong-tournament`
   - **Database Password**: Create a strong password (**save this!**)
   - **Region**: Choose closest to you
   - **Pricing Plan**: Free tier is fine to start
5. Click **"Create new project"**
6. Wait 2-3 minutes for initialization

### Step 1.2: Get Database Connection String

1. In Supabase project → **Settings** → **Database**
2. Scroll to **"Connection string"**
3. Select **"URI"** tab
4. Copy the connection string:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres
   ```
5. **Replace `[YOUR-PASSWORD]`** with your actual password
6. **Save this connection string** - you'll need it for your backend

### Step 1.3: Run Database Migrations

```bash
# 1. Set DATABASE_URL in your environment
cd server

# 2. Edit .env file (or export)
export DATABASE_URL="postgresql://postgres:YOUR-PASSWORD@db.xxxxx.supabase.co:5432/postgres"

# 3. Run migrations
npx prisma migrate deploy

# 4. Generate Prisma client
npm run prisma:generate
```

**Or use the reset script:**
```bash
# Update DATABASE_URL in reset-supabase-migrations.sh first
./reset-supabase-migrations.sh
```

### Step 1.4: Verify Database

1. Go to Supabase → **Table Editor**
2. You should see tables: `members`, `tournaments`, `matches`, `rating_history`, etc.
3. If tables don't exist, migrations didn't run successfully - check error messages

---

## Part 2: Deploy Backend (Choose One Option)

### Option A: Railway (Recommended - Easiest)

Railway is the easiest alternative to Render.

#### Step 2A.1: Create Railway Account

1. Go to https://railway.app
2. Sign up with GitHub
3. Click **"New Project"**

#### Step 2A.2: Deploy Backend

1. Click **"New"** → **"GitHub Repo"**
2. Select your repository
3. Railway will auto-detect it's a Node.js project
4. Click on the service to configure it

#### Step 2A.3: Configure Build Settings

1. **Click on your service** (the service card)
2. **Click the "Settings" tab** at the top
3. **Find "Source" section** (scroll down if needed)
4. **Set Root Directory** to: `server` ⚠️ **CRITICAL**: This must be set or Railway won't find your package.json!
   - Look for a field labeled "Root Directory"
   - Enter: `server`
   - Click Save
5. **Set Build Command** (usually in "Build & Deploy" section):
   - Value: `npm install && npm run build && npx prisma generate`
   - Note: `npx prisma generate` is essential - it generates the Prisma client that maps CamelCase model names (like `Member`) to snake_case table names (like `members`) in your database
6. **Set Start Command** (usually in "Build & Deploy" section):
   - Value: `npm start`
   - This will use the `start` script from your `server/package.json` which runs `tsx src/index.ts`
   - If Railway shows "No start command found", make sure Root Directory is set to `server` and redeploy

#### Step 2A.4: Set Environment Variables

1. Click **"Variables"** tab
2. Add these variables:

   ```
   DATABASE_URL=postgresql://postgres:YOUR-PASSWORD@db.xxxxx.supabase.co:5432/postgres
   JWT_SECRET=generate-a-random-secret-here
   SESSION_SECRET=generate-another-random-secret-here
   CLIENT_URL=https://your-vercel-app.vercel.app
   NODE_ENV=production
   PORT=3000
   ```

   **Generate secrets:**
   ```bash
   openssl rand -hex 32
   ```
   Run this twice to get two different secrets.

3. Click **"Add"** for each variable

#### Step 2A.5: Deploy

1. Railway will automatically deploy
2. Wait for deployment to complete (first deploy takes 5-10 minutes)
3. Click **"Settings"** → **"Generate Domain"** to get your backend URL
4. **Copy your Railway backend URL** (e.g., `https://pingpong-api.railway.app`)

---

### Option B: Fly.io

#### Step 2B.1: Install Fly CLI

```bash
# macOS
curl -L https://fly.io/install.sh | sh

# Or use Homebrew
brew install flyctl
```

#### Step 2B.2: Login to Fly

```bash
fly auth login
```

#### Step 2B.3: Initialize Fly App

```bash
cd server
fly launch
```

Answer the prompts:
- **App name**: `pingpong-api` (or any name)
- **Region**: Choose closest to you
- **PostgreSQL**: No (we're using Supabase)
- **Redis**: No

#### Step 2B.4: Create fly.toml Configuration

Edit `server/fly.toml`:

```toml
app = "pingpong-api"
primary_region = "iad"  # Change to your region

[build]
  builder = "paketobuildpacks/builder:base"

[env]
  PORT = "3000"
  NODE_ENV = "production"

[[services]]
  internal_port = 3000
  protocol = "tcp"
  processes = ["app"]

  [[services.ports]]
    port = 80
    handlers = ["http"]
    force_https = true

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

  [services.concurrency]
    type = "connections"
    hard_limit = 1000
    soft_limit = 500
```

#### Step 2B.5: Set Secrets

```bash
fly secrets set DATABASE_URL="postgresql://postgres:YOUR-PASSWORD@db.xxxxx.supabase.co:5432/postgres"
fly secrets set JWT_SECRET="your-random-secret-here"
fly secrets set SESSION_SECRET="your-another-random-secret-here"
fly secrets set CLIENT_URL="https://your-vercel-app.vercel.app"
fly secrets set NODE_ENV="production"
```

#### Step 2B.6: Deploy

```bash
fly deploy
```

#### Step 2B.7: Get Your URL

```bash
fly status
# Or
fly open
```

Your backend will be at: `https://pingpong-api.fly.dev`

---

### Option C: Google Cloud Run (Advanced)

#### Step 2C.1: Set Up Google Cloud

1. Go to https://cloud.google.com
2. Create a project
3. Enable Cloud Run API
4. Install Google Cloud CLI:
   ```bash
   brew install google-cloud-sdk  # macOS
   ```

#### Step 2C.2: Create Dockerfile

Create `server/Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Build (if needed)
RUN npm run build || true

# Expose port
EXPOSE 3000

# Start
CMD ["npm", "start"]
```

#### Step 2C.3: Deploy to Cloud Run

```bash
cd server

# Set project
gcloud config set project YOUR_PROJECT_ID

# Build and deploy
gcloud run deploy pingpong-api \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars DATABASE_URL="postgresql://postgres:YOUR-PASSWORD@db.xxxxx.supabase.co:5432/postgres",JWT_SECRET="your-secret",SESSION_SECRET="your-secret",CLIENT_URL="https://your-vercel-app.vercel.app",NODE_ENV="production",PORT="3000"
```

#### Step 2C.4: Get Your URL

After deployment, Cloud Run will give you a URL like:
`https://pingpong-api-xxxxx-uc.a.run.app`

---

## Part 3: Deploy Frontend to Vercel

### Step 3.1: Prepare Your Project

Make sure your code is committed and pushed to GitHub:

```bash
git add .
git commit -m "Prepare for Vercel deployment"
git push
```

### Step 3.2: Connect to Vercel

1. Go to https://vercel.com
2. Sign up/Login with GitHub
3. Click **"Add New..."** → **"Project"**
4. Import your GitHub repository
5. Click **"Import"**

### Step 3.3: Configure Project Settings

Vercel should auto-detect settings, but verify:

- **Framework Preset**: Leave as "Other" or "Vite"
- **Root Directory**: Leave as `./` (root)
- **Build Command**: `cd client && npm run build`
- **Output Directory**: `client/dist`
- **Install Command**: `npm run install:all` (or leave default)

### Step 3.4: Set Environment Variables

1. **Get your backend URL first:**
   - Railway: Go to Service → Settings → Generate Domain → Copy URL (e.g., `https://pingpong-api.railway.app`)
   - Fly.io: Run `fly status` or check Fly.io dashboard
   - Cloud Run: Shown after deployment

2. **In Vercel Dashboard:**
   - Go to Your Project → **Settings** → **Environment Variables**
   - Click **"Add New"** or **"Add"**
   - Add:
     - **Key**: `VITE_API_URL`
     - **Value**: `https://your-backend-url.com/api`
       - **Important**: Always add `/api` at the end!
       - Railway example: `https://pingpong-api.railway.app/api`
       - Fly.io example: `https://pingpong-api.fly.dev/api`
       - Cloud Run example: `https://pingpong-api-xxxxx-uc.a.run.app/api`
     - **Environment**: Production (and Preview if you want)
   - Click **"Save"**

3. **Important**: After adding/changing `VITE_API_URL`, you must **redeploy** your Vercel project because `VITE_*` environment variables are embedded at build time!

### Step 3.5: Deploy

1. Click **"Deploy"**
2. Wait for deployment (2-5 minutes)
3. Vercel will provide a URL like: `https://your-app.vercel.app`

### Step 3.6: Update Backend CLIENT_URL

Go back to your backend deployment (Railway/Fly.io/Cloud Run) and update `CLIENT_URL` to match your Vercel URL:

```
CLIENT_URL=https://your-app.vercel.app
```

Then redeploy your backend.

---

## Part 4: Create Admin User

After both backend and frontend are deployed:

### Option 1: Using the Script (Locally)

```bash
cd server

# Set DATABASE_URL to Supabase
export DATABASE_URL="postgresql://postgres:YOUR-PASSWORD@db.xxxxx.supabase.co:5432/postgres"

# Create admin
export SYS_ADMIN_EMAIL="admin@pingpong.com"
export SYS_ADMIN_PASSWORD="YourSecurePassword123!"
npm run create-sys-admin
```

### Option 2: Via Supabase SQL Editor

1. Go to Supabase → **SQL Editor**
2. Create a new query:

```sql
-- First, hash your password (you'll need to generate this)
-- Use: node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('YourPassword123!', 10))"

INSERT INTO "members" (
  "email", 
  "password", 
  "firstName", 
  "lastName", 
  "gender", 
  "roles", 
  "isActive"
) VALUES (
  'admin@pingpong.com',
  '$2a$10$YOUR_HASHED_PASSWORD_HERE',
  'System',
  'Administrator',
  'OTHER',
  ARRAY['ADMIN']::"MemberRole"[],
  true
);
```

---

## Part 5: Verify Deployment

### 5.1: Test Backend

```bash
# Test health endpoint
curl https://your-backend-url.com/api/health

# Should return: {"status":"ok"}
```

### 5.2: Test Frontend

1. Visit your Vercel URL: `https://your-app.vercel.app`
2. Open browser console (F12)
3. Check Network tab - API calls should go to your backend
4. Try logging in with admin credentials

### 5.3: Check Logs

**Vercel:**
- Go to Vercel Dashboard → Your Project → **Deployments** → Click deployment → **Logs**

**Railway:**
- Dashboard → Your Service → **Logs** tab

**Fly.io:**
```bash
fly logs
```

**Cloud Run:**
- Cloud Console → Cloud Run → Your Service → **Logs** tab

---

## Part 6: Custom Domain (Optional)

### For Vercel:

1. Vercel Dashboard → Your Project → **Settings** → **Domains**
2. Add your domain
3. Follow DNS configuration instructions

### For Backend (Railway/Fly.io):

**Railway:**
- Settings → **Generate Domain** (or add custom domain)

**Fly.io:**
```bash
fly certs add your-domain.com
```

---

## Troubleshooting

### Frontend Can't Connect to Backend

1. **Check VITE_API_URL:**
   - Vercel Dashboard → Settings → Environment Variables
   - Make sure it's set correctly (should end with `/api`)
   - **Important:** Redeploy after changing environment variables

2. **Check CORS:**
   - Backend `CLIENT_URL` should match your Vercel domain
   - Check backend logs for CORS errors

3. **Check Backend is Running:**
   ```bash
   curl https://your-backend-url.com/api/health
   ```

### Database Connection Failed

1. **Check Connection String:**
   - Verify password is correct
   - Make sure you replaced `[YOUR-PASSWORD]` with actual password
   - Check Supabase project is active

2. **Check Supabase Settings:**
   - Settings → Database → Connection pooling
   - Verify IP restrictions (should allow all for now)

### Build Failures

**Vercel:**
- Check build logs in Vercel Dashboard
- Common issues: Missing dependencies, wrong build command

**Backend:**
- Check logs in Railway/Fly.io/Cloud Run dashboard
- Common issues: Missing environment variables, build command errors

---

## Summary Checklist

- [ ] Created Supabase project
- [ ] Got Supabase connection string
- [ ] Ran database migrations successfully
- [ ] Chose backend hosting (Railway/Fly.io/Cloud Run)
- [ ] Deployed backend with environment variables
- [ ] Got backend URL
- [ ] Created Vercel project
- [ ] Set VITE_API_URL in Vercel
- [ ] Deployed frontend to Vercel
- [ ] Updated backend CLIENT_URL to match Vercel URL
- [ ] Created admin user
- [ ] Tested login on Vercel deployment
- [ ] Verified database tables in Supabase

---

## Quick Reference

**Supabase Connection String:**
```
postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres
```

**Backend URL Examples:**
- Railway: `https://pingpong-api.railway.app`
- Fly.io: `https://pingpong-api.fly.dev`
- Cloud Run: `https://pingpong-api-xxxxx-uc.a.run.app`

**Vercel Frontend URL:**
```
https://your-app.vercel.app
```

**Environment Variables:**

**Backend (Railway/Fly.io/Cloud Run):**
- `DATABASE_URL` - Supabase connection string
- `JWT_SECRET` - Random secret (generate with `openssl rand -hex 32`)
- `SESSION_SECRET` - Random secret
- `CLIENT_URL` - Your Vercel frontend URL
- `NODE_ENV` - `production`
- `PORT` - `3000` (usually auto-set)

**Vercel (Frontend):**
- `VITE_API_URL` - Your backend URL + `/api`

---

## Next Steps

After deployment:
1. Test all features
2. Create more members/players
3. Set up custom domains (optional)
4. Monitor logs for any issues
5. Set up backups for Supabase database (optional)

Need help? Check the logs in each platform's dashboard for detailed error messages.

