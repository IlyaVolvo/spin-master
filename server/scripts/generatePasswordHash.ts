import * as bcrypt from 'bcryptjs';

const password = process.argv[2] || 'Admin123!';

async function generateHash() {
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('\n========================================');
    console.log('Password Hash Generated');
    console.log('========================================');
    console.log('Original password:', password);
    console.log('Hashed password (for database):');
    console.log(hashedPassword);
    console.log('\nYou can use this hash directly in PostgreSQL:');
    console.log(`UPDATE "members" SET password = '${hashedPassword}' WHERE email = 'your-email@example.com';`);
    console.log('========================================\n');
  } catch (error) {
    console.error('Error generating hash:', error);
    process.exit(1);
  }
}

generateHash();



