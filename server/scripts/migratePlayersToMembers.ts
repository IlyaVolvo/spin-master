import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/**
 * Data migration script to:
 * 1. Populate email, gender, password, roles for existing members
 * 2. Create Admin member
 * 3. Update RatingChangeReason enum values
 * 4. Make required columns NOT NULL
 */

// Helper function to determine gender from name (simple heuristic)
function determineGender(firstName: string): 'MALE' | 'FEMALE' | 'OTHER' {
  const name = firstName.toLowerCase();
  // Common female name endings/patterns
  const femalePatterns = ['a', 'ia', 'ella', 'ette', 'ine', 'ina', 'elle', 'anna', 'ella'];
  // Common male name endings/patterns
  const malePatterns = ['o', 'er', 'on', 'en', 'an', 'el', 'us', 'is'];
  
  // Check for common female patterns
  for (const pattern of femalePatterns) {
    if (name.endsWith(pattern) && name.length > 3) {
      return 'FEMALE';
    }
  }
  
  // Check for common male patterns
  for (const pattern of malePatterns) {
    if (name.endsWith(pattern) && name.length > 3) {
      return 'MALE';
    }
  }
  
  // Default to OTHER if uncertain
  return 'OTHER';
}

// Generate email from first name and last name
function generateEmail(firstName: string, lastName: string): string {
  const firstLetter = firstName.charAt(0).toLowerCase();
  const lastNameLower = lastName.toLowerCase().replace(/\s+/g, '');
  return `${firstLetter}${lastNameLower}@example.com`;
}

async function main() {
  console.log('Starting data migration: Players to Members...');

  try {
    // Step 1: Populate email, gender, password, roles for all existing members
    console.log('Step 1: Populating member data for existing records...');
    const members = await prisma.$queryRaw<Array<{ id: number; firstName: string; lastName: string }>>`
      SELECT id, "firstName", "lastName" FROM members WHERE email IS NULL
    `;

    const defaultPassword = await bcrypt.hash('changeme', 10);

    for (const member of members) {
      const email = generateEmail(member.firstName, member.lastName);
      const gender = determineGender(member.firstName);
      
      // Check if email already exists, if so, add a number
      let finalEmail = email;
      let counter = 1;
      while (true) {
        const existing = await prisma.$queryRaw<Array<{ id: number }>>`
          SELECT id FROM members WHERE email = ${finalEmail} AND id != ${member.id}
        `;
        if (existing.length === 0) break;
        finalEmail = `${member.firstName.charAt(0).toLowerCase()}${member.lastName.toLowerCase()}${counter}@example.com`;
        counter++;
      }

      await prisma.$executeRaw`
        UPDATE members 
        SET email = ${finalEmail},
            gender = ${gender}::"Gender",
            password = ${defaultPassword},
            roles = ARRAY['PLAYER']::"MemberRole"[]
        WHERE id = ${member.id}
      `;
      
      console.log(`Updated member ${member.id}: ${member.firstName} ${member.lastName} -> ${finalEmail}`);
    }

    // Step 2: Create Admin member if it doesn't exist
    console.log('Step 2: Creating Admin member...');
    const adminEmail = 'admin@pingpong.com';
    const adminPassword = await bcrypt.hash('changeme', 10);
    
    const existingAdmin = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM members WHERE email = ${adminEmail}
    `;

    if (existingAdmin.length === 0) {
      await prisma.$executeRaw`
        INSERT INTO members ("firstName", "lastName", email, gender, password, roles, "isActive", "createdAt", "updatedAt")
        VALUES ('Admin', 'Admin', ${adminEmail}, 'MALE'::"Gender", ${adminPassword}, ARRAY['ADMIN']::"MemberRole"[], true, NOW(), NOW())
      `;
      console.log('Admin member created: Admin Admin (admin@pingpong.com)');
    } else {
      console.log('Admin member already exists');
    }

    // Step 3: Update RatingChangeReason enum values (PLAYER_DEACTIVATED -> MEMBER_DEACTIVATED)
    // Note: This is already done in the migration, but we'll verify here
    console.log('Step 3: Verifying RatingChangeReason enum values...');
    const oldRecords = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM rating_history 
      WHERE reason = 'PLAYER_DEACTIVATED'::"RatingChangeReason"
    `;
    if (oldRecords[0].count > 0) {
      console.log(`Found ${oldRecords[0].count} records still using PLAYER_DEACTIVATED, updating...`);
      await prisma.$executeRaw`
        UPDATE rating_history 
        SET reason = 'MEMBER_DEACTIVATED'::"RatingChangeReason"
        WHERE reason = 'PLAYER_DEACTIVATED'::"RatingChangeReason"
      `;
    }
    console.log('RatingChangeReason enum values verified');

    // Step 4: Make required columns NOT NULL
    console.log('Step 4: Making required columns NOT NULL...');
    await prisma.$executeRaw`ALTER TABLE members ALTER COLUMN email SET NOT NULL`;
    await prisma.$executeRaw`ALTER TABLE members ALTER COLUMN gender SET NOT NULL`;
    await prisma.$executeRaw`ALTER TABLE members ALTER COLUMN password SET NOT NULL`;
    await prisma.$executeRaw`ALTER TABLE members ALTER COLUMN roles SET NOT NULL`;
    console.log('Made required columns NOT NULL');

    console.log('Data migration completed successfully!');
  } catch (error) {
    console.error('Error during data migration:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

