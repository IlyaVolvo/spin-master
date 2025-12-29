# Quick Start: Deploy to Firebase

## Step 1: Install Firebase CLI

```bash
npm install -g firebase-tools
```

## Step 2: Login and Initialize

```bash
firebase login
firebase init hosting
```

**When prompted:**
- Select/create a Firebase project
- Public directory: `client/dist`
- Single-page app: **Yes**
- Overwrite index.html: **No**

## Step 3: Set Backend API URL

**Important:** You need to deploy your backend first (see backend options below), then:

```bash
cd client
echo "VITE_API_URL=https://your-backend-url.com/api" > .env.production
cd ..
```

## Step 4: Build and Deploy

```bash
# Build the client
cd client && npm run build && cd ..

# Deploy to Firebase
firebase deploy --only hosting
```

## Step 5: Create Sys Admin Member

After your backend is deployed and accessible:

```bash
cd server
# Set environment variables (optional, or use defaults)
export SYS_ADMIN_EMAIL="admin@example.com"
export SYS_ADMIN_PASSWORD="YourSecurePassword123!"
export SYS_ADMIN_FIRST_NAME="System"
export SYS_ADMIN_LAST_NAME="Administrator"

# Run the script
npm run create-sys-admin
```

Or set these in `server/.env`:
```env
SYS_ADMIN_EMAIL=admin@example.com
SYS_ADMIN_PASSWORD=YourSecurePassword123!
SYS_ADMIN_FIRST_NAME=System
SYS_ADMIN_LAST_NAME=Administrator
```

## Backend Deployment Options

### Option 1: Google Cloud Run (Easiest for Firebase)

1. **Build your server:**
   ```bash
   cd server
   npm run build
   ```

2. **Create Dockerfile:**
   ```dockerfile
   FROM node:18-alpine
   WORKDIR /app
   COPY package*.json ./
   COPY prisma ./prisma/
   RUN npm ci
   RUN npx prisma generate
   COPY dist ./dist
   EXPOSE 3001
   CMD ["node", "dist/index.js"]
   ```

3. **Deploy to Cloud Run:**
   ```bash
   gcloud run deploy pingpong-api \
     --source . \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated
   ```

4. **Get the URL** and set it in `client/.env.production`:
   ```bash
   echo "VITE_API_URL=https://your-cloud-run-url.run.app/api" > client/.env.production
   ```

### Option 2: Render.com (Simple Alternative)

1. Go to https://render.com
2. Create new Web Service
3. Connect your GitHub repo
4. Set Root Directory to `server`
5. Build Command: `npm install && npm run build && npx prisma generate`
6. Start Command: `npm start`
7. Add environment variables (DATABASE_URL, JWT_SECRET, etc.)
8. Get the URL and set in `client/.env.production`

## Important Notes

1. **Database**: You'll need a PostgreSQL database (Cloud SQL, Supabase, or any PostgreSQL provider)
2. **CORS**: Update your backend CORS to allow your Firebase domain
3. **Environment Variables**: Build-time only for Firebase Hosting (use `.env.production`)
4. **HTTPS**: Firebase provides HTTPS automatically

## After Deployment

1. Visit your Firebase Hosting URL
2. Login with the Sys Admin credentials you created
3. You're ready to go! 🎉

