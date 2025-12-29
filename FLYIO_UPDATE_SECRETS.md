# How to Update Secrets in Fly.io

## Set/Update Secrets

To set or update secrets in Fly.io, use:

```bash
flyctl secrets set KEY=value -a APP_NAME
```

### Set Single Secret

```bash
flyctl secrets set JWT_SECRET=your-new-secret-value -a spin-master
```

### Set Multiple Secrets

```bash
flyctl secrets set JWT_SECRET=value1 SESSION_SECRET=value2 -a spin-master
```

## View Current Secrets

```bash
flyctl secrets list -a spin-master
```

**Note:** This shows the secret **names** but **not the values** (for security).

## Set Secrets from File (For Long Secrets)

If your secret is long or contains special characters, you can use a file:

```bash
# Create a file with your secret
echo "your-secret-value" > secret.txt

# Set from file
flyctl secrets set JWT_SECRET="$(cat secret.txt)" -a spin-master

# Clean up
rm secret.txt
```

Or use a heredoc:

```bash
flyctl secrets set JWT_SECRET="$(cat <<EOF
your-multi-line-secret-value
EOF
)" -a spin-master
```

## Unset (Remove) Secrets

```bash
flyctl secrets unset KEY -a APP_NAME
```

Example:
```bash
flyctl secrets unset SESSION_SECRET -a spin-master
```

## Important Notes

1. **Secrets trigger redeployment:** When you set or update secrets, Fly.io automatically redeploys your app with the new secrets.

2. **Secrets are encrypted:** Secrets are encrypted at rest and only decrypted when injected into your app's environment.

3. **No values shown:** `flyctl secrets list` only shows secret names, not values (for security).

4. **Special characters:** If your secret contains special characters, quote it:
   ```bash
   flyctl secrets set JWT_SECRET='my-secret!@#$' -a spin-master
   ```

5. **URL-encoding:** If your secret contains characters that might conflict with shell parsing, use quotes or URL-encode them.

## Example: Update JWT_SECRET

```bash
# 1. View current secrets (names only)
flyctl secrets list -a spin-master

# 2. Set new JWT_SECRET
flyctl secrets set JWT_SECRET=your-new-secret-value -a spin-master

# 3. Wait for redeployment (Fly.io does this automatically)
# Check status with:
flyctl status -a spin-master

# 4. Verify the new secret is being used (check logs)
flyctl logs -a spin-master | grep "jwtSecretHash"
```

## Generate a Secure Secret

To generate a secure random secret:

```bash
# Using OpenSSL
openssl rand -hex 32

# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Then set it
flyctl secrets set JWT_SECRET=$(openssl rand -hex 32) -a spin-master
```

## Troubleshooting

### Secret Not Being Read

If your app doesn't seem to be using the new secret:

1. **Check if secret is set:**
   ```bash
   flyctl secrets list -a spin-master
   ```

2. **Verify redeployment completed:**
   ```bash
   flyctl status -a spin-master
   ```

3. **Check app logs for secret hash:**
   ```bash
   flyctl logs -a spin-master | grep "jwtSecretHash"
   ```

4. **Restart the app (if needed):**
   ```bash
   flyctl apps restart spin-master
   ```

### Special Characters in Secrets

If your secret contains special characters that cause shell issues:

1. Use single quotes:
   ```bash
   flyctl secrets set JWT_SECRET='secret!@#$%' -a spin-master
   ```

2. Or escape them:
   ```bash
   flyctl secrets set JWT_SECRET=secret\!\@\#\$ -a spin-master
   ```

3. Or use a file (as shown above)

