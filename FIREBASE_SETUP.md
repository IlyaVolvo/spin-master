# Firebase Deployment - Step by Step

## Quick Start (5 minutes)

### 1. Install Firebase CLI
```bash
npm install -g firebase-tools
```

### 2. Login to Firebase
```bash
firebase login
```

### 3. Initialize Firebase Project
```bash
firebase init hosting
```

**Answer the prompts:**
- ✅ Use an existing project (or create new)
- 📁 Public directory: `client/dist`
- ✅ Configure as single-page app: **Yes**
- ❌ Set up GitHub Actions: **No** (unless you want CI/CD)
- ❌ Overwrite index.html: **No**

This will create `firebase.json` and `.firebaserc` files.

### 4. Update .firebaserc
Edit `.firebaserc` and replace `your-firebase-project-id` with your actual Firebase project ID.

### 5. Set Backend API URL

**IMPORTANT:** You need to deploy your backend first (see Backend Deployment below), then:

```bash
cd client
echo "VITE_API_URL=https://your-backend-url.com/api" > .env.production
cd ..
```

Replace `https://your-backend-url.com` with your actual backend URL.

### 6. Build and Deploy

```bash
# Build the client
cd client && npm run build && cd ..

# Deploy to Firebase
firebase deploy --only hosting
```

### 7. Create Sys Admin Member

After your backend is deployed and database is set up:

```bash
cd server

# Option 1: Use environment variables
export SYS_ADMIN_EMAIL="admin@example.com"
export SYS_ADMIN_PASSWORD="YourSecurePassword123!"
export SYS_ADMIN_FIRST_NAME="System"
export SYS_ADMIN_LAST_NAME="Administrator"
npm run create-sys-admin

# Option 2: Edit server/.env file
# Add these lines:
# SYS_ADMIN_EMAIL=admin@example.com
# SYS_ADMIN_PASSWORD=YourSecurePassword123!
# SYS_ADMIN_FIRST_NAME=System
# SYS_ADMIN_LAST_NAME=Administrator
# Then run: npm run create-sys-admin
```

### 8. Update Backend CORS

Update your backend `server/.env` to allow your Firebase domain:

```env
CLIENT_URL=https://your-firebase-project-id.web.app
# or
CLIENT_URL=https://your-custom-domain.com
```

Restart your backend server.

### 9. Test Deployment

1. Visit your Firebase Hosting URL (shown after deployment)
2. Login with the Sys Admin credentials
3. You should see the Players page

## Backend Deployment Options

### Option 1: Google Cloud Run (Recommended for Firebase)

1. **Create Dockerfile** in `server/` directory:
   ```dockerfile
   FROM node:18-alpine
   WORKDIR /app
   COPY package*.json ./
   COPY prisma ./prisma/
   RUN npm ci --only=production
   RUN npx prisma generate
   COPY dist ./dist
   EXPOSE 3001
   ENV NODE_ENV=production
   CMD ["node", "dist/index.js"]
   ```

2. **Build and deploy:**
   ```bash
   cd server
   npm run build
   gcloud run deploy pingpong-api \
     --source . \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --set-env-vars DATABASE_URL=your-db-url,JWT_SECRET=your-secret,CLIENT_URL=https://your-firebase-url.web.app
   ```

3. **Get the Cloud Run URL** and use it in `client/.env.production`

### Option 2: Render.com (Easier Alternative)

1. Go to https://render.com
2. Create new **Web Service**
3. Connect GitHub repo
4. Settings:
   - **Root Directory**: `server`
   - **Build Command**: `npm install && npm run build && npx prisma generate`
   - **Start Command**: `npm start`
5. Add environment variables:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `SESSION_SECRET`
   - `CLIENT_URL` (your Firebase URL)
   - `PORT` (usually auto-set)
6. Deploy and get the URL

### Option 3: Railway.app

Similar to Render, very easy setup.

## Database Setup

You'll need a PostgreSQL database. Options:

1. **Google Cloud SQL** (if using Cloud Run)
2. **Supabase** (free tier available)
3. **Neon** (free tier available)
4. **Render PostgreSQL** (free tier available)
5. **Any PostgreSQL provider**

After setting up the database:
1. Update `DATABASE_URL` in `server/.env`
2. Run migrations: `cd server && npm run prisma:migrate deploy`
3. Create Sys Admin: `npm run create-sys-admin`

## Troubleshooting

### CORS Errors
- Make sure `CLIENT_URL` in backend matches your Firebase domain exactly
- Check that `credentials: true` is set in CORS config

### API Calls Failing
- Verify `VITE_API_URL` is set correctly in `client/.env.production`
- Check browser console for errors
- Verify backend is accessible and running

### Authentication Not Working
- Check that sessions are configured correctly
- Verify `withCredentials: true` in API client
- Check backend logs for authentication errors

### Routing Issues
- Ensure `firebase.json` has the rewrite rule for SPA routing
- Check that `index.html` is being served for all routes

## Custom Domain

1. Go to Firebase Console → Hosting
2. Click "Add custom domain"
3. Follow the DNS setup instructions
4. Update `CLIENT_URL` in backend to match your custom domain

## Environment Variables Summary

### Client (build-time, in `client/.env.production`):
```env
VITE_API_URL=https://your-backend-url.com/api
```

### Server (runtime, in `server/.env`):
```env
DATABASE_URL=postgresql://user:pass@host:5432/dbname
JWT_SECRET=your-secret-key
SESSION_SECRET=your-session-secret
CLIENT_URL=https://your-firebase-url.web.app
PORT=3001
NODE_ENV=production
```

### Sys Admin Creation (optional, in `server/.env`):
```env
SYS_ADMIN_EMAIL=admin@example.com
SYS_ADMIN_PASSWORD=YourSecurePassword123!
SYS_ADMIN_FIRST_NAME=System
SYS_ADMIN_LAST_NAME=Administrator
```

