# JWT Secret Diagnostic Logging

## What Was Added

Comprehensive logging to track JWT secret usage throughout the authentication flow:

### 1. Token Creation (Login Route)
When a token is created during login, logs show:
- `secretSource`: Which environment variable was used (JWT_SECRET, SESSION_SECRET, or default)
- `jwtSecretSet`: Whether JWT_SECRET is set
- `sessionSecretSet`: Whether SESSION_SECRET is set
- `secretLength`: Length of the secret (for verification, not the actual value)
- `usingDefault`: Whether using the default 'secret'
- `tokenLength`: Length of created token
- `tokenPrefix`: First 20 characters of token (for debugging)

### 2. Token Verification (Auth Middleware)
When a token is verified, logs show:
- All the same fields as token creation
- Allows comparison to see if the same secret source is being used

### 3. Error Logging
When verification fails, logs show:
- All secret source information
- Full error message
- Diagnostic message explaining the likely issue

## What This Reveals

After deploying, when you try to log in, you'll see:

1. **During Login:**
   ```
   [INFO] Creating JWT token
   {
     secretSource: "JWT_SECRET" (or "SESSION_SECRET" or "default"),
     jwtSecretSet: true/false,
     sessionSecretSet: true/false,
     secretLength: 32,
     usingDefault: false,
     tokenLength: 150,
     tokenPrefix: "eyJhbGciOiJIUzI1NiIs..."
   }
   ```

2. **During Verification (when using token):**
   ```
   [INFO] Verifying JWT token
   {
     secretSource: "JWT_SECRET" (or "SESSION_SECRET" or "default"),
     jwtSecretSet: true/false,
     sessionSecretSet: true/false,
     secretLength: 32,
     usingDefault: false,
     tokenLength: 150,
     tokenPrefix: "eyJhbGciOiJIUzI1NiIs..."
   }
   ```

3. **If Verification Fails:**
   ```
   [WARN] JWT token verification failed
   {
     error: "invalid signature",
     secretSource: "SESSION_SECRET",
     jwtSecretSet: false,
     sessionSecretSet: true,
     secretLength: 25,
     diagnostic: "Token was signed with a different secret than the one used for verification..."
   }
   ```

## How to Use

1. Deploy the updated code to Fly.io
2. Clear browser localStorage and log in again
3. Check Fly.io logs: `flyctl logs -a spin-master`
4. Compare the `secretSource` and `secretLength` between:
   - "Creating JWT token" log (during login)
   - "Verifying JWT token" log (during API calls)
   
5. **If they don't match**, you've found the issue:
   - Token was signed with one secret source/length
   - Token was verified with a different secret source/length
   - This indicates environment variables are different or inconsistent

## Expected Behavior

For tokens to work correctly:
- Token creation and verification should use the **same secret source**
- `secretLength` should be the **same** in both logs
- `usingDefault` should be **false** in production

## Common Issues

1. **JWT_SECRET not set, SESSION_SECRET set:**
   - Token creation: uses SESSION_SECRET
   - Token verification: should also use SESSION_SECRET
   - ✅ Should work (now that we fixed the fallback logic)

2. **JWT_SECRET set, SESSION_SECRET not set:**
   - Token creation: uses JWT_SECRET
   - Token verification: uses JWT_SECRET
   - ✅ Should work

3. **Both set to different values:**
   - Token creation: uses JWT_SECRET (first in fallback)
   - Token verification: uses JWT_SECRET (first in fallback)
   - ✅ Should work (both use JWT_SECRET)

4. **Neither set:**
   - Token creation: uses default 'secret'
   - Token verification: uses default 'secret'
   - ⚠️ Works but insecure - should set a secret in production

