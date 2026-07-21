# Accessing Database from Deployed Backend

## Architecture Overview

```
┌─────────────────┐
│  Vercel         │  ← Frontend (static files)
│  (Frontend)     │     No database access
└─────────────────┘
         │
         │ API Calls
         │
┌─────────────────┐
│  Render/Railway │  ← Backend Server
│  (Backend)      │     Connects to database
└─────────────────┘
         │
         │ DATABASE_URL
         │
┌─────────────────┐
│  PostgreSQL     │  ← Database
│  (Cloud/Local)  │
└─────────────────┘
```

**Important:** Vercel only serves static files (your React app). The database is accessed through your backend server, which needs to be deployed separately.

## Step 1: Deploy Your Backend

You need to deploy your backend to access the database. Choose one:

### Option A: Render.com (Recommended)

1. Go to https://render.com
2. Create new **Web Service**
3. Connect your GitHub repo
4. Configure:
   - **Root Directory**: `server`
   - **Build Command**: `npm install && npm run build && npx prisma generate`
   - **Start Command**: `npm start`
5. Add **PostgreSQL Database**:
   - Click "New +" → "PostgreSQL"
   - This creates a managed PostgreSQL database
   - Render provides the connection string automatically

### Option B: Railway.app

1. Go to https://railway.app
2. Create new project → Deploy from GitHub
3. Add **PostgreSQL** service
4. Add **Node.js** service (point to `server` directory)
5. Railway automatically provides database connection string

## Step 2: Get Database Connection String

After deploying, you'll get a database connection string:

### Render PostgreSQL:
- Go to your PostgreSQL service → "Info" tab
- Copy **Internal Database URL** (for Render services) or **External Database URL**
- Format: `postgresql://user:password@host:port/database`

### Railway PostgreSQL:
- Click on PostgreSQL service → "Connect" tab
- Copy **Connection URL**

### Local Database (if connecting from local backend):
- Your existing `.env`: `postgresql://ilya@localhost:5432/pingpong`

## Step 3: Set Environment Variables in Backend

In your backend deployment (Render/Railway/etc.):

1. Go to your backend service settings
2. Add environment variables:
   ```
   DATABASE_URL=postgresql://user:pass@host:port/database
   JWT_SECRET=your-secret-key
   SESSION_SECRET=your-session-secret
   CLIENT_URL=https://ping-pong-tournament-management-sys.vercel.app
   PORT=10000 (or whatever port the service uses)
   NODE_ENV=production
   ```

## Step 4: Access Database from Deployed Backend

### Method 1: Through Backend API

Once your backend is deployed, you can:

1. **Use Prisma Studio locally** (if DATABASE_URL points to cloud database):
   ```bash
   cd server
   # Temporarily set DATABASE_URL to cloud database
   export DATABASE_URL="postgresql://user:pass@cloud-host:5432/db"
   npm run prisma:studio
   ```
   Open: http://localhost:5555

2. **Connect via psql**:
   ```bash
   psql "postgresql://user:pass@cloud-host:5432/database"
   ```

3. **Use Database GUI Tool**:
   - TablePlus, DBeaver, pgAdmin
   - Use the cloud database connection string
   - Connect using the external database URL (if available)

### Method 2: Create API Endpoints (if needed)

You can create API endpoints in your backend to query the database:

```typescript
// Example: server/src/routes/admin.ts
router.get('/admin/db-stats', async (req, res) => {
  const memberCount = await prisma.member.count();
  const tournamentCount = await prisma.tournament.count();
  // ... etc
  res.json({ memberCount, tournamentCount });
});
```

## Step 5: Access Database Directly (Cloud Databases)

### Render PostgreSQL:

**Internal Access** (from Render services):
- Use **Internal Database URL** - faster, secure within Render network
- Automatically provided in environment variables

**External Access** (from your computer):
- Use **External Database URL** from Render dashboard
- May require IP whitelist configuration
- Use with psql, GUI tools, etc.

### Railway PostgreSQL:

1. Click on PostgreSQL service
2. Go to "Connect" tab
3. Copy **Connection URL**
4. Use with any PostgreSQL client

### Setting Up External Access

**Render:**
1. Go to PostgreSQL service → Settings
2. Enable "Public Networking" (if you want external access)
3. Copy External Database URL
4. Use with psql/GUI tools from your computer

**Railway:**
1. Connection URL is already accessible externally
2. Copy from "Connect" tab
3. Use directly with psql/GUI tools

## Quick Reference

### Connect to Cloud Database Locally

```bash
# Using connection string from your backend deployment
psql "postgresql://user:password@render-or-railway-host:5432/database"

# Or set environment variable
export DATABASE_URL="postgresql://user:password@host:5432/database"
cd server
npm run prisma:studio
# Opens at http://localhost:5555
```

### Access Through Database GUI

1. **TablePlus**:
   - New connection → PostgreSQL
   - Paste connection string or enter details manually
   - Connect

2. **DBeaver**:
   - New Database Connection → PostgreSQL
   - Use connection string or enter details
   - Test connection

### Check Database from Backend Logs

If your backend is deployed, check logs for database connection:
- Render: Dashboard → Service → Logs
- Railway: Dashboard → Service → Logs

Look for Prisma connection messages or database errors.

## Important Notes

1. **Vercel ≠ Database Access**: Vercel only serves static files. You cannot access a database directly from Vercel.

2. **Backend Required**: You must deploy your backend (server code) to access the database.

3. **Connection String Security**: Never commit database connection strings to Git. Always use environment variables.

4. **Network Access**: 
   - Internal URLs work only within the same platform (Render to Render)
   - External URLs allow access from anywhere (your computer, etc.)
   - Use internal URLs when possible for better security and performance

5. **Local vs Cloud**: 
   - If database is on your local machine, only your local backend can access it
   - For deployed backends, use cloud databases (Render PostgreSQL, Railway PostgreSQL, etc.)

## Summary

To access the database from Vercel deployment:

1. ❌ **Cannot access directly from Vercel** (Vercel = frontend only)
2. ✅ **Deploy backend** to Render/Railway/etc.
3. ✅ **Set DATABASE_URL** in backend environment variables
4. ✅ **Access database** through:
   - Backend API endpoints
   - psql using connection string
   - Prisma Studio (connect to cloud database)
   - Database GUI tools (TablePlus, DBeaver)

Do you have a backend deployed yet? If not, I can help you deploy it to Render or Railway, which will give you both a backend server AND a PostgreSQL database.



