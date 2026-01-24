/**
 * Setup script for new spin-master database
 * This script initializes a clean database with the new schema
 * 
 * Usage:
 *   cd server
 *   tsx scripts/setupNewDatabase.ts
 */

import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const prisma = new PrismaClient();

async function setupDatabase() {
  try {
    console.log('Setting up new spin-master database...\n');

    // Step 1: Check if database exists
    console.log('Step 1: Checking database connection...');
    try {
      await prisma.$connect();
      console.log('✓ Database connection successful\n');
    } catch (error) {
      console.error('✗ Database connection failed');
      console.error('Please ensure PostgreSQL is running and DATABASE_URL in .env is correct');
      console.error('Expected database name: spin-master\n');
      process.exit(1);
    }

    // Step 2: Push schema to database
    console.log('Step 2: Pushing schema to database...');
    try {
      const { stdout, stderr } = await execAsync('npx prisma db push --skip-generate');
      if (stdout) console.log(stdout);
      if (stderr && !stderr.includes('Warning')) console.error(stderr);
      console.log('✓ Schema pushed successfully\n');
    } catch (error: any) {
      console.error('✗ Failed to push schema');
      console.error(error.message);
      process.exit(1);
    }

    // Step 3: Generate Prisma client
    console.log('Step 3: Generating Prisma client...');
    try {
      const { stdout, stderr } = await execAsync('npx prisma generate');
      if (stdout) console.log(stdout);
      if (stderr && !stderr.includes('Warning')) console.error(stderr);
      console.log('✓ Prisma client generated successfully\n');
    } catch (error: any) {
      console.error('✗ Failed to generate Prisma client');
      console.error(error.message);
      process.exit(1);
    }

    // Step 4: Verify tables were created
    console.log('Step 4: Verifying database structure...');
    try {
      const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY tablename;
      `;
      
      const expectedTables = [
        'members',
        'tournaments',
        'tournament_participants',
        'matches',
        'bracket_matches',
        'rating_history',
        'point_exchange_rules'
      ];

      console.log(`Found ${tables.length} tables:`);
      tables.forEach(table => {
        const isExpected = expectedTables.includes(table.tablename);
        console.log(`  ${isExpected ? '✓' : '?'} ${table.tablename}`);
      });

      const missingTables = expectedTables.filter(t => 
        !tables.some(tb => tb.tablename === t)
      );

      if (missingTables.length > 0) {
        console.error(`\n✗ Missing tables: ${missingTables.join(', ')}`);
        process.exit(1);
      }

      console.log('\n✓ All expected tables created successfully\n');
    } catch (error: any) {
      console.error('✗ Failed to verify database structure');
      console.error(error.message);
      process.exit(1);
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log('✓ Database setup completed successfully!');
    console.log('═══════════════════════════════════════════════════════');
    console.log('\nNext steps:');
    console.log('1. Seed initial data (e.g., point exchange rules) if needed');
    console.log('2. Create system admin user: npm run create-sys-admin');
    console.log('3. Start the server: npm run dev\n');

  } catch (error: any) {
    console.error('\n✗ Setup failed:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the setup
setupDatabase();
