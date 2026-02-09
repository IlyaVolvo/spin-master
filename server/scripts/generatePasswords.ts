import bcrypt from 'bcryptjs';

async function generatePasswords() {
  const ilyaPassword = await bcrypt.hash('sobaka', 10);
  const defaultPassword = await bcrypt.hash('changeme', 10);
  
  console.log('\n=== Password Hashes ===\n');
  console.log('ilya@volvovski.com (password: sobaka):');
  console.log(ilyaPassword);
  console.log('\nAll other users (password: changeme):');
  console.log(defaultPassword);
  console.log('\n');
}

generatePasswords().catch(console.error);
