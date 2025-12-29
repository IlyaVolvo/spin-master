import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const prisma = new PrismaClient();

async function createSysAdmin() {
  try {
    const email = process.env.SYS_ADMIN_EMAIL || 'admin@pingpong.com';
    const password = process.env.SYS_ADMIN_PASSWORD || 'Admin123!';
    const firstName = process.env.SYS_ADMIN_FIRST_NAME || 'System';
    const lastName = process.env.SYS_ADMIN_LAST_NAME || 'Administrator';

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
      
      // Update password if provided
      if (process.env.SYS_ADMIN_PASSWORD) {
        const hashedPassword = await bcrypt.hash(password, 10);
        await prisma.member.update({
          where: { id: existingMember.id },
          data: { password: hashedPassword },
        });
        console.log('✅ Password updated!');
      }
      
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
        gender: 'OTHER', // Default gender
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

