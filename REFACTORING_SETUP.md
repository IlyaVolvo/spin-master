# Refactoring Setup Guide

This document describes the branch structure and setup for the major refactoring.

## Branch Structure

### `backup` Branch
- **Purpose**: Preserves the current working state of the application
- **Database**: Uses the original database name (preserved from current state)
- **Ports**:
  - Client: `3300`
  - Server: `3301`
  - Prisma Studio: `5561`

### `master` Branch
- **Purpose**: Main development branch for refactoring
- **Database**: Uses new database name `spin-master`
- **Ports**: 
  - Client: `3000` (default)
  - Server: `3001` (default)
  - Prisma Studio: `5555` (default)

## Setup Instructions

### For Backup Branch

1. Switch to backup branch:
   ```bash
   git checkout backup
   ```

2. Update your `.env` file in `server/` directory:
   - Keep your current `DATABASE_URL` (original database name)
   - Update `PORT=3301` if you want to override the default

3. Run the application:
   ```bash
   # Terminal 1 - Server
   cd server
   npm run dev
   
   # Terminal 2 - Client
   cd client
   npm run dev
   
   # Terminal 3 - Prisma Studio (optional)
   cd server
   npm run prisma:studio  # Will run on port 5561
   ```

4. Access:
   - Frontend: http://localhost:3300
   - Backend API: http://localhost:3301/api
   - Prisma Studio: http://localhost:5561

### For Master Branch (Refactoring)

1. Switch to master branch:
   ```bash
   git checkout master
   ```

2. Create the new database:
   ```bash
   # Connect to PostgreSQL
   psql -U your_username
   
   # Create new database
   CREATE DATABASE "spin-master";
   ```

3. Update your `.env` file in `server/` directory:
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/spin-master?schema=public"
   PORT=3001
   # ... other variables
   ```

4. Run Prisma migrations:
   ```bash
   cd server
   npx prisma migrate dev --name init
   # Or if you want to start fresh:
   npx prisma db push
   ```

5. Run the application:
   ```bash
   # Terminal 1 - Server
   cd server
   npm run dev
   
   # Terminal 2 - Client
   cd client
   npm run dev
   ```

6. Access:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001/api
   - Prisma Studio: http://localhost:5555

## Important Notes

- The `.env` file is gitignored, so you need to manually update it when switching branches
- The backup branch preserves the current database schema and data
- The master branch uses a new database, so you'll need to set up data from scratch or migrate it
- Both branches can run simultaneously on different ports if needed

## Next Steps

After confirming the backup branch works correctly:
1. Verify all functionality on backup branch
2. Switch to master branch
3. Begin step-by-step refactoring changes
4. Test each change incrementally
