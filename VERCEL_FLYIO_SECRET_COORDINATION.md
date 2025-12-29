# How Vercel and Fly.io Coordinate Secrets

## Important Clarification

**The frontend (Vercel) does NOT use JWT_SECRET at all!**

Only the backend (Fly.io) uses secrets. The frontend just receives, stores, and sends tokens.

## How Authentication Works

### 1. Login Flow

```
Frontend (Vercel)          Backend (Fly.io)
     |                           |
     |-- POST /auth/member/login |
     |   {email, password}       |
     |                           |
     |                           |-- Verify credentials
     |                           |-- Create token using JWT_SECRET
     |                           |-- Hash: ae152f68fd6edd74
     |                           |
     |<-- {token, member} -------|
     |                           |
     |-- Store token in localStorage
```

### 2. Authenticated Request Flow

```
Frontend (Vercel)          Backend (Fly.io)
     |                           |
     |-- GET /api/tournaments    |
     |   Authorization: Bearer <token>
     |                           |
     |                           |-- Verify token using JWT_SECRET
     |                           |-- Hash: ae152f68fd6edd74 (same!)
     |                           |
     |<-- {data} ----------------|
```

## Key Points

1. **Frontend has NO secrets**: Vercel doesn't need or use JWT_SECRET
2. **Backend uses JWT_SECRET**: Fly.io uses it to:
   - Sign tokens when user logs in
   - Verify tokens on API requests
3. **Token is just data**: The frontend stores the token (like a ticket) and sends it with requests

## Why Authentication Might Still Fail

Even though the secrets match now, if you have an **old token** in localStorage, it won't work because it was signed with a different secret.

### Solution: Log In Again

1. **Clear old token:**
   ```javascript
   localStorage.clear()
   ```

2. **Refresh page**

3. **Log in again** - this creates a new token with the current JWT_SECRET

4. **New token will work** because it's signed with the same secret that verification uses

## Environment Variables

### Vercel (Frontend) - NO JWT_SECRET Needed

Vercel only needs:
- `VITE_API_URL` - Points to Fly.io backend (e.g., `https://spin-master.fly.dev/api`)

No JWT_SECRET needed because frontend doesn't sign or verify tokens.

### Fly.io (Backend) - JWT_SECRET Required

Fly.io needs:
- `JWT_SECRET` - Used to sign and verify tokens
- `DATABASE_URL` - Database connection
- `CLIENT_URL` - Frontend URL for CORS (e.g., `https://your-app.vercel.app`)

## Verification Checklist

✅ **Secrets are configured correctly:**
- Fly.io logs show: `jwtSecretHash: "ae152f68fd6edd74"`
- Same hash for token creation and verification

✅ **Frontend is configured correctly:**
- `VITE_API_URL` points to Fly.io backend
- No JWT_SECRET needed in Vercel

❓ **Token might be old:**
- If you have an old token from before the secret was set correctly
- Solution: Clear localStorage and log in again

## Debugging Steps

1. **Check if token exists:**
   ```javascript
   localStorage.getItem('pingpong_token')
   ```

2. **If token exists, decode it:**
   ```javascript
   const token = localStorage.getItem('pingpong_token');
   const payload = JSON.parse(atob(token.split('.')[1]));
   console.log('Token created:', new Date(payload.iat * 1000));
   console.log('Token expires:', new Date(payload.exp * 1000));
   ```

3. **If token is old (before secret was fixed), clear it:**
   ```javascript
   localStorage.clear()
   ```

4. **Log in again to get a new token**

## Summary

- **Vercel**: No secrets needed, just stores/sends tokens
- **Fly.io**: Uses JWT_SECRET to sign/verify tokens
- **If auth fails**: Likely an old token, log in again to get a new one

