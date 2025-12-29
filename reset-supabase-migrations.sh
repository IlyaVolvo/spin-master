#!/bin/bash
# Script to reset Supabase database and run migrations from scratch
# Usage: ./reset-supabase-migrations.sh

# Set your Supabase connection string here
#DATABASE_URL="${DATABASE_URL:-postgresql://postgres:YOUR-PASSWORD@db.xxxxx.supabase.co:5432/postgres}"
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:RVC2yct3yzq1egx_wvg@db.evfvxgoxzasjujgzoyfo.supabase.co:5432/postgres}"

echo "⚠️  WARNING: This will DROP ALL DATA in the database!"
echo "Press Ctrl+C to cancel, or Enter to continue..."
read

echo "Resetting database schema..."
psql "$DATABASE_URL" << EOF
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
EOF

if [ $? -ne 0 ]; then
    echo "❌ Error resetting database. Please check your DATABASE_URL."
    exit 1
fi

echo "✅ Database reset complete."
echo ""
echo "Running migrations..."
cd server
export DATABASE_URL="$DATABASE_URL"
npx prisma migrate deploy

if [ $? -ne 0 ]; then
    echo "❌ Migration failed. Please check the error messages above."
    exit 1
fi

echo "✅ Migrations complete."
echo ""
echo "Generating Prisma client..."
npm run prisma:generate

if [ $? -ne 0 ]; then
    echo "❌ Prisma client generation failed."
    exit 1
fi

echo "✅ All done! Database is ready."



