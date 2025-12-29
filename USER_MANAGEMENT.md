# User Management Guide

## How to Check Login Credentials

### Method 1: List All Users (Recommended)

Run this command from the project root:

```bash
cd server
npx tsx scripts/manageUsers.ts list
```

This will show:
- User ID
- Username
- Privilege level
- Creation date

**Note:** Passwords are hashed and cannot be viewed directly for security reasons.

### Method 2: Using Prisma Studio

```bash
cd server
npm run prisma:studio
```

This opens a web interface at http://localhost:5555 where you can:
- View all users
- See usernames (but passwords are hashed)
- Edit user data directly

### Method 3: Direct Database Query

If you have database access, you can query the `users` table directly. Passwords are hashed with bcrypt and cannot be decrypted.

## How to Change Login Credentials

### Method 1: Using the Management Script (Recommended)

**Change a user's password:**
```bash
cd server
npx tsx scripts/manageUsers.ts change <username> <newPassword>
```

**Example:**
```bash
npx tsx scripts/manageUsers.ts change admin newpassword123
```

**Create a new user:**
```bash
npx tsx scripts/manageUsers.ts create <username> <password>
```

**Delete a user:**
```bash
npx tsx scripts/manageUsers.ts delete <username>
```

### Method 2: Using the API (Change Your Own Password)

If you're logged in, you can change your own password via the API:

```bash
curl -X POST http://localhost:3001/api/auth/change-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "currentPassword": "oldpassword",
    "newPassword": "newpassword123"
  }'
```

### Method 3: Using Prisma Studio

1. Run `npm run prisma:studio` in the server directory
2. Navigate to the `users` table
3. Click on a user to edit
4. **Note:** You cannot directly edit hashed passwords here - use the script instead

## Default Credentials

If this is a fresh installation, you may need to create the first user:

```bash
cd server
npx tsx scripts/manageUsers.ts create admin admin123
```

Or use the registration endpoint:

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```

## Security Notes

- **Passwords are hashed** using bcrypt - they cannot be viewed in plain text
- **Minimum password length** is 6 characters
- **Usernames must be unique**
- Always use strong passwords in production
- Consider adding more user management features if needed (password reset, email verification, etc.)

## Troubleshooting

**"User not found" error:**
- Check the username spelling
- List all users first: `npx tsx scripts/manageUsers.ts list`

**"Authentication required" error:**
- Make sure you're logged in
- Check that your JWT token is valid
- Token expires after 7 days

**Can't remember your password:**
- Use the management script to reset it: `npx tsx scripts/manageUsers.ts change <username> <newPassword>`
- Or delete and recreate the user (if you have access)

