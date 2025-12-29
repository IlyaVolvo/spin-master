# Build Process Changes

## Summary

Removed TypeScript compilation (`tsc`) from production build. The server now runs TypeScript directly using `tsx`.

## Changes Made

1. **`server/package.json`**:
   - `build` script: Changed from `tsc` to `prisma generate` (only generates Prisma client)
   - `start` script: Changed from `node dist/index.js` to `tsx src/index.ts`
   - `main` field: Changed from `dist/index.js` to `src/index.ts`
   - `tsx`: Moved from `devDependencies` to `dependencies` (needed for production)

## Benefits

- Faster builds (no TypeScript compilation step)
- Simpler deployment process
- One less build dependency (`typescript` can stay in devDependencies)
- TypeScript still provides type checking in development

## Deployment Impact

### Before:
```bash
npm run build  # Runs tsc
npm start      # Runs node dist/index.js
```

### After:
```bash
npm run build  # Runs prisma generate (only generates Prisma client)
npm start      # Runs tsx src/index.ts (runs TypeScript directly)
```

## Deployment Services

### Render.com / Railway.app

**Build Command:**
```bash
npm install && npm run build && npx prisma generate
```

This will:
1. Install dependencies (including `tsx` in production)
2. Run `npm run build` (generates Prisma client)
3. Generate Prisma client (redundant, but safe)

**Start Command:**
```bash
npm start
```

This will run `tsx src/index.ts` directly.

### Google Cloud Run

Update the Dockerfile to copy source files instead of dist:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci
RUN npx prisma generate
COPY src ./src          # Copy source instead of dist
COPY tsconfig.json ./
EXPOSE 3001
ENV NODE_ENV=production
CMD ["npm", "start"]    # Will run tsx src/index.ts
```

### Notes

- The `dist/` directory is no longer needed or created
- TypeScript is still used for type checking in development
- `tsx` handles TypeScript execution at runtime
- Source maps are still available (if configured)
- Development workflow remains unchanged (`npm run dev` still uses `tsx watch`)

