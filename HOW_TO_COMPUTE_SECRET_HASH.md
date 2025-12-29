# How to Compute Hash of Secret

## Important Note

**The client (browser) does NOT have access to the JWT secret.** Only the server has the secret. The client only receives and stores the **token** (which was signed by the server using the secret).

## To Compute Hash of a Secret Value

If you want to compute the hash of a secret value to compare with what's in the Fly.io logs:

### Method 1: Using Node.js (Command Line)

```bash
node -e "const crypto = require('crypto'); const secret = 'YOUR_SECRET_VALUE'; console.log(crypto.createHash('sha256').update(secret).digest('hex').substring(0, 16));"
```

Replace `YOUR_SECRET_VALUE` with the actual secret value.

**Example:**
```bash
node -e "const crypto = require('crypto'); const secret = 'my-secret-key-123'; console.log(crypto.createHash('sha256').update(secret).digest('hex').substring(0, 16));"
# Output: a1b2c3d4e5f6g7h8 (example)
```

### Method 2: Using Node.js Script

Create a file `hash-secret.js`:

```javascript
const crypto = require('crypto');

const secret = process.argv[2] || 'secret';

const hash = crypto.createHash('sha256')
  .update(secret)
  .digest('hex')
  .substring(0, 16);

console.log('Secret:', secret);
console.log('Hash (first 16 chars of SHA256):', hash);
```

Run it:
```bash
node hash-secret.js "your-secret-value"
```

### Method 3: Using Browser Console

If you want to compute the hash in the browser (for testing):

```javascript
async function hashSecret(secret) {
  const encoder = new TextEncoder();
  const data = encoder.encode(secret);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .substring(0, 16);
  return hashHex;
}

// Usage
hashSecret('your-secret-value').then(hash => {
  console.log('Secret hash:', hash);
});
```

### Method 4: Using Online Tool

You can use online SHA256 hash generators, but **be careful with secrets** - don't use real production secrets on online tools!

## How to Compare with Fly.io Logs

1. Get the secret value from Fly.io:
   ```bash
   flyctl secrets list -a spin-master
   ```

2. Compute the hash of that secret:
   ```bash
   node -e "const crypto = require('crypto'); const secret = 'YOUR_SECRET_FROM_FLYIO'; console.log(crypto.createHash('sha256').update(secret).digest('hex').substring(0, 16));"
   ```

3. Compare with the `secretHash` or `jwtSecretHash` in the Fly.io logs

## What the Client Has

The client only has:
- **Token**: The JWT token (stored in `localStorage.getItem('pingpong_token')`)
- **Member data**: User info (stored in `localStorage.getItem('pingpong_member')`)

The client **does NOT have**:
- JWT_SECRET
- SESSION_SECRET
- Any secret values

## Verify Token (Client-Side)

You can decode the token to see its contents (but not the secret):

```javascript
// In browser console
const token = localStorage.getItem('pingpong_token');
if (token) {
  const parts = token.split('.');
  if (parts.length === 3) {
    const header = JSON.parse(atob(parts[0]));
    const payload = JSON.parse(atob(parts[1]));
    console.log('Token header:', header);
    console.log('Token payload:', payload);
    console.log('Token expires:', new Date(payload.exp * 1000));
    console.log('Token created:', new Date(payload.iat * 1000));
  }
}
```

This shows:
- Algorithm used (should be "HS256")
- Member ID
- Token type
- Expiration time
- Creation time

But it **cannot** show or verify the secret - only the server can verify tokens using the secret.

