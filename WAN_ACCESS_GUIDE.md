# Guide: Accessing PingPong Application from WAN

## Current Port Configuration

Your application uses the following ports:

- **Frontend (Client)**: Port **3000** (Vite dev server)
- **Backend (Server/API)**: Port **3001** (Express API server)
- **PostgreSQL Database**: Port **5432** (default, internal only)

## Current Status

✅ **Good news**: Your application is already configured to listen on all network interfaces:
- Server listens on `0.0.0.0:3001` (accessible from network)
- Client listens on `0.0.0.0:3000` (accessible from network)

## Steps to Enable WAN Access

### Option 1: Simple Development Access (Quick but Less Secure)

This allows access from anywhere on the internet. **Use only for testing!**

#### 1. Configure Router Port Forwarding

Access your router's admin panel (usually `192.168.1.1` or `192.168.0.1`) and set up port forwarding:

**Forward these ports:**
- External Port: `3000` → Internal IP: `YOUR_LOCAL_IP:3000` (Frontend)
- External Port: `3001` → Internal IP: `YOUR_LOCAL_IP:3001` (Backend API)

**How to find your local IP:**
```bash
# macOS/Linux:
ifconfig | grep "inet " | grep -v 127.0.0.1

# Windows:
ipconfig
```

Look for an IP like `192.168.x.x` or `10.x.x.x`

#### 2. Find Your Public IP Address

```bash
# From terminal:
curl ifconfig.me

# Or visit in browser:
# https://whatismyipaddress.com/
```

#### 3. Access the Application

Once port forwarding is set up, access from anywhere:
- Frontend: `http://YOUR_PUBLIC_IP:3000`
- API: `http://YOUR_PUBLIC_IP:3001`

**Important Notes:**
- Your public IP may change (if you don't have a static IP)
- Database is still on localhost (PostgreSQL not exposed, which is good!)
- **Not secure for production** - no HTTPS, exposed to internet

### Option 2: Production-Ready Setup (Recommended)

For production access, you need additional security measures:

#### A. Set Up Reverse Proxy with HTTPS

Use **nginx** or **Caddy** as a reverse proxy with SSL:

**Example nginx configuration:**

```nginx
# /etc/nginx/sites-available/pingpong
server {
    listen 80;
    server_name your-domain.com;  # Or use your public IP
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /path/to/ssl/cert.pem;
    ssl_certificate_key /path/to/ssl/key.pem;
    
    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Backend API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Port forwarding then:**
- External Port: `80` (HTTP) → Internal IP: `YOUR_LOCAL_IP:80`
- External Port: `443` (HTTPS) → Internal IP: `YOUR_LOCAL_IP:443`

#### B. Update Client Configuration

For production, update `client/vite.config.ts` to use your domain:

```typescript
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: true,
  },
});
```

Set environment variable `VITE_API_URL=https://your-domain.com/api` for production build.

#### C. Build Production Client

```bash
cd client
npm run build

# Serve built files with a web server (nginx, or serve the dist folder)
# Or use Vite preview: npm run preview
```

#### D. Use Environment Variables

Create production `.env` files:

**server/.env:**
```env
DATABASE_URL="postgresql://user:password@localhost:5432/pingpong?schema=public"
JWT_SECRET="your-very-secure-secret-key-change-in-production"
PORT=3001
NODE_ENV=production
```

**client/.env.production:**
```env
VITE_API_URL=https://your-domain.com/api
```

## Security Considerations

### 🔴 Critical Security Items

1. **Database**: Keep PostgreSQL on localhost only (port 5432 should NOT be forwarded)
2. **JWT Secret**: Use a strong, random secret in production
3. **HTTPS**: Always use HTTPS for production (Let's Encrypt is free)
4. **Firewall**: Configure firewall rules to only allow necessary ports

### 🟡 Recommended Security

1. **Rate Limiting**: Add rate limiting to API endpoints
2. **CORS**: Configure CORS properly (currently allows all origins)
3. **Authentication**: Ensure strong passwords for admin users
4. **Logging**: Monitor access logs for suspicious activity
5. **Regular Updates**: Keep dependencies updated

### Current CORS Configuration

Your server currently allows all origins:
```typescript
app.use(cors());
```

For production, restrict this:
```typescript
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || 'https://your-domain.com',
  credentials: true,
}));
```

## Quick Start for Testing

If you just want to test WAN access quickly:

1. **Enable port forwarding** on your router:
   - Port 3000 → Your local IP:3000
   - Port 3001 → Your local IP:3001

2. **Find your public IP**:
   ```bash
   curl ifconfig.me
   ```

3. **Access from anywhere**:
   - `http://YOUR_PUBLIC_IP:3000`

4. **Test the API**:
   ```bash
   curl http://YOUR_PUBLIC_IP:3001/api/health
   ```

## Dynamic DNS (If Public IP Changes)

If your ISP assigns dynamic IPs:

1. Use a Dynamic DNS service (DuckDNS, No-IP, etc.)
2. Install their client on your server
3. Use the domain name instead of IP address

## Troubleshooting

### Port Forwarding Not Working?

1. Check firewall rules on your computer
2. Verify router port forwarding rules
3. Test locally first: `curl http://localhost:3001/api/health`
4. Check if ISP blocks ports (some ISPs block common ports)

### Can't Access from WAN?

1. **Check server is listening on 0.0.0.0** (already configured ✅)
2. **Test from local network first**: `http://LOCAL_IP:3000`
3. **Check router firewall**: May need to allow ports
4. **ISP restrictions**: Some ISPs block incoming connections on residential plans

### Database Connection Issues

- Database should remain on `localhost:5432`
- Do NOT expose PostgreSQL to the internet
- If database is on another machine, use VPN or private network

## Summary

**For Quick Testing:**
- Forward ports 3000 and 3001
- Access via `http://YOUR_PUBLIC_IP:3000`
- ⚠️ Not secure for production

**For Production:**
- Use reverse proxy (nginx/Caddy)
- Enable HTTPS (Let's Encrypt)
- Configure proper CORS
- Use strong JWT secret
- Build production client
- Keep database internal only

**Ports to Forward:**
- Development: `3000` (frontend), `3001` (backend)
- Production with nginx: `80` (HTTP), `443` (HTTPS)
- **Never forward**: `5432` (PostgreSQL)

