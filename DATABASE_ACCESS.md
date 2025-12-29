# Database Access Guide

This guide explains how to access your PostgreSQL database for the PingPong Tournament Management System.

## Database Connection String

The database connection is configured via the `DATABASE_URL` environment variable in `server/.env`:

```env
DATABASE_URL="postgresql://username:password@host:5432/database_name?schema=public"
```

## Accessing the Database

### 1. Command Line (psql)

#### Local Database
```bash
# Connect to local PostgreSQL
psql postgres

# Or connect directly to your database
psql -d pingpong

# Or with connection string
psql "postgresql://username:password@localhost:5432/pingpong"
```

#### Remote/Cloud Database
```bash
# Using connection string from environment
psql $DATABASE_URL

# Or with explicit connection string
psql "postgresql://user:pass@your-host.com:5432/dbname"
```

### 2. Prisma Studio (GUI - Recommended)

Prisma Studio provides a visual interface to browse and edit your database:

```bash
cd server
npm run prisma:studio
```

This will open a web interface at `http://localhost:5555` where you can:
- Browse all tables
- View and edit records
- Search and filter data
- See relationships between tables

### 3. Database GUI Tools

#### pgAdmin (Free, Full-featured)
1. Download from: https://www.pgadmin.org/
2. Install and launch
3. Right-click "Servers" → "Register" → "Server"
4. Enter connection details:
   - Name: `PingPong DB` (or any name)
   - Host: `localhost` (or your database host)
   - Port: `5432`
   - Database: `pingpong`
   - Username: Your PostgreSQL username
   - Password: Your PostgreSQL password

#### DBeaver (Free, Cross-platform)
1. Download from: https://dbeaver.io/
2. Install and launch
3. New Database Connection → PostgreSQL
4. Enter connection details (same as pgAdmin)
5. Test connection and finish

#### TablePlus (macOS/Windows, Paid with free tier)
1. Download from: https://tableplus.com/
2. Click "Create a new connection" → PostgreSQL
3. Enter connection details
4. Connect

#### VS Code Extensions
- **PostgreSQL** by Chris Kolkman
- **SQLTools** by Matheus Teixeira

## Common Database Operations

### Check Database Connection
```bash
cd server
# Test connection (if using Prisma)
npx prisma db execute --stdin <<< "SELECT version();"

# Or directly with psql
psql $DATABASE_URL -c "SELECT version();"
```

### List All Tables
```bash
psql $DATABASE_URL -c "\dt"

# Or using Prisma
npx prisma db execute --stdin <<< "\dt"
```

### View Database Schema
```bash
cd server
npx prisma db pull  # Pull schema from database
npx prisma studio   # Visual schema browser
```

### Run Migrations
```bash
cd server
npm run prisma:migrate  # Development (creates migration files)
npx prisma migrate deploy  # Production (applies migrations)
```

### Database Backup
```bash
# Backup database
pg_dump $DATABASE_URL > backup.sql

# Restore database
psql $DATABASE_URL < backup.sql
```

## Environment Variables

### Local Development
Create `server/.env`:
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/pingpong?schema=public"
JWT_SECRET="your-secret-key"
PORT=3001
```

### Production/Cloud
Set environment variables in your hosting platform:

**Render.com:**
- Go to your PostgreSQL service → Internal Database URL (or External)
- Copy the connection string
- Add to your web service environment variables

**Railway:**
- Go to your PostgreSQL service → Connect → Connection URL
- Copy the connection string
- Add to your app service environment variables

**Google Cloud SQL:**
- Create instance → Copy connection name
- Use format: `postgresql://user:password@/database?host=/cloudsql/project:region:instance`

**Heroku:**
```bash
heroku config:get DATABASE_URL
```

## Common Database Tables

Your database includes these main tables:
- `Member` - Users/members of the system
- `Tournament` - Tournament records
- `TournamentParticipant` - Many-to-many relationship
- `Match` - Match results
- `RatingHistory` - Historical rating changes
- `User` - Authentication users (legacy)

## Security Notes

⚠️ **Important Security Practices:**

1. **Never commit `.env` files** - They contain sensitive credentials
2. **Use strong passwords** for production databases
3. **Limit network access** - Use firewall rules to restrict database access
4. **Use SSL/TLS** for production connections (add `?sslmode=require` to connection string)
5. **Rotate credentials** regularly
6. **Use connection pooling** for production (Prisma handles this automatically)

## Troubleshooting

### Connection Refused
- Check if PostgreSQL is running: `brew services list` (macOS) or `systemctl status postgresql` (Linux)
- Verify port: Default is `5432`
- Check firewall settings

### Authentication Failed
- Verify username and password
- Check PostgreSQL authentication settings (`pg_hba.conf`)
- For cloud databases, check IP whitelist

### Database Not Found
- Verify database name in connection string
- Create database: `createdb pingpong`

### SSL Required
If your cloud database requires SSL:
```env
DATABASE_URL="postgresql://user:pass@host:5432/db?sslmode=require"
```

## Quick Reference

```bash
# Connect to database
psql $DATABASE_URL

# Or if DATABASE_URL is in .env
cd server
source .env  # Load environment variables (may need adjustment)
psql $DATABASE_URL

# View all members
psql $DATABASE_URL -c "SELECT id, email, \"firstName\", \"lastName\", roles FROM \"Member\";"

# Count records in each table
psql $DATABASE_URL -c "
  SELECT 'Member' as table_name, COUNT(*) FROM \"Member\"
  UNION ALL SELECT 'Tournament', COUNT(*) FROM \"Tournament\"
  UNION ALL SELECT 'Match', COUNT(*) FROM \"Match\";
"

# Open Prisma Studio (easiest way to browse)
cd server
npm run prisma:studio
```

