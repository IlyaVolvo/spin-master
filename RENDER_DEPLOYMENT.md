# Quick Deployment Guide: Render.com (Easiest for External Testing)

**Render.com** is the easiest platform for deploying your full-stack app for external testing. It offers:
- ✅ Free tier (with some limitations)
- ✅ Automatic deployments from Git
- ✅ PostgreSQL database support
- ✅ Simple setup (no complex configuration)
- ✅ Built-in SSL/HTTPS
- ✅ Can deploy both backend and frontend

## Step 1: Prepare Your Code

Make sure your latest changes are committed and pushed to GitHub:

```bash
git add -A
git commit -m "Ready for deployment"
git push origin main
```

## Step 2: Update Server Configuration for Production

We need to make a few small changes to make the server work on Render:

### A. Update server/src/index.ts to listen on all interfaces

Change line 158 from:
```typescript
httpServer.listen(PORT, 'localhost', () => {
```

To:
```typescript
httpServer.listen(PORT, '0.0.0.0', () => {
```

### B. Add Static File Serving (Optional but Recommended)

Add this to `server/src/index.ts` after the routes (around line 121):

```typescript
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files from React app in production
if (process.env.NODE_ENV === 'production') {
  const clientBuildPath = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientBuildPath));
  
  // Serve React app for all non-API routes
  app.get('*', (req, res) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}
```

**Note:** You'll need to use CommonJS-style path resolution since the code uses `require.main`. Here's the corrected version:

```typescript
// At the top of the file, add:
import path from 'path';
import { fileURLToPath } from 'url';

// For ES modules compatibility, use this approach:
const __dirname = path.dirname(new URL('.', import.meta.url).pathname);

// Then after routes (around line 121):
if (process.env.NODE_ENV === 'production') {
  const clientBuildPath = path.resolve(__dirname, '../../client/dist');
  app.use(express.static(clientBuildPath));
  
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}
```

Actually, since the code uses CommonJS (`require.main`), let's use a simpler approach:

```typescript
// After line 117 (after routes), add:
import path from 'path';

// Serve static files from React app in production
if (process.env.NODE_ENV === 'production') {
  const clientBuildPath = path.join(process.cwd(), '../client/dist');
  app.use(express.static(clientBuildPath));
  
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}
```

## Step 3: Create Render Account

1. Go to https://render.com
2. Sign up for a free account (GitHub login recommended)

## Step 4: Create PostgreSQL Database

1. In Render Dashboard, click **"New +"** → **"PostgreSQL"**
2. Configure:
   - **Name**: `pingpong-db` (or any name)
   - **Database**: `pingpong` (or leave default)
   - **User**: (auto-generated)
   - **Region**: Choose closest to you
   - **Plan**: Free (for testing)
3. Click **"Create Database"**
4. **Save the Internal Database URL** - you'll need this in the next step
   - It looks like: `postgresql://user:password@dpg-xxxxx-a/pingpong`

## Step 5: Deploy Backend (Web Service)

1. In Render Dashboard, click **"New +"** → **"Web Service"**
2. Connect your GitHub repository
3. Configure the service:
   - **Name**: `pingpong-api` (or any name)
   - **Region**: Same as database
   - **Branch**: `main`
   - **Root Directory**: `server` (IMPORTANT!)
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
4. Click **"Advanced"** and add Environment Variables:
   ```
   DATABASE_URL=<paste Internal Database URL from Step 4>
   JWT_SECRET=<generate a random string, e.g., openssl rand -hex 32>
   SESSION_SECRET=<generate another random string>
   NODE_ENV=production
   CLIENT_URL=https://your-app-name.onrender.com
   PORT=10000
   ```
   **Important Notes:**
   - Use the **Internal Database URL** (not External) - it's faster and free
   - Generate secrets: `openssl rand -hex 32` (run in terminal)
   - `PORT` should be the port Render provides (usually in an env var, but you can set it)
   - `CLIENT_URL` will be your Render app URL (update after deployment)
5. Click **"Create Web Service"**
6. Render will automatically build and deploy

**Note:** Render sets `PORT` automatically, so you might not need to set it. But you can check Render's logs to see what port it uses.

## Step 6: Update Database URL

1. Once the web service is deployed, go to the PostgreSQL database
2. Copy the **Internal Database URL** (if you didn't use it before)
3. Go back to your Web Service → **Environment** tab
4. Update `DATABASE_URL` with the Internal URL
5. The service will automatically restart

## Step 7: Run Database Migrations

Render doesn't automatically run migrations. You have two options:

### Option A: Add Build Script (Recommended)

Add a postbuild script to `server/package.json`:

```json
"scripts": {
  "dev": "tsx watch src/index.ts",
  "build": "tsc",
  "start": "node dist/index.js",
  "postbuild": "prisma generate && prisma migrate deploy",
  "prisma:generate": "prisma generate",
  "prisma:migrate": "prisma migrate dev",
  "prisma:studio": "prisma studio",
  "validate-api-docs": "tsx scripts/validate-api-docs.ts"
}
```

This will run migrations automatically after each build.

### Option B: Run Manually via Render Shell

1. In Render Dashboard → Your Web Service → **Shell** tab
2. Run:
   ```bash
   npx prisma generate
   npx prisma migrate deploy
   ```

## Step 8: Deploy Frontend (Optional - If Not Serving from Backend)

If you didn't configure static file serving in Step 2B, deploy frontend separately:

1. In Render Dashboard, click **"New +"** → **"Static Site"**
2. Connect your GitHub repository
3. Configure:
   - **Name**: `pingpong-client`
   - **Branch**: `main`
   - **Root Directory**: `client`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
4. Add Environment Variable:
   ```
   VITE_API_URL=https://your-api-name.onrender.com/api
   ```
5. Click **"Create Static Site"**

**Note:** You'll need to update your client code to use the `VITE_API_URL` environment variable instead of hardcoded URLs.

## Step 9: Update CORS Settings

1. Go to your Web Service → **Environment** tab
2. Update `CLIENT_URL` to match your frontend URL (if deploying separately) or your main app URL
3. The service will restart automatically

## Step 10: Test Your Deployment

1. Visit your Render app URL: `https://your-app-name.onrender.com`
2. Check the logs in Render Dashboard for any errors
3. Create a test account via the registration/login page

## Render Free Tier Limitations

- Services sleep after 15 minutes of inactivity (first request after sleep takes ~30 seconds)
- 750 hours/month free (enough for testing)
- PostgreSQL free tier: 90 days retention, limited connections

## Troubleshooting

### Service won't start
- Check logs in Render Dashboard
- Verify `DATABASE_URL` is set correctly
- Ensure `build` and `start` commands are correct
- Check that `Root Directory` is set to `server`

### Database connection errors
- Use Internal Database URL (not External) for free tier
- Verify `DATABASE_URL` format is correct
- Check database is not paused/sleeping

### Migrations not running
- Add `postbuild` script (see Step 7)
- Or run manually via Shell

### Frontend can't connect to API
- Verify `CLIENT_URL` or `VITE_API_URL` is set correctly
- Check CORS settings in server code
- Ensure API URL includes `/api` path

## Alternative: Railway.app

Railway is another easy option with similar setup:
- Go to https://railway.app
- Connect GitHub repo
- Add PostgreSQL service
- Deploy from GitHub
- Similar environment variable setup

Railway might be slightly easier but has similar free tier limitations.

