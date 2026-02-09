import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const prisma = new PrismaClient();

async function createIlyaUser() {
  try {
    console.log('\n=== Creating Ilya Volvovski User ===\n');

    // Hash the password
    const hashedPassword = await bcrypt.hash('sobaka', 10);

    // Create the user
    const user = await prisma.member.create({
      data: {
        firstName: 'Ilya',
        lastName: 'Volvovski',
        email: 'ilya@volvovski.com',
        password: hashedPassword,
        birthDate: new Date('1959-01-24'),
        rating: 1200,
        gender: 'MALE',
        roles: ['PLAYER', 'ORGANIZER', 'ADMIN'],
        isActive: true,
        mustResetPassword: false,
      },
    });

    console.log('✓ User created successfully!');
    console.log('\nUser Details:');
    console.log(`  ID: ${user.id}`);
    console.log(`  Name: ${user.firstName} ${user.lastName}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Date of Birth: ${user.birthDate?.toISOString().split('T')[0]}`);
    console.log(`  Rating: ${user.rating}`);
    console.log(`  Gender: ${user.gender}`);
    console.log(`  Roles: ${user.roles.join(', ')}`);
    console.log(`  Password: sobaka (hashed)\n`);

  } catch (error: any) {
    if (error.code === 'P2002') {
      console.error('\n❌ Error: A user with email ilya@volvovski.com already exists.\n');
    } else {
      console.error('\n❌ Error creating user:', error.message);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createIlyaUser();
