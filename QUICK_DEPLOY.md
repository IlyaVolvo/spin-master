# Quick Deployment Guide

## Step 1: Deploy Backend (Choose One)

### Option A: Render.com (Easiest - 15 minutes)

1. Go to https://render.com → Sign up/Login
2. Click "New +" → "Web Service"
3. Connect GitHub repo (or use public repo URL)
4. Configure:
   - **Name**: `pingpong-api`
   - **Root Directory**: `server`
   - **Build Command**: `npm install && npm run build && npx prisma generate`
   - **Start Command**: `npm start`
5. Add PostgreSQL:
   - Click "New +" → "PostgreSQL"
   - Name: `pingpong-db`
   - Copy the **Internal Database URL**
6. Add Environment Variables:
   ```
   DATABASE_URL=<paste-internal-database-url>
   JWT_SECRET=<generate-random-string>
   SESSION_SECRET=<generate-random-string>
   CLIENT_URL=https://ping-pong-ilya-2026.web.app
   PORT=10000
   NODE_ENV=production
   ```
7. Deploy → Wait for build to complete
8. **Copy the URL** (e.g., `https://pingpong-api.onrender.com`)

### Option B: Railway.app (Similar to Render)

1. Go to https://railway.app → Sign up/Login
2. Create new project → "Deploy from GitHub repo"
3. Add PostgreSQL service
4. Add Node.js service → Set root to `server`
5. Add environment variables (same as Render)
6. Deploy → **Copy the URL**

## Step 2: Set Backend URL in Client

```bash
# Replace YOUR_BACKEND_URL with the actual URL from Step 1
echo "VITE_API_URL=https://YOUR_BACKEND_URL/api" > client/.env.production
```

Example:
```bash
echo "VITE_API_URL=https://pingpong-api.onrender.com/api" > client/.env.production
```

## Step 3: Deploy Frontend to Firebase

```bash
# Build client
cd client && npm run build && cd ..

# Deploy to Firebase
firebase deploy --only hosting
```

## Step 4: Update Backend CORS

In your backend environment variables (Render/Railway dashboard), update:
```
CLIENT_URL=https://ping-pong-ilya-2026.web.app
```

Or if you have a custom domain:
```
CLIENT_URL=https://your-custom-domain.com
```

Restart the backend service.

## Step 5: Set Up Database

1. **Run migrations:**
   ```bash
   cd server
   npx prisma migrate deploy
   ```
   (Or use Render/Railway shell, or connect to your database directly)

2. **Create Sys Admin:**
   ```bash
   cd server
   npm run create-sys-admin
   ```
   (Or set environment variables in backend and run the script)

## Step 6: Test

1. Visit your Firebase URL: `https://ping-pong-ilya-2026.web.app`
2. Login with:
   - Email: `admin@pingpong.com`
   - Password: `Admin123!` (or what you set)

## Summary

**Backend URL examples:**
- Render: `https://pingpong-api.onrender.com`
- Railway: `https://pingpong-api.railway.app`
- Cloud Run: `https://pingpong-api-xxxxx-uc.a.run.app`

**Client .env.production:**
```env
VITE_API_URL=https://your-backend-url.com/api
```

**Backend Environment Variables:**
```env
DATABASE_URL=postgresql://...
JWT_SECRET=random-secret
SESSION_SECRET=random-secret
CLIENT_URL=https://ping-pong-ilya-2026.web.app
PORT=10000
NODE_ENV=production
```

