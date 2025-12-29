#!/bin/bash

# Firebase Deployment Script for PingPong Tournament System
# This script helps deploy the client to Firebase Hosting

set -e  # Exit on error

echo "🚀 Starting Firebase Deployment..."

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI is not installed."
    echo "Install it with: npm install -g firebase-tools"
    exit 1
fi

# Check if user is logged in
if ! firebase projects:list &> /dev/null; then
    echo "❌ Not logged in to Firebase."
    echo "Run: firebase login"
    exit 1
fi

# Check if firebase.json exists
if [ ! -f "firebase.json" ]; then
    echo "📝 Initializing Firebase..."
    firebase init hosting --project default
fi

# Check if backend URL is set
if [ -z "$VITE_API_URL" ]; then
    echo "⚠️  WARNING: VITE_API_URL is not set!"
    echo "Your app will try to use /api (relative path)."
    echo "If your backend is on a different domain, set VITE_API_URL:"
    echo "  export VITE_API_URL=https://your-backend-url.com/api"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Build the client
echo "🔨 Building client..."
cd client

# Create .env.production if VITE_API_URL is set
if [ ! -z "$VITE_API_URL" ]; then
    echo "VITE_API_URL=$VITE_API_URL" > .env.production
    echo "✅ Created .env.production with VITE_API_URL=$VITE_API_URL"
fi

npm run build
cd ..

# Deploy to Firebase
echo "📤 Deploying to Firebase..."
firebase deploy --only hosting

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📝 Next steps:"
echo "1. Create a Sys Admin member by running:"
echo "   cd server && npm run create-sys-admin"
echo ""
echo "2. Update your backend CORS to allow your Firebase domain"
echo "3. Visit your Firebase Hosting URL to test"

