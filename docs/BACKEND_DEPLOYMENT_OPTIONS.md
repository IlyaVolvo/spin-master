# Backend Deployment Options

Since Firebase Hosting only serves static files, you need to deploy your backend separately. Here are the best options:

## Option 1: Google Cloud Run (Recommended - Works Best with Firebase)

**Pros:**
- Same Google Cloud ecosystem as Firebase
- Automatic HTTPS
- Scales to zero when not in use (cost-effective)
- Easy to set up

**Steps:**

1. **Install Google Cloud SDK:**
   ```bash
   # macOS
   brew install google-cloud-sdk
   
   # Or download from: https://cloud.google.com/sdk/docs/install
   ```

2. **Login and set project:**
   ```bash
   gcloud auth login
   gcloud config set project ping-pong-ilya-2026
   ```

3. **Create Dockerfile** in `server/` directory:
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

4. **Build and deploy:**
   ```bash
   cd server
   npm run build
   gcloud run deploy pingpong-api \
     --source . \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --port 3001 \
     --set-env-vars DATABASE_URL=your-db-url,JWT_SECRET=your-secret,SESSION_SECRET=your-session-secret,CLIENT_URL=https://ping-pong-ilya-2026.web.app,PORT=3001
   ```

5. **Get the URL** (will be shown after deployment, like: `https://pingpong-api-xxxxx-uc.a.run.app`)

6. **Use this URL** in `client/.env.production`:
   ```bash
   echo "VITE_API_URL=https://pingpong-api-xxxxx-uc.a.run.app/api" > client/.env.production
   ```

---

## Option 2: Render.com (Easiest - No Docker Required)

**Pros:**
- Very easy setup
- Free tier available
- No Docker needed
- Automatic HTTPS

**Steps:**

1. **Go to https://render.com** and sign up/login

2. **Create new Web Service:**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Or use "Public Git repository" if repo is public

3. **Configure:**
   - **Name**: `pingpong-api` (or any name)
   - **Region**: Choose closest to you
   - **Branch**: `main`
   - **Root Directory**: `server`
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build && npx prisma generate`
   - **Start Command**: `npm start`

4. **Add Environment Variables:**
   ```
   DATABASE_URL=postgresql://user:pass@host:5432/dbname
   JWT_SECRET=your-random-secret-key-here
   SESSION_SECRET=your-random-session-secret-here
   CLIENT_URL=https://ping-pong-ilya-2026.web.app
   PORT=10000
   NODE_ENV=production
   ```
   (Note: Render sets PORT automatically, but you can use 10000 as default)

5. **Add PostgreSQL Database:**
   - Click "New +" → "PostgreSQL"
   - Name: `pingpong-db`
   - Use the **Internal Database URL** (faster, free)
   - Copy the Internal Database URL and use it for `DATABASE_URL`

6. **Deploy** - Render will automatically build and deploy

7. **Get the URL** (will be like: `https://pingpong-api.onrender.com`)

8. **Use this URL** in `client/.env.production`:
   ```bash
   echo "VITE_API_URL=https://pingpong-api.onrender.com/api" > client/.env.production
   ```

---

## Option 3: Railway.app (Similar to Render)

**Pros:**
- Very easy setup
- Free tier available
- Automatic HTTPS

**Steps:**

1. **Go to https://railway.app** and sign up/login

2. **Create new project** → "Deploy from GitHub repo"

3. **Add PostgreSQL service:**
   - Click "+ New" → "Database" → "Add PostgreSQL"

4. **Add Node.js service:**
   - Click "+ New" → "GitHub Repo" → Select your repo
   - Set **Root Directory** to `server`
   - Railway will auto-detect Node.js

5. **Configure environment variables:**
   - `DATABASE_URL` (use the PostgreSQL service URL)
   - `JWT_SECRET` (generate random string)
   - `SESSION_SECRET` (generate random string)
   - `CLIENT_URL=https://ping-pong-ilya-2026.web.app`
   - `NODE_ENV=production`

6. **Set build command:**
   - In Railway dashboard → Settings → Build Command: `npm install && npm run build && npx prisma generate`

7. **Deploy** - Railway will automatically deploy

8. **Get the URL** (will be shown in the service)

9. **Use this URL** in `client/.env.production`

---

## Option 4: Your Own Server/VPS

If you have a server (DigitalOcean, AWS EC2, etc.):

1. **SSH into your server**

2. **Clone your repo:**
   ```bash
   git clone https://github.com/your-username/your-repo.git
   cd your-repo/server
   ```

3. **Install dependencies and build:**
   ```bash
   npm install
   npm run build
   npx prisma generate
   ```

4. **Set up environment variables** in `.env`:
   ```env
   DATABASE_URL=postgresql://user:pass@host:5432/dbname
   JWT_SECRET=your-secret
   SESSION_SECRET=your-session-secret
   CLIENT_URL=https://ping-pong-ilya-2026.web.app
   PORT=3001
   NODE_ENV=production
   ```

5. **Run migrations:**
   ```bash
   npx prisma migrate deploy
   ```

6. **Start the server** (using PM2 or systemd):
   ```bash
   pm2 start dist/index.js --name pingpong-api
   ```

7. **Set up Nginx reverse proxy** (optional but recommended):
   ```nginx
   server {
       listen 80;
       server_name api.yourdomain.com;
       
       location / {
           proxy_pass http://localhost:3001;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

8. **Use your server URL** in `client/.env.production`

---

## Database Setup

You'll need a PostgreSQL database. Options:

1. **Render PostgreSQL** (free tier, easy)
2. **Supabase** (free tier, easy)
3. **Neon** (free tier, easy)
4. **Google Cloud SQL** (if using Cloud Run)
5. **Railway PostgreSQL** (if using Railway)
6. **Any PostgreSQL provider**

After setting up the database:
1. Get the connection string (DATABASE_URL)
2. Run migrations: `cd server && npx prisma migrate deploy`
3. Create Sys Admin: `npm run create-sys-admin`

---

## Recommended Quick Path

**For fastest deployment, use Render.com:**

1. Deploy backend to Render (15 minutes)
2. Deploy frontend to Firebase (5 minutes)
3. Create Sys Admin (2 minutes)
4. Done! ✅

The backend URL will be something like:
- `https://pingpong-api.onrender.com` (Render)
- `https://pingpong-api.railway.app` (Railway)
- `https://pingpong-api-xxxxx-uc.a.run.app` (Cloud Run)

Then set in `client/.env.production`:
```env
VITE_API_URL=https://your-actual-backend-url.com/api
```

Note: Make sure to include `/api` at the end since your API routes are under `/api`.

