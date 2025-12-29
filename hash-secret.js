const crypto = require('crypto');

const secret = process.argv[2] || 'secret';

const hash = crypto.createHash('sha256')
  .update(secret)
  .digest('hex')
  .substring(0, 16);

console.log('Secret:', secret);
console.log('Hash (first 16 chars of SHA256):', hash);
console.log('\nUsage: node hash-secret.js "your-secret-value"');
