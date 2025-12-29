# Use Node.js LTS
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy server package files
COPY server/package*.json ./

# Install server dependencies (including dev deps needed for tsx)
RUN npm install

# Copy Prisma schema (needed for Prisma Client generation)
COPY server/prisma ./prisma

# Generate Prisma Client with correct binary target for Alpine Linux
RUN npx prisma generate --schema=./prisma/schema.prisma

# Copy server source code
COPY server/ ./

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Start server
CMD ["npm", "start"]