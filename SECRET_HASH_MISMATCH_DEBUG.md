# Secret Hash Mismatch Debug

## Issue
The secret hash in logs (`ae152f68fd6edd74`) doesn't match the hash of either:
- JWT_SECRET: `73eb694e9d599c38`
- SESSION_SECRET: `fbe880a49a5baf49`

This means the code is using a **different secret** than what's set in Fly.io.

## Possible Causes

### 1. Environment Variable Not Being Loaded
The environment variable might not be set correctly or not being read.

### 2. Whitespace/Encoding Issues
The secret might have extra whitespace or encoding issues.

### 3. Default Secret Being Used
The code might be falling back to the default `'secret'` value.

### 4. Multiple Environment Variable Sources
There might be conflicting environment variable sources.

## Verification Steps

### Step 1: Verify What Fly.io Actually Has

```bash
flyctl secrets list -a spin-master
```

This shows what's actually set. Check:
- Are JWT_SECRET and SESSION_SECRET actually set?
- Are there any typos in the variable names?

### Step 2: Check What Hash the Default Secret Produces

The default secret is `'secret'`. Let's verify what hash that produces:

```javascript
// In Node.js or browser console
const crypto = require('crypto');
const hash = crypto.createHash('sha256').update('secret').digest('hex').substring(0, 16);
console.log('Default "secret" hash:', hash);
```

If this matches `ae152f68fd6edd74`, then the code is using the default!

### Step 3: Check if Environment Variables Are Being Read

We should add logging to verify what environment variables are actually being read at runtime.

### Step 4: Verify Secret Values Directly

Compute the hash of the actual secret values to verify:

```bash
# Compute hash of JWT_SECRET value
node -e "const crypto = require('crypto'); const secret = 'YOUR_JWT_SECRET_VALUE'; console.log(crypto.createHash('sha256').update(secret).digest('hex').substring(0, 16));"

# Compute hash of SESSION_SECRET value  
node -e "const crypto = require('crypto'); const secret = 'YOUR_SESSION_SECRET_VALUE'; console.log(crypto.createHash('sha256').update(secret).digest('hex').substring(0, 16));"
```

Replace `YOUR_JWT_SECRET_VALUE` and `YOUR_SESSION_SECRET_VALUE` with the actual values from `flyctl secrets list`.

## Most Likely Issue

If the hash `ae152f68fd6edd74` matches the hash of `'secret'`, then:
- Environment variables aren't being loaded
- OR they're not set correctly in Fly.io
- OR there's a whitespace/encoding issue

## Solution

Add logging to show the actual environment variable values (or at least confirm they're set) and verify the fallback logic is working correctly.

