# Deployment Guide

This guide covers how to deploy the PingPong Tournament System to production.

## Prerequisites

- Node.js 18+ installed on the server
- PostgreSQL database (local or cloud)
- Git repository access (for pulling latest code)

## Deployment Steps

### 1. Pull Latest Code

```bash
# If deploying to a server, pull the latest changes
git pull origin main

# Or if you're deploying from local, ensure you've committed and pushed
git push origin main
```

### 2. Install Dependencies

```bash
# Install all dependencies (root, server, and client)
npm run install:all
```

### 3. Build Both Server and Client

```bash
# Build both server and client
npm run build
```

This command:
- Builds the server TypeScript code to `server/dist/`
- Builds the client React app to `client/dist/`

### 4. Database Setup

Ensure your database is set up and migrations are applied:

```bash
cd server
npm run prisma:generate
npm run prisma:migrate deploy  # For production (doesn't create new migrations)
```

### 5. Configure Environment Variables

Make sure `server/.env` is properly configured:

```env
DATABASE_URL="postgresql://username:password@host:5432/pingpong?schema=public"
JWT_SECRET="your-secret-key-here"
SESSION_SECRET="your-session-secret-here"
PORT=3001
CLIENT_URL="http://your-domain.com"  # Or https://your-domain.com for production
NODE_ENV="production"
```

**Important Production Settings:**
- Set `NODE_ENV=production`
- Use `https://` for `CLIENT_URL` if using HTTPS
- Use strong, random secrets for `JWT_SECRET` and `SESSION_SECRET`
- Update session cookie `secure: true` in `server/src/index.ts` if using HTTPS

### 6. Start the Server

#### Option A: Direct Node.js (Simple)

```bash
cd server
npm start
```

#### Option B: Using PM2 (Recommended for Production)

PM2 is a process manager that keeps your server running and restarts it if it crashes:

```bash
# Install PM2 globally (if not already installed)
npm install -g pm2

# Start the server with PM2
cd server
pm2 start dist/index.js --name pingpong-server

# Save PM2 configuration
pm2 save

# Setup PM2 to start on system boot
pm2 startup
```

**PM2 Useful Commands:**
```bash
pm2 list              # View running processes
pm2 logs pingpong-server  # View server logs
pm2 restart pingpong-server  # Restart the server
pm2 stop pingpong-server    # Stop the server
pm2 delete pingpong-server  # Remove from PM2
```

### 7. Serve the Client (Choose One Option)

#### Option 1: Serve Static Files from Express Server (Simplest)

Add this to `server/src/index.ts` after the routes but before the server starts:

```typescript
import path from 'path';

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

Then the server will serve both API and the React app on the same port.

#### Option 2: Separate Web Server (Nginx) - Recommended for Production

Use Nginx as a reverse proxy:

1. **Install Nginx:**
   ```bash
   # macOS
   brew install nginx
   
   # Ubuntu/Debian
   sudo apt-get install nginx
   ```

2. **Configure Nginx** (`/etc/nginx/sites-available/pingpong` or `/usr/local/etc/nginx/servers/pingpong`):

   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       # Serve React app static files
       location / {
           root /path/to/pingpong/client/dist;
           try_files $uri $uri/ /index.html;
           index index.html;
       }
       
       # Proxy API requests to Node.js server
       location /api {
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
       
       # Proxy WebSocket connections (for Socket.io)
       location /socket.io {
           proxy_pass http://localhost:3001;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

3. **Enable the site:**
   ```bash
   # Create symlink (Ubuntu/Debian)
   sudo ln -s /etc/nginx/sites-available/pingpong /etc/nginx/sites-enabled/
   
   # Or just edit the default config file directly
   ```

4. **Test and reload Nginx:**
   ```bash
   sudo nginx -t
   sudo nginx -s reload
   ```

#### Option 3: Deploy Client Separately (CDN/Static Hosting)

Deploy the client to a static hosting service:
- **Vercel**: `vercel --prod` (from `client/` directory)
- **Netlify**: Drag and drop `client/dist` folder or connect Git repo
- **AWS S3 + CloudFront**: Upload `client/dist` to S3 bucket

Then update `CLIENT_URL` in `server/.env` to point to your client URL.

### 8. HTTPS Setup (Recommended)

For production, use HTTPS. Options:

1. **Let's Encrypt (Free SSL):**
   ```bash
   # Install certbot
   sudo apt-get install certbot python3-certbot-nginx  # Ubuntu/Debian
   brew install certbot  # macOS
   
   # Get certificate
   sudo certbot --nginx -d your-domain.com
   
   # Auto-renewal (usually set up automatically)
   sudo certbot renew --dry-run
   ```

2. **Update server/src/index.ts** to set secure cookies when using HTTPS:
   ```typescript
   cookie: {
     secure: true, // Set to true for HTTPS
     httpOnly: true,
     maxAge: 7 * 24 * 60 * 60 * 1000,
     sameSite: 'lax',
   },
   ```

## Quick Deployment Checklist

- [ ] Pull latest code: `git pull origin main`
- [ ] Install dependencies: `npm run install:all`
- [ ] Build project: `npm run build`
- [ ] Update database: `cd server && npm run prisma:migrate deploy`
- [ ] Configure `.env` file with production settings
- [ ] Start server (PM2 or direct): `cd server && npm start`
- [ ] Configure web server (Nginx) or serve static files from Express
- [ ] Set up HTTPS (Let's Encrypt)
- [ ] Test the application
- [ ] Monitor logs: `pm2 logs pingpong-server` or check server logs

## Updating an Existing Deployment

When you want to deploy new changes:

```bash
# 1. Pull latest code
git pull origin main

# 2. Install any new dependencies
npm run install:all

# 3. Rebuild
npm run build

# 4. Apply any new database migrations
cd server
npm run prisma:generate
npm run prisma:migrate deploy

# 5. Restart server
pm2 restart pingpong-server  # If using PM2
# OR
# Stop current process and start again: npm start
```

## Environment-Specific Configuration

### Development
- `NODE_ENV=development`
- `CLIENT_URL=http://localhost:3000`
- Cookie `secure: false`

### Production
- `NODE_ENV=production`
- `CLIENT_URL=https://your-domain.com`
- Cookie `secure: true`
- Strong secrets for `JWT_SECRET` and `SESSION_SECRET`

## Troubleshooting

### Server won't start
- Check `DATABASE_URL` is set correctly in `.env`
- Verify database is accessible
- Check port 3001 is available
- Review server logs in `server/logs/`

### Client not loading
- Verify `client/dist` directory exists and has `index.html`
- Check Nginx/web server configuration
- Verify API URL in client build matches your server URL

### Database connection errors
- Verify `DATABASE_URL` format: `postgresql://user:password@host:port/database`
- Test database connection: `psql $DATABASE_URL`
- Check database is running and accessible

## Monitoring

For production, consider:
- **PM2 Monitoring**: `pm2 monit`
- **Log Management**: Check `server/logs/` directory
- **Error Tracking**: Consider integrating Sentry or similar
- **Uptime Monitoring**: Use services like UptimeRobot or Pingdom

