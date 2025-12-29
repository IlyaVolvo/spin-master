# How to Get the Actual Secret Used

## Security Note
We can't log the actual secret value (security risk), but we can verify the **same secret** is being used by comparing a **hash** of the secret.

## Method 1: Check Fly.io Secrets (Actual Values)

To see what secrets are actually set in Fly.io:

```bash
flyctl secrets list -a spin-master
```

This shows:
- `JWT_SECRET` - the actual value (if set)
- `SESSION_SECRET` - the actual value (if set)

**Note:** These are the actual secret values, so be careful with them!

## Method 2: Compare Secret Hashes in Logs

After deploying the updated logging, you'll see a `secretHash` field in the logs:

### During Token Creation (Login):
```
[INFO] Creating JWT token
{
  secretSource: "JWT_SECRET",
  secretLength: 32,
  secretHash: "a1b2c3d4e5f6g7h8",  // ← Hash of the secret
  ...
}
```

### During Token Verification (API Calls):
```
[INFO] Verifying JWT token
{
  secretSource: "JWT_SECRET",
  secretLength: 32,
  secretHash: "a1b2c3d4e5f6g7h8",  // ← Should match!
  ...
}
```

**If `secretHash` matches:** The same secret is being used ✅
**If `secretHash` differs:** Different secrets are being used ❌

## Method 3: Verify Secret Hash Manually

If you want to verify what hash a secret produces (to compare with logs):

### Using Node.js:
```javascript
const crypto = require('crypto');
const secret = 'your-secret-value-here';
const hash = crypto.createHash('sha256').update(secret).digest('hex').substring(0, 16);
console.log('Secret hash:', hash);
```

### Using Browser Console:
```javascript
async function hashSecret(secret) {
  const encoder = new TextEncoder();
  const data = encoder.encode(secret);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
  return hashHex;
}

// Usage
hashSecret('your-secret-value').then(hash => console.log('Secret hash:', hash));
```

## What to Check

1. **Compare secretHash in logs:**
   - Look at "Creating JWT token" log (during login)
   - Look at "Verifying JWT token" log (during API calls)
   - They should have the **same `secretHash`**

2. **Compare secretSource:**
   - Should be the same in both logs
   - Either "JWT_SECRET" or "SESSION_SECRET" or "default"

3. **Compare secretLength:**
   - Should be the same in both logs
   - If different, different secrets are being used

## Example Diagnostic

### ✅ Correct (Same Secret):
```
Login:  { secretHash: "a1b2c3d4", secretLength: 32, secretSource: "JWT_SECRET" }
Verify: { secretHash: "a1b2c3d4", secretLength: 32, secretSource: "JWT_SECRET" }
```
→ Same secret used for both!

### ❌ Wrong (Different Secrets):
```
Login:  { secretHash: "a1b2c3d4", secretLength: 32, secretSource: "JWT_SECRET" }
Verify: { secretHash: "x9y8z7w6", secretLength: 25, secretSource: "SESSION_SECRET" }
```
→ Different secrets! Token won't verify.

## Quick Check Script

After logging in, run this to see what secret info is in the logs:

1. Check Fly.io logs for login:
   ```bash
   flyctl logs -a spin-master | grep "Creating JWT token" -A 10
   ```
   Note the `secretHash`, `secretLength`, and `secretSource`

2. Check Fly.io logs for verification:
   ```bash
   flyctl logs -a spin-master | grep "Verifying JWT token" -A 10
   ```
   Compare the `secretHash` - should match!

3. If they don't match:
   - Check what secrets are set: `flyctl secrets list -a spin-master`
   - Verify the secret values match what you expect
   - Check if there are typos or different values

