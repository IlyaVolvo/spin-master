import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { createHash, randomBytes } from 'crypto';

// Load environment variables
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const prisma = new PrismaClient();

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function generateQrTokenHash(): string {
  return createHash('sha256')
    .update(`${randomBytes(32).toString('hex')}:${Date.now()}:${Math.random()}`)
    .digest('hex');
}

async function createSysAdmin() {
  try {
    getRequiredEnv('DATABASE_URL');
    const email = getRequiredEnv('SYS_ADMIN_EMAIL');
    const password = getRequiredEnv('SYS_ADMIN_PASSWORD');
    const firstName = getRequiredEnv('SYS_ADMIN_FIRST_NAME');
    const lastName = getRequiredEnv('SYS_ADMIN_LAST_NAME');

    console.log('Creating Sys Admin member...');
    console.log(`Email: ${email}`);
    console.log(`Name: ${firstName} ${lastName}`);

    // Check if member already exists
    const existingMember = await prisma.member.findUnique({
      where: { email },
    });

    if (existingMember) {
      console.log(`Member with email ${email} already exists.`);
      console.log('Updating roles to include ADMIN...');
      
      // Update existing member to have ADMIN role
      const updatedMember = await prisma.member.update({
        where: { id: existingMember.id },
        data: {
          roles: ['ADMIN'],
          isActive: true,
        },
      });
      
      console.log('✅ Member updated successfully!');
      console.log(`Member ID: ${updatedMember.id}`);
      console.log(`Roles: ${updatedMember.roles.join(', ')}`);
      
      // Keep credentials in sync with configured values
      const hashedPassword = await bcrypt.hash(password, 10);
      await prisma.member.update({
        where: { id: existingMember.id },
        data: { password: hashedPassword },
      });
      console.log('✅ Password updated!');
      
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new member with ADMIN role
    const member = await prisma.member.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        roles: ['ADMIN'],
        isActive: true,
        gender: 'NOT_SPECIFIED', // Default until set
        qrTokenHash: generateQrTokenHash(),
      },
    });

    console.log('✅ Sys Admin member created successfully!');
    console.log(`Member ID: ${member.id}`);
    console.log(`Email: ${member.email}`);
    console.log(`Name: ${member.firstName} ${member.lastName}`);
    console.log(`Roles: ${member.roles.join(', ')}`);
    console.log('\nYou can now login with:');
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
  } catch (error) {
    console.error('❌ Error creating Sys Admin:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
createSysAdmin()
  .then(() => {
    console.log('\n✅ Script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

