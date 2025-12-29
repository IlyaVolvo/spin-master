# Fly.io Dockerfile Setup Details

This document provides detailed information about the Dockerfile needed for Fly.io deployment.

## Dockerfile Location

The Dockerfile should be placed in the **project root** (same level as `package.json`), not in the `server/` directory.

## Complete Dockerfile

```dockerfile
# Use Node.js LTS
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY server/package*.json ./server/

# Install root dependencies (for install:all script if needed)
RUN npm install --production=false

# Install server dependencies
WORKDIR /app/server
RUN npm install --production

# Generate Prisma Client (required for runtime)
RUN npx prisma generate

# Copy Prisma schema (needed for Prisma Client)
COPY server/prisma ./prisma

# Copy server source code
COPY server/ ./

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Start server
CMD ["npm", "start"]
```

## Alternative: Simpler Dockerfile (if you only need server)

If you don't need the root `install:all` script, you can simplify:

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy server files
COPY server/package*.json ./
COPY server/ ./

# Install dependencies
RUN npm install --production

# Generate Prisma Client
RUN npx prisma generate

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["npm", "start"]
```

## .dockerignore File

Create `.dockerignore` in project root to exclude unnecessary files:

```
node_modules
server/node_modules
client/node_modules
.git
.env
.env.local
*.log
client/dist
server/dist
.DS_Store
.vscode
.idea
*.md
!README.md
fly.toml
.vercel
```

## Key Points

1. **Prisma Generate**: Must run `prisma generate` in the Dockerfile to create Prisma Client
2. **Production Dependencies**: Use `--production` flag to reduce image size
3. **Port**: Expose port 3000 (or whatever PORT env var is set to)
4. **Working Directory**: Set to `/app` or `/app/server` depending on structure
5. **Alpine Image**: Using `alpine` reduces image size significantly

## Building and Testing Locally

Before deploying, test the Dockerfile locally:

```bash
# Build image
docker build -t pingpong-server .

# Run container
docker run -p 3000:3000 \
  -e DATABASE_URL="your-database-url" \
  -e JWT_SECRET="test-secret" \
  -e SESSION_SECRET="test-secret" \
  -e CLIENT_URL="http://localhost:3000" \
  pingpong-server

# Test
curl http://localhost:3000/api/health
```

## Fly.io Specific Considerations

1. **Port**: Fly.io expects the app to listen on the port specified in `fly.toml` (`internal_port`)
2. **Environment Variables**: Set via `flyctl secrets set`, not in Dockerfile
3. **Health Checks**: Can be configured in `fly.toml` if needed
4. **Build Context**: Fly.io builds from project root by default

## Troubleshooting Docker Build

### Error: Cannot find module '@prisma/client'
- **Cause**: Prisma Client not generated
- **Fix**: Ensure `npx prisma generate` runs in Dockerfile

### Error: Cannot find module 'dotenv'
- **Cause**: dotenv in devDependencies but needed in production
- **Fix**: Move to dependencies in `server/package.json`

### Error: ENOENT: no such file or directory
- **Cause**: Copy paths incorrect
- **Fix**: Check COPY paths match your directory structure

### Large Image Size
- **Solution**: Use `node:alpine` instead of `node`
- **Solution**: Use `--production` flag for npm install
- **Solution**: Multi-stage build (advanced)


