# Firebase Deployment Guide

This guide will help you deploy your PingPong Tournament System to Google Firebase Hosting.

## Prerequisites

1. **Google Account** with Firebase access
2. **Node.js** installed (for Firebase CLI)
3. **Backend deployed** (you'll need to deploy the server separately - see options below)

## Step 1: Install Firebase CLI

```bash
npm install -g firebase-tools
```

## Step 2: Login to Firebase

```bash
firebase login
```

This will open a browser window for authentication.

## Step 3: Initialize Firebase in Your Project

```bash
firebase init hosting
```

When prompted:
- **Select an existing project** or create a new one
- **Public directory**: `client/dist`
- **Configure as a single-page app**: **Yes**
- **Set up automatic builds and deploys with GitHub**: **No** (unless you want CI/CD)
- **File client/dist/index.html already exists. Overwrite?**: **No**

## Step 4: Configure Firebase Hosting

The `firebase.json` file will be created. We'll update it to handle routing properly.

## Step 5: Build Your Client

```bash
npm run build
```

This builds both server and client, but we only need the client for Firebase hosting.

## Step 6: Set Environment Variable for API URL

You'll need to set `VITE_API_URL` to point to your backend server. Since Firebase Hosting is static, you have two options:

### Option A: Build with Environment Variable (Recommended)

Create a `.env.production` file in the `client/` directory:

```bash
cd client
echo "VITE_API_URL=https://your-backend-url.com/api" > .env.production
```

Then rebuild:
```bash
npm run build
```

### Option B: Use Firebase Hosting Rewrites (if backend is on same domain)

If you deploy your backend to Firebase Functions or Cloud Run on the same domain, you can use rewrites in `firebase.json`.

## Step 7: Deploy to Firebase

```bash
firebase deploy --only hosting
```

## Step 8: Create Sys Admin Member

After deployment, you'll need to create a Sys Admin member. You can do this via:

1. **API call** (if backend is accessible):
```bash
curl -X POST https://your-backend-url.com/api/auth/member/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "your-secure-password",
    "firstName": "System",
    "lastName": "Administrator",
    "roles": ["ADMIN"]
  }'
```

2. **Database script** (if you have direct database access):
   - Use the script provided in `server/scripts/` or create a member directly in the database

## Backend Deployment Options

Since Firebase Hosting only serves static files, you need to deploy your backend separately:

### Option 1: Google Cloud Run (Recommended)
- Deploy your Node.js server to Cloud Run
- Get the Cloud Run URL
- Set `VITE_API_URL` to point to it

### Option 2: Firebase Functions
- Convert your Express server to Firebase Functions
- More complex but keeps everything in Firebase

### Option 3: Render/Railway/Heroku
- Deploy backend to any Node.js hosting service
- Set `VITE_API_URL` to point to it

### Option 4: Same Server (if you have a VPS)
- Deploy backend to your server
- Use Firebase Hosting for frontend only
- Set up reverse proxy if needed

## Important Notes

1. **CORS Configuration**: Make sure your backend allows requests from your Firebase Hosting domain
2. **Environment Variables**: Firebase Hosting doesn't support runtime environment variables - you must build them into the bundle
3. **HTTPS**: Firebase Hosting provides HTTPS automatically
4. **Custom Domain**: You can add a custom domain in Firebase Console

## Troubleshooting

### API calls failing
- Check that `VITE_API_URL` is set correctly in your build
- Verify CORS settings on your backend
- Check browser console for errors

### Routing not working
- Ensure `firebase.json` has proper rewrites for SPA routing
- Check that `index.html` is served for all routes

### Authentication issues
- Verify session cookies work across domains (may need to configure CORS and credentials)
- Check that `withCredentials: true` is set in API client

