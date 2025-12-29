# Quick Setup Guide

## Step 1: Install Dependencies

```bash
npm run install:all
```

This installs dependencies for the root, server, and client.

## Step 2: Database Setup

### Install PostgreSQL (macOS)

If you don't have PostgreSQL installed yet:

**Using Homebrew (recommended):**
```bash
brew install postgresql@15
# or for the latest version:
brew install postgresql
```

**Start PostgreSQL service:**
```bash
brew services start postgresql@15
# or
brew services start postgresql
```

**Verify installation:**
```bash
psql --version
```

**Set up a password for the default user (optional):**
```bash
psql postgres
```
Then in the psql prompt:
```sql
ALTER USER postgres PASSWORD 'your_password';
\q
```

### Alternative: PostgreSQL.app (macOS GUI)

Download from: https://postgresapp.com/
- Easy GUI installation
- No command-line setup needed
- Default connection: `postgresql://localhost` (no password by default)

### Create the Database

Once PostgreSQL is installed and running:

```bash
createdb pingpong
```

Or using psql:
```bash
psql postgres
```
Then in the psql prompt:
```sql
CREATE DATABASE pingpong;
\q
```

### Configure Environment Variables
   ```bash
   cd server
   cp env.example .env
   ```

3. **Edit `.env` file:**
   ```env
   DATABASE_URL="postgresql://username:password@localhost:5432/pingpong?schema=public"
   JWT_SECRET="generate-a-random-secret-key-here"
   PORT=3001
   ```

   For cloud databases, use your provider's connection string.

## Step 3: Initialize Database

```bash
cd server
npm run prisma:generate
npm run prisma:migrate
```

This creates all database tables.

## Step 4: Create Admin User

You can create a user via the API:

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"yourpassword"}'
```

Or use the login endpoint if you've already created a user.

## Step 5: Run the Application

**Option 1: Run both server and client together:**
```bash
npm run dev
```

**Option 2: Run separately:**

Terminal 1 (Server):
```bash
cd server
npm run dev
```

Terminal 2 (Client):
```bash
cd client
npm start
```

## Step 6: Access the Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- API Health Check: http://localhost:3001/api/health

## Troubleshooting

### Database Connection Issues
- Verify PostgreSQL is running
- Check DATABASE_URL format
- Ensure database exists
- Check firewall/network settings for cloud databases

### Port Already in Use
- Change PORT in `.env` file
- Update client proxy in `client/vite.config.ts` if needed

### Prisma Issues
- Run `npm run prisma:generate` again
- Check Prisma schema syntax
- Verify database connection

### Authentication Issues
- Ensure JWT_SECRET is set
- Check token in browser localStorage
- Verify token hasn't expired (7 days default)

## Next Steps

1. Login with your credentials
2. Add some players
3. Create a tournament
4. Add match results
5. Complete the tournament to see rankings update!


