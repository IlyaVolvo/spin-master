# Vercel + Fly.io + Supabase Deployment Guide

This guide explains how to deploy:
- **Frontend** on Vercel
- **Backend** on Fly.io
- **Database** on Supabase

## Architecture Overview

```
┌──────────┐      HTTP/HTTPS      ┌─────────┐      PostgreSQL      ┌──────────┐
│  Vercel  │ ──────────────────>  │ Fly.io  │ ─────────────────>  │ Supabase │
│ (Client) │                      │(Server) │                     │(Database)│
└──────────┘                      └─────────┘                     └──────────┘
```

## Prerequisites

1. Vercel account (free tier works)
2. Fly.io account (sign up at fly.io)
3. Supabase account and project created
4. Git repository with your code

---

## Part 1: Supabase Database Setup

### Step 1.1: Create Supabase Project
1. Go to [supabase.com](https://supabase.com) and sign in
2. Click "New Project"
3. Fill in:
   - **Name**: Your project name
   - **Database Password**: Choose a strong password (save it!)
   - **Region**: Choose closest to your users
4. Click "Create new project"

### Step 1.2: Get Database Connection String
1. Go to Project Settings → Database
2. Find "Connection string" section
3. Copy the **URI** connection string (not the pooler)
   - Format: `postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres`
4. **Important**: URL-encode special characters in password:
   - `!` → `%21`
   - `@` → `%40`
   - `#` → `%23`
   - etc.

### Step 1.3: Run Database Migrations
1. Get your connection string ready (with encoded password)
2. Run migrations to set up schema:
   ```bash
   cd server
   export DATABASE_URL="postgresql://postgres:ENCODED_PASSWORD@db.xxxxx.supabase.co:5432/postgres?sslmode=require"
   npx prisma migrate deploy
   npx prisma generate
   ```

### Step 1.4: Create Admin User (Optional)
```bash
cd server
export DATABASE_URL="your-connection-string"
npm run create-sys-admin
```

---

## Part 2: Fly.io Backend Setup

### Step 2.1: Install Fly.io CLI
```bash
# macOS


# Linux/Windows
curl -L https://fly.io/install.sh | sh

# Verify installation
flyctl version
```

### Step 2.2: Login to Fly.io
```bash
flyctl auth login
```
This will open a browser for authentication.

### Step 2.3: Initialize Fly.io App
1. Navigate to your project root:
   ```bash
   cd /path/to/pingpong
   ```

2. Initialize Fly.io (will create `fly.toml`):
   ```bash
   flyctl launch
   ```
   
   When prompted:
   - **App name**: Choose a unique name (e.g., `pingpong-api`)
   - **Region**: Choose closest to your users (e.g., `iad` for US East)
   - **PostgreSQL**: Skip (we're using Supabase)
   - **Redis**: Skip (not needed)
   - **Deploy now**: No (we'll configure first)

### Step 2.4: Configure fly.toml
Edit `fly.toml` file (created in root):

```toml
app = "your-app-name"
primary_region = "iad"  # Your chosen region

[build]
  builder = "paketobuildpacks/builder:base"

[env]
  PORT = "3000"
  NODE_ENV = "production"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0
  processes = ["app"]

[[services]]
  http_checks = []
  internal_port = 3000
  processes = ["app"]
  protocol = "tcp"
  script_checks = []
```

### Step 2.5: Create Dockerfile for Server
Create `Dockerfile` in the project root:

```dockerfile
# Use Node.js LTS
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install root dependencies
RUN npm install

# Install server dependencies
WORKDIR /app/server
RUN npm install --production

# Generate Prisma Client
RUN npx prisma generate

# Copy server source code
COPY server/ ./

# Expose port
EXPOSE 3000

# Start server
CMD ["npm", "start"]
```

### Step 2.6: Create .dockerignore
Create `.dockerignore` in project root:

```
node_modules
server/node_modules
client/node_modules
.git
.env
.env.local
*.log
client/dist
server/dist
.DS_Store
```

### Step 2.7: Set Environment Variables in Fly.io
1. Set DATABASE_URL:
   ```bash
   flyctl secrets set DATABASE_URL="postgresql://postgres:ENCODED_PASSWORD@db.xxxxx.supabase.co:5432/postgres?sslmode=require"
   ```

2. Set JWT_SECRET:
   ```bash
   flyctl secrets set JWT_SECRET="your-random-secret-key-here"
   ```

3. Set SESSION_SECRET:
   ```bash
   flyctl secrets set SESSION_SECRET="your-random-secret-key-here"
   ```

4. Set CLIENT_URL (your Vercel URL - we'll update this later):
   ```bash
   flyctl secrets set CLIENT_URL="https://your-app.vercel.app"
   ```

5. Set NODE_ENV:
   ```bash
   flyctl secrets set NODE_ENV="production"
   ```

6. View all secrets:
   ```bash
   flyctl secrets list
   ```

### Step 2.8: Deploy to Fly.io
1. Make sure you're in project root
2. Deploy:
   ```bash
   flyctl deploy
   ```

3. Check deployment status:
   ```bash
   flyctl status
   flyctl logs
   ```

### Step 2.9: Get Fly.io App URL
After deployment, get your app URL:
```bash
flyctl info
```

Your backend will be at: `https://your-app-name.fly.dev`

### Step 2.10: Test Backend
```bash
# Health check
curl https://your-app-name.fly.dev/api/health

# Should return: {"status":"ok"}
```

---

## Part 3: Vercel Frontend Setup

### Step 3.1: Deploy Frontend to Vercel
1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Import your Git repository
4. Configure project:
   - **Framework Preset**: Vite (or Other)
   - **Root Directory**: Leave blank (or `./` if needed)
   - **Build Command**: `cd client && npm run build`
   - **Output Directory**: `client/dist`
   - **Install Command**: `npm run install:all`

### Step 3.2: Set Environment Variables in Vercel
Go to Project Settings → Environment Variables:

1. **VITE_API_URL**: Your Fly.io backend URL
   ```
   https://your-app-name.fly.dev
   ```
   ⚠️ **Important**: No trailing slash!

2. Add for all environments (Production, Preview, Development)

### Step 3.3: Deploy
Click "Deploy" or push to Git (auto-deploy).

### Step 3.4: Get Vercel URL
After deployment, note your Vercel URL:
- Format: `https://your-app-name.vercel.app`

---

## Part 4: Update CLIENT_URL in Fly.io

### Step 4.1: Update Fly.io Secret
After you have your Vercel URL, update Fly.io:

```bash
flyctl secrets set CLIENT_URL="https://your-app-name.vercel.app"
```

⚠️ **Important**: No trailing slash!

### Step 4.2: Restart Fly.io App
```bash
flyctl apps restart your-app-name
```

---

## Part 5: CORS Configuration

The backend is already configured to handle CORS from your Vercel domain. Make sure:

1. `CLIENT_URL` in Fly.io matches your Vercel URL exactly (no trailing slash)
2. Backend code normalizes the URL (already done in `server/src/index.ts`)

---

## Part 6: Testing the Full Stack

### 6.1: Test Frontend
1. Visit your Vercel URL: `https://your-app.vercel.app`
2. Should load the React app

### 6.2: Test API Connection
1. Open browser console (F12)
2. Try logging in
3. Check Network tab for API calls to `your-app-name.fly.dev`

### 6.3: Test Database Connection
1. Try creating a player/tournament
2. Check Fly.io logs:
   ```bash
   flyctl logs
   ```
3. Should see successful database operations

---

## Troubleshooting

### Fly.io Can't Connect to Supabase

**Error**: `Can't reach database server`

**Solutions**:
1. Check `DATABASE_URL` has `?sslmode=require` at the end
2. Verify password is URL-encoded (special characters)
3. Check Supabase database is not paused
4. Verify connection string format is correct

**Test connection locally**:
```bash
export DATABASE_URL="your-connection-string"
cd server
npx prisma db pull
```

### CORS Errors

**Error**: `Access-Control-Allow-Origin header` mismatch

**Solutions**:
1. Verify `CLIENT_URL` in Fly.io matches Vercel URL exactly
2. No trailing slash in `CLIENT_URL`
3. Restart Fly.io app after changing `CLIENT_URL`

### Frontend Can't Reach Backend

**Error**: `Failed to fetch` or `404`

**Solutions**:
1. Verify `VITE_API_URL` in Vercel is correct
2. Check Fly.io app is running: `flyctl status`
3. Check Fly.io logs: `flyctl logs`
4. Test backend directly: `curl https://your-app.fly.dev/api/health`

### Environment Variables Not Working

**Solution**:
- Fly.io: Use `flyctl secrets set` (not environment variables in dashboard)
- Vercel: Use Environment Variables in dashboard (for `VITE_*` variables)

---

## Useful Commands

### Fly.io Commands
```bash
# View app status
flyctl status

# View logs
flyctl logs

# View secrets
flyctl secrets list

# Set secret
flyctl secrets set KEY="value"

# Deploy
flyctl deploy

# SSH into app
flyctl ssh console

# Restart app
flyctl apps restart your-app-name

# Scale app
flyctl scale count 1
```

### Vercel Commands
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# View deployments
vercel list

# View logs
vercel logs
```

---

## Next Steps

1. ✅ Deploy database to Supabase
2. ✅ Deploy backend to Fly.io
3. ✅ Deploy frontend to Vercel
4. ✅ Connect frontend to backend
5. ✅ Update CORS settings
6. ✅ Test full stack

## Security Checklist

- [ ] Use strong passwords for Supabase
- [ ] Use strong, random secrets for JWT_SECRET and SESSION_SECRET
- [ ] URL-encode passwords in DATABASE_URL
- [ ] Enable SSL for database (`?sslmode=require`)
- [ ] Set NODE_ENV=production
- [ ] Review Fly.io firewall rules if needed
- [ ] Review Vercel environment variables

---

## Support Resources

- Fly.io Docs: https://fly.io/docs/
- Vercel Docs: https://vercel.com/docs
- Supabase Docs: https://supabase.com/docs
- Prisma Docs: https://www.prisma.io/docs


